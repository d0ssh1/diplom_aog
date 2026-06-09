"""BuildingNavService — cross-floor routing + link review (subfeature D).

Orchestrates multifloor routing on the ``Building → Floor`` model: loads each
floor's persisted nav graph (the SAME ``uploads/nav/floor_{id}_nav.json`` files
``FloorNavService`` writes) + A's ``building_transform``, drives the PURE
``processing.multifloor_graph`` functions (project → match → merge → metric A*),
lays the route out in the shared **building frame** (06-pipeline-spec §5), and
reads/writes the operator's ``transition_overrides``.

Layer rules (``prompts/architecture.md``): this is a SERVICE — it owns ALL IO (DB
via repositories, nav JSON + masks via ``cv2``/disk) and calls PURE functions with
plain value objects. Mirrors ``FloorNavService``. Leaves the legacy recon-keyed
``nav_graph.merge_floor_graphs`` / ``find_multifloor_route_in_graph`` untouched.

SHARED A/B/D WORLD CONTRACT (06 §5): a route point on floor F is placed at
``[X_m, elevation_m(F) + 0.1, Y_m − ref_height_m]`` where ``(X_m, Y_m)`` is the §1
projection into reference-floor metres and ``ref_height_m = ref_mask_h / ppm_ref``.
B places each floor GLB at the SAME building-frame pose, so the route overlays the
meshes for any subset of visible floors.
"""

import json
import logging
import math
import os
from typing import Optional

import cv2

from app.core.exceptions import (
    BuildingNotFoundError,
    FloorNavGraphNotFoundError,
    FloorNotFoundError,
)
from app.core.floor_stitching_constants import (
    FLOOR_HEIGHT,
    MATCH_TOLERANCE_M,
    TRANSITION_COST_M,
)
from app.db.repositories.building_repo import BuildingRepository
from app.db.repositories.floor_repo import FloorRepository
from app.models.building_nav import (
    FloorPathSegment3D,
    MultifloorRouteResponse,
    SaveTransitionLinksResponse,
    TransitionLink,
    TransitionLinksResponse,
    TransitionOverride,
    TransitionUsed3D,
    UnmatchedTransition,
)
from app.processing.multifloor_graph import (
    FloorRouteEntry,
    TransitionLink as ProcLink,
    TransitionNode,
    find_multifloor_route_by_id,
    match_cross_floor_transitions,
    merge_floor_graphs_by_id,
    project_to_building_frame,
    transition_nodes_from_entry,
)
from app.processing.nav_graph import deserialize_nav_graph, find_route, los_prune
from app.services.file_storage import FileStorage

logger = logging.getLogger(__name__)

_NOT_ALIGNED_MSG = "Этажи не выровнены — выполните сборку здания"
_WALK_SPEED_MS = 1.2  # m/s, matching nav_service estimated-time convention


def _is_positive_finite(value: Optional[float]) -> bool:
    """True iff ``value`` is a real number that is finite and strictly positive."""
    return value is not None and math.isfinite(value) and value > 0


class BuildingNavService:
    """Cross-floor routing + transition-link management (read graphs, no writes)."""

    def __init__(
        self,
        building_repo: BuildingRepository,
        floor_repo: FloorRepository,
        storage: FileStorage,
        upload_dir: str,
    ) -> None:
        self._building_repo = building_repo
        self._floor_repo = floor_repo
        self._storage = storage
        self._nav_dir = os.path.join(upload_dir, "nav")

    # ── Route ────────────────────────────────────────────────────────────────

    async def find_multifloor_route(
        self,
        building_id: int,
        from_floor_id: int,
        from_room: str,
        to_floor_id: int,
        to_room: str,
    ) -> MultifloorRouteResponse:
        """Find the shortest cross-floor route as a building-frame 3D polyline.

        Args:
            building_id: building whose floors to route across.
            from_floor_id / from_room: start floor + room (bare or ``room_``-prefixed).
            to_floor_id / to_room: destination floor + room.

        Returns:
            MultifloorRouteResponse — ``status`` ∈ ``success`` | ``no_path`` |
            ``not_aligned`` (all HTTP 200); on success, per-floor 3D segments at
            each floor's elevation + the transitions traversed.

        Raises:
            BuildingNotFoundError: building absent (404).
            FloorNotFoundError: an endpoint floor not in this building (404).
            FloorNavGraphNotFoundError: an endpoint floor's nav graph not built (404).
            ValueError: endpoint room absent / floor mask dims unavailable (422).
        """
        logger.info(
            "find_multifloor_route: b=%d %d:%s → %d:%s",
            building_id, from_floor_id, from_room, to_floor_id, to_room,
        )
        building = await self._building_repo.get_by_id(building_id)
        if building is None:
            raise BuildingNotFoundError(building_id)

        floors = await self._floor_repo.list_by_building(building_id)
        if not floors:
            return MultifloorRouteResponse(
                status="no_path", message="В здании нет этажей"
            )
        floor_by_id = {f.id: f for f in floors}
        for fid in (from_floor_id, to_floor_id):
            if fid not in floor_by_id:
                raise FloorNotFoundError(fid)

        ref = floors[0]  # list_by_building is ordered by number ASC → lowest
        min_number = ref.number
        ppm_ref = ref.pixels_per_meter
        if not _is_positive_finite(ppm_ref):
            return MultifloorRouteResponse(
                status="not_aligned", message=_NOT_ALIGNED_MSG
            )
        ref_dims = self._floor_mask_dims(ref)
        if ref_dims is None:
            raise ValueError("floor mask dims unavailable for reference floor")
        ref_height_m = ref_dims[1] / ppm_ref

        # Endpoint floors MUST have a built graph (404 names the floor).
        for fid in (from_floor_id, to_floor_id):
            if not self._has_graph(fid):
                raise FloorNavGraphNotFoundError(fid)

        # ── Same-floor → single-floor 2D route, laid out in the building frame.
        if from_floor_id == to_floor_id:
            floor = floor_by_id[from_floor_id]
            if not self._is_aligned(floor, ref.id):
                return MultifloorRouteResponse(
                    status="not_aligned", message=_NOT_ALIGNED_MSG
                )
            entry = self._load_floor_entry(floor, min_number)
            return self._single_floor_response(
                entry, from_room, to_room, ppm_ref, ref_height_m
            )

        # ── Multi-floor: load every graph-bearing floor; all must be aligned.
        entries: list[FloorRouteEntry] = []
        for floor in floors:
            if not self._has_graph(floor.id):
                continue
            if not self._is_aligned(floor, ref.id):
                return MultifloorRouteResponse(
                    status="not_aligned", message=_NOT_ALIGNED_MSG
                )
            entries.append(self._load_floor_entry(floor, min_number))

        overrides = building.transition_overrides or []
        links = self._final_links_for_merge(entries, ppm_ref, overrides)
        merged = merge_floor_graphs_by_id(entries, links, TRANSITION_COST_M, ppm_ref)
        route = find_multifloor_route_by_id(
            merged, from_floor_id, from_room, to_floor_id, to_room
        )
        if route["status"] == "no_path":
            return MultifloorRouteResponse(
                status="no_path", message="Маршрут между этажами не найден"
            )

        entry_by_id = {e.floor_id: e for e in entries}
        segments: list[FloorPathSegment3D] = []
        for seg in route["path_segments"]:
            entry = entry_by_id.get(seg["floor_id"])
            if entry is None:
                continue
            segments.append(
                FloorPathSegment3D(
                    floor_id=seg["floor_id"],
                    floor_number=seg["floor_number"],
                    coordinates_3d=self._project_segment(
                        seg["coords_2d"], entry, ppm_ref, ref_height_m
                    ),
                )
            )

        transitions: list[TransitionUsed3D] = []
        for tr in route["transitions_used"]:
            fe = entry_by_id.get(tr["from_floor_id"])
            te = entry_by_id.get(tr["to_floor_id"])
            if fe is None or te is None or tr["from_pos"] is None or tr["to_pos"] is None:
                continue
            transitions.append(
                TransitionUsed3D(
                    type=tr["type"],
                    from_3d=self._project_point(tr["from_pos"], fe, ppm_ref, ref_height_m),
                    to_3d=self._project_point(tr["to_pos"], te, ppm_ref, ref_height_m),
                    from_floor_id=tr["from_floor_id"],
                    to_floor_id=tr["to_floor_id"],
                )
            )

        total_m = float(route["total_distance_m"])
        return MultifloorRouteResponse(
            status="success",
            total_distance_meters=round(total_m, 2),
            estimated_time_seconds=self._eta_seconds(total_m),
            path_segments=segments,
            transitions_used=transitions,
        )

    # ── Link review / override ───────────────────────────────────────────────

    async def list_links(self, building_id: int) -> TransitionLinksResponse:
        """Return auto-matched cross-floor links with overrides applied.

        Raises:
            BuildingNotFoundError: building absent (404).
            ValueError: a floor's mask dims unavailable (422).
        """
        logger.debug("list_links: building_id=%d", building_id)
        building = await self._building_repo.get_by_id(building_id)
        if building is None:
            raise BuildingNotFoundError(building_id)

        floors = await self._floor_repo.list_by_building(building_id)
        if not floors:
            return TransitionLinksResponse(building_id=building_id, status="not_aligned")
        ref = floors[0]
        ppm_ref = ref.pixels_per_meter
        if not _is_positive_finite(ppm_ref):
            return TransitionLinksResponse(building_id=building_id, status="not_aligned")
        number_by_id = {f.id: f.number for f in floors}

        entries: list[FloorRouteEntry] = []
        for floor in floors:
            if not self._has_graph(floor.id):
                continue
            if not self._is_aligned(floor, ref.id):
                return TransitionLinksResponse(
                    building_id=building_id, status="not_aligned"
                )
            entries.append(self._load_floor_entry(floor, ref.number))

        nodes = self._all_transition_nodes(entries, ppm_ref)
        auto, unmatched = match_cross_floor_transitions(nodes, MATCH_TOLERANCE_M)
        index = {(n.floor_id, n.node_id): n for n in nodes}
        overrides = building.transition_overrides or []
        disabled = {self._okey(o) for o in overrides if o.get("action") == "disable"}

        links: list[TransitionLink] = []
        auto_keys: set[tuple] = set()
        for lk in auto:
            key = (lk.lower_floor_id, lk.lower_node, lk.upper_floor_id, lk.upper_node)
            auto_keys.add(key)
            links.append(
                self._to_api_link(
                    lk, number_by_id, source="auto", enabled=(key not in disabled)
                )
            )
        for ovr in overrides:
            if ovr.get("action") != "force":
                continue
            key = self._okey(ovr)
            if key in auto_keys:
                continue  # forcing an already-auto link is a no-op
            forced = self._build_forced_link(ovr, index)
            if forced is None:
                continue
            links.append(
                self._to_api_link(forced, number_by_id, source="forced", enabled=True)
            )

        return TransitionLinksResponse(
            building_id=building_id,
            links=links,
            unmatched=[
                UnmatchedTransition(
                    floor_id=u.floor_id,
                    floor_number=u.floor_number,
                    node=u.node,
                    type=u.type,
                    reason=u.reason,
                )
                for u in unmatched
            ],
        )

    async def save_overrides(
        self, building_id: int, overrides: list[TransitionOverride]
    ) -> SaveTransitionLinksResponse:
        """Persist the full override set (validates ``force`` references).

        Raises:
            BuildingNotFoundError: building absent (404).
            ValueError: a ``force`` override names a missing node or mixes types (422).
        """
        logger.info(
            "save_overrides: building_id=%d, count=%d", building_id, len(overrides)
        )
        building = await self._building_repo.get_by_id(building_id)
        if building is None:
            raise BuildingNotFoundError(building_id)

        forced = [o for o in overrides if o.action == "force"]
        if forced:
            floors = await self._floor_repo.list_by_building(building_id)
            ppm_ref = floors[0].pixels_per_meter if floors else None
            index: dict[tuple[int, str], TransitionNode] = {}
            if floors and _is_positive_finite(ppm_ref):
                entries = [
                    self._load_floor_entry(f, floors[0].number)
                    for f in floors
                    if self._has_graph(f.id)
                ]
                index = {
                    (n.floor_id, n.node_id): n
                    for n in self._all_transition_nodes(entries, ppm_ref)
                }
            for ovr in forced:
                lo = index.get((ovr.lower_floor_id, ovr.lower_node))
                hi = index.get((ovr.upper_floor_id, ovr.upper_node))
                if lo is None or hi is None:
                    raise ValueError(
                        "force override references a node not in the graph"
                    )
                if lo.room_type != hi.room_type:
                    raise ValueError("force override links different transition types")

        await self._building_repo.update(
            building_id, transition_overrides=[o.model_dump() for o in overrides]
        )
        return SaveTransitionLinksResponse(
            building_id=building_id, overrides_count=len(overrides)
        )

    # ── Pure-ish helpers (matching / overrides) ──────────────────────────────

    @staticmethod
    def _all_transition_nodes(
        entries: list[FloorRouteEntry], ppm_ref: float
    ) -> list[TransitionNode]:
        """Flatten every floor's projected stair/elevator nodes (§1)."""
        nodes: list[TransitionNode] = []
        for entry in entries:
            nodes.extend(transition_nodes_from_entry(entry, ppm_ref))
        return nodes

    def _final_links_for_merge(
        self,
        entries: list[FloorRouteEntry],
        ppm_ref: float,
        overrides: list[dict],
    ) -> list[ProcLink]:
        """Auto-match minus ``disable`` plus ``force`` → the link set merge wires."""
        nodes = self._all_transition_nodes(entries, ppm_ref)
        auto, _ = match_cross_floor_transitions(nodes, MATCH_TOLERANCE_M)
        index = {(n.floor_id, n.node_id): n for n in nodes}
        disabled = {self._okey(o) for o in overrides if o.get("action") == "disable"}
        final = [
            lk
            for lk in auto
            if (lk.lower_floor_id, lk.lower_node, lk.upper_floor_id, lk.upper_node)
            not in disabled
        ]
        for ovr in overrides:
            if ovr.get("action") != "force":
                continue
            forced = self._build_forced_link(ovr, index)
            if forced is not None:
                final.append(forced)
        return final

    @staticmethod
    def _okey(ovr: dict) -> tuple:
        """Override identity key (lower + upper floor/node)."""
        return (
            ovr.get("lower_floor_id"),
            ovr.get("lower_node"),
            ovr.get("upper_floor_id"),
            ovr.get("upper_node"),
        )

    @staticmethod
    def _build_forced_link(
        ovr: dict, index: dict[tuple[int, str], TransitionNode]
    ) -> Optional[ProcLink]:
        """Build a forced ``ProcLink`` from an override, or ``None`` if invalid."""
        lo = index.get((ovr.get("lower_floor_id"), ovr.get("lower_node")))
        hi = index.get((ovr.get("upper_floor_id"), ovr.get("upper_node")))
        if lo is None or hi is None:
            return None
        d = math.hypot(lo.x_m - hi.x_m, lo.y_m - hi.y_m)
        return ProcLink(
            lower_floor_id=lo.floor_id,
            lower_node=lo.node_id,
            upper_floor_id=hi.floor_id,
            upper_node=hi.node_id,
            type=lo.room_type,
            source="forced",
            distance_m=round(d, 4),
        )

    @staticmethod
    def _to_api_link(
        lk: ProcLink,
        number_by_id: dict[int, int],
        source: str,
        enabled: bool,
    ) -> TransitionLink:
        """Map a pure ``ProcLink`` to the API ``TransitionLink`` (adds floor numbers)."""
        return TransitionLink(
            lower_floor_id=lk.lower_floor_id,
            lower_floor_number=number_by_id.get(lk.lower_floor_id, 0),
            lower_node=lk.lower_node,
            upper_floor_id=lk.upper_floor_id,
            upper_floor_number=number_by_id.get(lk.upper_floor_id, 0),
            upper_node=lk.upper_node,
            type=lk.type,
            source=source,
            enabled=enabled,
            distance_m=lk.distance_m,
        )

    # ── 3D layout (building frame, 06 §5) ────────────────────────────────────

    def _single_floor_response(
        self,
        entry: FloorRouteEntry,
        from_room: str,
        to_room: str,
        ppm_ref: float,
        ref_height_m: float,
    ) -> MultifloorRouteResponse:
        """Route within one floor, then lay it out in the building frame (§5)."""
        graph = entry.graph
        fn = from_room if from_room.startswith("room_") else f"room_{from_room}"
        tn = to_room if to_room.startswith("room_") else f"room_{to_room}"
        for node, raw in ((fn, from_room), (tn, to_room)):
            if node not in graph.nodes:
                raise ValueError(f"Комната '{raw}' не найдена в графе")

        route = find_route(graph, fn, tn)
        if route is None:
            return MultifloorRouteResponse(
                status="no_path", message="Маршрут на этаже не найден"
            )
        coords_3d = self._project_segment(
            route["path_coords_2d"], entry, ppm_ref, ref_height_m
        )
        total_m = float(route["total_distance_px"]) * entry.scale_factor
        return MultifloorRouteResponse(
            status="success",
            total_distance_meters=round(total_m, 2),
            estimated_time_seconds=self._eta_seconds(total_m),
            path_segments=[
                FloorPathSegment3D(
                    floor_id=entry.floor_id,
                    floor_number=entry.floor_number,
                    coordinates_3d=coords_3d,
                )
            ],
            transitions_used=[],
        )

    def _project_segment(
        self,
        coords_2d: list,
        entry: FloorRouteEntry,
        ppm_ref: float,
        ref_height_m: float,
    ) -> list[list[float]]:
        """LOS-straighten (optional) then project a floor's 2D path to 3D (§5)."""
        pruned = self._maybe_los_prune(coords_2d, entry)
        return [
            self._project_point(pt, entry, ppm_ref, ref_height_m) for pt in pruned
        ]

    def _project_point(
        self,
        pos_canvas,
        entry: FloorRouteEntry,
        ppm_ref: float,
        ref_height_m: float,
    ) -> list[float]:
        """One canvas-px point → building-frame world ``[X_m, elev+0.1, Y_m−ref_h]``."""
        k = entry.nav_mask_w / entry.floor_mask_w if entry.floor_mask_w else 0.0
        x_m, y_m = project_to_building_frame(
            (float(pos_canvas[0]), float(pos_canvas[1])),
            k,
            entry.building_transform,
            ppm_ref,
        )
        return [
            round(x_m, 4),
            round(entry.elevation_m + 0.1, 4),
            round(y_m - ref_height_m, 4),
        ]

    def _maybe_los_prune(self, coords_2d: list, entry: FloorRouteEntry) -> list:
        """Best-effort wall-aware straightening against the persisted floor mask.

        Mirrors ``FloorNavService.find_floor_route``: the ``shape==`` guard is
        wall-safety (``los_prune`` treats OOB px as "not wall", so a stale/smaller
        mask could cut through a wall). Missing/mismatched mask → keep the input.
        """
        try:
            mask = cv2.imread(
                self._floor_mask_path(entry.floor_id), cv2.IMREAD_GRAYSCALE
            )
            if mask is not None and mask.shape == (entry.nav_mask_h, entry.nav_mask_w):
                return los_prune(coords_2d, mask)
        except Exception:
            pass
        return coords_2d

    @staticmethod
    def _eta_seconds(distance_m: float) -> int:
        """Walking time at 1.2 m/s (nav_service convention)."""
        return int(round(distance_m / _WALK_SPEED_MS)) if distance_m else 0

    # ── IO seams (read-only; patched in service tests) ───────────────────────

    @staticmethod
    def _is_aligned(floor, reference_floor_id: int) -> bool:  # type: ignore[no-untyped-def]
        """A floor is aligned if it IS the reference or carries a building_transform."""
        return floor.id == reference_floor_id or floor.building_transform is not None

    def _nav_path(self, floor_id: int) -> str:
        """Read path of a floor's nav JSON (no makedirs — read-only service)."""
        return os.path.join(self._nav_dir, f"floor_{floor_id}_nav.json")

    def _floor_mask_path(self, floor_id: int) -> str:
        """Read path of a floor's persisted assembled wall mask PNG."""
        return os.path.join(self._nav_dir, f"floor_{floor_id}_mask.png")

    def _has_graph(self, floor_id: int) -> bool:
        """True iff the floor's nav graph JSON has been built + persisted."""
        return os.path.exists(self._nav_path(floor_id))

    def _load_floor_entry(  # type: ignore[no-untyped-def]
        self, floor, min_number: int
    ) -> FloorRouteEntry:
        """Read a floor's nav graph + dims into a ``FloorRouteEntry``.

        Assumes ``_has_graph(floor.id)`` (caller checks). Raises ``ValueError`` if
        the floor's mask dims are unavailable (cannot reconcile ``k`` → 422).
        """
        with open(self._nav_path(floor.id)) as f:
            graph, meta = deserialize_nav_graph(json.load(f))
        dims = self._floor_mask_dims(floor)
        if dims is None:
            raise ValueError(
                f"floor mask dims unavailable for floor {floor.id}"
            )
        return FloorRouteEntry(
            floor_id=floor.id,
            floor_number=floor.number,
            graph=graph,
            scale_factor=meta["scale_factor"],
            nav_mask_w=meta["mask_width"],
            nav_mask_h=meta["mask_height"],
            floor_mask_w=dims[0],
            floor_mask_h=dims[1],
            building_transform=floor.building_transform,
            elevation_m=(floor.number - min_number) * FLOOR_HEIGHT,
        )

    def _floor_mask_dims(self, floor) -> Optional[tuple[int, int]]:  # type: ignore[no-untyped-def]
        """Floor wall-mask dims ``(W, H)`` from ``Floor.mask_file``, or ``None``.

        Mirrors ``BuildingAssemblyService`` / ``BuildingSceneService``: ``None`` when
        the floor has no mask or the file is missing (EXPECTED); an undecodable file
        is an UNEXPECTED ``ImageProcessingError``. The single IO seam service tests
        patch (Cyrillic-tmp caveat).
        """
        from app.core.exceptions import FileStorageError, ImageProcessingError

        mask_file_id = getattr(floor, "mask_file_id", None)
        if not mask_file_id:
            return None
        try:
            mask_path = self._storage.find_file(mask_file_id, "masks")
        except FileStorageError:
            return None
        image = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ImageProcessingError(
                "floor_mask_dims", f"Failed to read floor mask: {mask_path}"
            )
        h, w = image.shape[:2]
        return (w, h)
