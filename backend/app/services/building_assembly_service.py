"""BuildingAssemblyService — vertical floor-stitching orchestration (subfeature A).

Implements the three use cases of vertical floor stitching:

- UC1 ``save_stitch_points`` — persist the anchor points for an adjacent pair
  (stored on the UPPER floor's row).
- UC2 ``solve_stitch`` — solve every adjacent pair with the PURE Umeyama solver
  (``processing.registration.solve_similarity``), compose the chain into one
  building frame with the PURE ``processing.floor_stack.compose_chain_transforms``
  (lowest floor = identity), and persist each floor's ``building_transform``.
- UC3 ``get_assembly`` — read the assembly state that drives the building-assembly
  page (per-floor mask, dims, elevation, points + transform + pair status).

Layer rules (``prompts/architecture.md``): this is a SERVICE — it owns ALL IO
(DB via repositories, masks via ``FileStorage`` + ``cv2``) and calls the PURE
``processing`` functions with plain numpy arrays / value objects. The solver and
the chain composer know nothing about IDs, normalisation, files or the DB.

SHARED B/D CONTRACT (do NOT change — plan/README): ``building_transform`` maps
THIS floor's wall-mask pixels → the REFERENCE (lowest) floor's wall-mask pixels;
lowest floor = identity; ``None`` = unsolved/unlinked. ``get_assembly`` MUST
expose each floor's ``mask_width``/``mask_height`` (D recovers its canvas factor
``k`` from them). De-normalisation uses each floor's OWN mask dims (ADR-3).
"""

import logging
import math
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from app.core.exceptions import (
    BuildingNotFoundError,
    FileStorageError,
    FloorAssemblyConflictError,
    FloorNotFoundError,
    ImageProcessingError,
)
from app.core.floor_stitching_constants import (
    FLOOR_HEIGHT,
    MIN_CONTROL_POINTS,
    R_MIN_BASELINE_FRAC,
)
from app.db.repositories.building_repo import BuildingRepository
from app.db.repositories.floor_repo import FloorRepository
from app.models.building_assembly import (
    AssemblyFloor,
    BuildingAssemblyResponse,
    ControlPoint,
    FloorStitchStatus,
    SaveStitchPointsResponse,
    SolveStitchResponse,
    StitchTransform,
)
from app.processing.floor_stack import (
    SimilarityT,
    compose_chain_transforms,
    identity,
)
from app.processing.registration import (
    DegenerateControlPointsError,
    solve_similarity,
)
from app.services.file_storage import FileStorage

logger = logging.getLogger(__name__)


# ── Internal per-pair solve record (atomicity — compute, THEN persist) ───────────


@dataclass
class _PairSolve:
    """Per-floor solve outcome held in memory before the single persist pass.

    A floor's record holds its OWN pair status (the pair linking it to the floor
    below), the pair transform (upper→lower, or ``None``), and the per-pair
    quality (``residual_rms_px`` / ``n_points``) surfaced on the floor's
    ``building_transform``. The reference (lowest) floor has ``status="reference"``
    and an identity pair transform.
    """

    floor_id: int
    number: int
    status: str  # "reference" | "ok" | "needs_points" | "degenerate" | "no_mask"
    pair_transform: Optional[SimilarityT]
    residual_rms_px: float
    n_points: int
    pixels_per_meter: Optional[float]


class BuildingAssemblyService:
    """Building-level vertical-stitch orchestration (UC1/UC2/UC3)."""

    def __init__(
        self,
        building_repo: BuildingRepository,
        floor_repo: FloorRepository,
        storage: FileStorage,
    ) -> None:
        self._building_repo = building_repo
        self._floor_repo = floor_repo
        self._storage = storage

    # ── UC1 — save anchor points ─────────────────────────────────────────────

    async def save_stitch_points(
        self,
        floor_id: int,
        points: list[ControlPoint],
        ref_points: list[ControlPoint],
    ) -> SaveStitchPointsResponse:
        """Persist the anchor points for the pair (this floor ↔ the floor below).

        The pairing rule (id sets equal), cap and coord range are enforced upstream
        by ``SaveStitchPointsRequest`` (Phase 3). This method enforces the floor-
        level precondition: the floor must NOT be the lowest in its building (there
        is no floor below to reference).

        Args:
            floor_id: the UPPER (moving) floor of the pair.
            points: anchor points on THIS floor's mask (validated).
            ref_points: matching points on the floor BELOW's mask (validated).

        Returns:
            SaveStitchPointsResponse with the persisted counts.

        Raises:
            FloorNotFoundError: floor absent (404).
            FloorAssemblyConflictError: floor is the lowest in its building (409).
        """
        logger.info(
            "save_stitch_points: floor_id=%d, points=%d, ref_points=%d",
            floor_id,
            len(points),
            len(ref_points),
        )
        floor = await self._floor_repo.get_by_id(floor_id)
        if floor is None:
            raise FloorNotFoundError(floor_id)

        siblings = await self._floor_repo.list_by_building(floor.building_id)
        min_number = min(f.number for f in siblings)
        if floor.number == min_number:
            raise FloorAssemblyConflictError(
                "Floor is the lowest in its building — no floor below to reference"
            )

        await self._floor_repo.update_stitch_points(
            floor_id,
            [p.model_dump() for p in points],
            [p.model_dump() for p in ref_points],
        )

        return SaveStitchPointsResponse(
            floor_id=floor_id,
            points_count=len(points),
            ref_points_count=len(ref_points),
        )

    # ── UC2 — solve + compose ────────────────────────────────────────────────

    async def solve_stitch(self, building_id: int) -> SolveStitchResponse:
        """Solve every adjacent pair and compose per-floor building transforms.

        Atomicity (ADR / ``test_solve_persist_is_atomic``): ALL computation
        happens first — load every mask's dims, run every ``solve_similarity``,
        compose the chain — into an in-memory list. Expected per-pair failures
        (< 3 points, degenerate, missing mask) are recorded as STATUSES, not
        exceptions. Only AFTER the full pass is anything persisted, so the building
        is never left half-solved. An UNEXPECTED error (mask decode failure) aborts
        before any write.

        Args:
            building_id: building whose floors to stitch.

        Returns:
            SolveStitchResponse with per-floor status, transform and elevation.

        Raises:
            BuildingNotFoundError: building absent (404).
            FloorAssemblyConflictError: fewer than two floors (409).
            ImageProcessingError: a mask file exists but cannot be decoded
                (aborts before any persist).
        """
        logger.info("solve_stitch: building_id=%d", building_id)
        building = await self._building_repo.get_by_id(building_id)
        if building is None:
            raise BuildingNotFoundError(building_id)

        floors = await self._floor_repo.list_by_building(building_id)
        if len(floors) < 2:
            raise FloorAssemblyConflictError("Building needs >= 2 floors to stitch")

        # ── PASS 1: pure computation into in-memory records (no persistence) ──
        min_number = floors[0].number  # list_by_building is ordered by number ASC
        reference_floor_id = floors[0].id

        # Mask dims per floor (None when the floor has no wall mask). A decode
        # failure here is UNEXPECTED → propagates and aborts before any write.
        mask_dims: list[Optional[tuple[int, int]]] = [
            self._floor_mask_dims(f) for f in floors
        ]

        solves: list[_PairSolve] = [
            _PairSolve(
                floor_id=floors[0].id,
                number=floors[0].number,
                status="reference",
                pair_transform=identity(),
                residual_rms_px=0.0,
                n_points=0,
                pixels_per_meter=floors[0].pixels_per_meter,
            )
        ]

        for i in range(1, len(floors)):
            upper = floors[i]
            lower = floors[i - 1]
            solves.append(
                self._solve_pair(
                    upper=upper,
                    lower=lower,
                    upper_dims=mask_dims[i],
                    lower_dims=mask_dims[i - 1],
                )
            )

        # ── Compose the chain (pure). pair_transforms[i] maps floor i+1 → floor i.
        pair_transforms: list[Optional[SimilarityT]] = [
            s.pair_transform for s in solves[1:]
        ]
        composed = compose_chain_transforms(pair_transforms, n_floors=len(floors))

        # ── PERSIST: only after the full pass succeeded (atomic). ──
        for floor, comp in zip(floors, composed):
            await self._floor_repo.update_building_transform(
                floor.id, self._similarity_to_dict(comp, floor, solves)
            )

        # ── Build the response. ──
        statuses: list[FloorStitchStatus] = []
        for solve, comp in zip(solves, composed):
            transform = self._build_stitch_transform(comp, solve)
            residual_m = self._residual_in_metres(solve)
            statuses.append(
                FloorStitchStatus(
                    floor_id=solve.floor_id,
                    number=solve.number,
                    status=solve.status,  # type: ignore[arg-type]
                    building_transform=transform,
                    residual_rms_m=residual_m,
                    elevation_m=(solve.number - min_number) * FLOOR_HEIGHT,
                )
            )

        return SolveStitchResponse(
            building_id=building_id,
            reference_floor_id=reference_floor_id,
            floors=statuses,
        )

    def _solve_pair(
        self,
        upper,  # type: ignore[no-untyped-def]
        lower,  # type: ignore[no-untyped-def]
        upper_dims: Optional[tuple[int, int]],
        lower_dims: Optional[tuple[int, int]],
    ) -> _PairSolve:
        """Solve ONE adjacent pair (upper→lower); PURE of persistence.

        De-normalises the upper floor's ``stitch_points`` by the UPPER mask dims
        and its ``stitch_ref_points`` by the LOWER mask dims — each by its OWN dims
        (ADR-3). Returns a ``_PairSolve`` record; never writes to the DB. Raises
        only on UNEXPECTED errors; expected failures are encoded as statuses.
        """
        base = _PairSolve(
            floor_id=upper.id,
            number=upper.number,
            status="needs_points",
            pair_transform=None,
            residual_rms_px=0.0,
            n_points=0,
            pixels_per_meter=upper.pixels_per_meter,
        )

        # A pair needs BOTH masks to de-normalise its two point sets.
        if upper_dims is None or lower_dims is None:
            base.status = "no_mask"
            return base

        # Pair points by id: stitch_points (upper) ↔ stitch_ref_points (lower).
        upper_local = self._points_by_id(upper.stitch_points)
        lower_local = self._points_by_id(upper.stitch_ref_points)
        matched_ids = [pid for pid in upper_local if pid in lower_local]

        if len(matched_ids) < MIN_CONTROL_POINTS:
            base.status = "needs_points"
            return base

        w_u, h_u = upper_dims
        w_l, h_l = lower_dims
        # src = upper-floor pixels, dst = lower-floor pixels → transform U→L.
        src = np.array(
            [
                [upper_local[pid][0] * w_u, upper_local[pid][1] * h_u]
                for pid in matched_ids
            ],
            dtype=np.float64,
        )
        dst = np.array(
            [
                [lower_local[pid][0] * w_l, lower_local[pid][1] * h_l]
                for pid in matched_ids
            ],
            dtype=np.float64,
        )

        min_baseline_px = R_MIN_BASELINE_FRAC * math.hypot(w_u, h_u)
        try:
            result = solve_similarity(src, dst, min_baseline_px)
        except DegenerateControlPointsError as exc:
            logger.info("pair upper floor %d degenerate: %s", upper.id, exc.reason)
            base.status = "degenerate"
            return base

        base.status = "ok"
        base.pair_transform = SimilarityT(
            scale=result.scale,
            rotation_rad=result.rotation_rad,
            tx=result.tx,
            ty=result.ty,
        )
        base.residual_rms_px = result.residual_rms
        base.n_points = result.n_points
        return base

    # ── UC3 — assembly read ──────────────────────────────────────────────────

    async def get_assembly(self, building_id: int) -> BuildingAssemblyResponse:
        """Read the assembly state for the building-assembly page.

        Per floor returns ``mask_url`` (from ``Floor.mask_file``), ``mask_width``/
        ``mask_height`` (REQUIRED for D's ``k``), ``pixels_per_meter``,
        ``elevation_m``, point counts, the persisted ``building_transform`` and a
        ``pair_status``. Floors are re-fetched via ``get_by_id`` so ``mask_file``
        is eager-loaded for the URL.

        Args:
            building_id: building to read.

        Returns:
            BuildingAssemblyResponse — the assembly-page payload.

        Raises:
            BuildingNotFoundError: building absent (404).
            ImageProcessingError: a mask file exists but cannot be decoded.
        """
        logger.debug("get_assembly: building_id=%d", building_id)
        building = await self._building_repo.get_by_id(building_id)
        if building is None:
            raise BuildingNotFoundError(building_id)

        floor_rows = await self._floor_repo.list_by_building(building_id)
        if not floor_rows:
            return BuildingAssemblyResponse(
                building_id=building_id,
                reference_floor_id=None,
                floors=[],
            )

        min_number = floor_rows[0].number
        reference_floor_id = floor_rows[0].id

        assembly_floors: list[AssemblyFloor] = []
        for floor in floor_rows:
            # Re-fetch for the eager-loaded mask_file relationship (URL).
            detailed = await self._floor_repo.get_by_id(floor.id)
            row = detailed if detailed is not None else floor
            dims = self._floor_mask_dims(row)
            mask_w = dims[0] if dims else None
            mask_h = dims[1] if dims else None
            transform = (
                StitchTransform(**row.building_transform)
                if row.building_transform
                else None
            )
            assembly_floors.append(
                AssemblyFloor(
                    id=row.id,
                    number=row.number,
                    mask_url=self._floor_mask_url(row),
                    mask_width=mask_w,
                    mask_height=mask_h,
                    pixels_per_meter=row.pixels_per_meter,
                    elevation_m=(row.number - min_number) * FLOOR_HEIGHT,
                    points_count=len(row.stitch_points or []),
                    ref_points_count=len(row.stitch_ref_points or []),
                    points=self._stored_points(row.stitch_points),
                    ref_points=self._stored_points(row.stitch_ref_points),
                    building_transform=transform,
                    pair_status=self._pair_status(
                        row,
                        is_reference=(row.id == reference_floor_id),
                        has_mask=dims is not None,
                    ),
                )
            )

        return BuildingAssemblyResponse(
            building_id=building_id,
            reference_floor_id=reference_floor_id,
            floors=assembly_floors,
        )

    # ── Pure helpers (mapping) ───────────────────────────────────────────────

    @staticmethod
    def _stored_points(raw_points) -> list[ControlPoint]:  # type: ignore[no-untyped-def]
        """Convert a stored ``[{id,x,y}]`` point list to ``ControlPoint`` models.

        Defensive: skips any malformed / out-of-range entry rather than 500-ing the
        whole assembly read (the points were validated on write, but legacy blobs
        may predate the current rules). Used by ``get_assembly`` so the editor can
        redraw saved anchors on reload.
        """
        out: list[ControlPoint] = []
        for p in raw_points or []:
            if not isinstance(p, dict):
                continue
            try:
                out.append(
                    ControlPoint(id=str(p["id"]), x=float(p["x"]), y=float(p["y"]))
                )
            except (KeyError, ValueError, TypeError):
                continue
        return out

    @staticmethod
    def _points_by_id(raw_points) -> dict[str, tuple[float, float]]:  # type: ignore[no-untyped-def]
        """Index a stored ``[{id,x,y}]`` point list by id (read-only)."""
        out: dict[str, tuple[float, float]] = {}
        for p in raw_points or []:
            if isinstance(p, dict) and p.get("id") is not None:
                out[str(p["id"])] = (float(p["x"]), float(p["y"]))
        return out

    @staticmethod
    def _similarity_to_dict(
        comp: Optional[SimilarityT],
        floor,  # type: ignore[no-untyped-def]
        solves: list[_PairSolve],
    ) -> Optional[dict]:
        """Build the ``building_transform`` JSON dict to persist for a floor.

        ``None`` (unsolved / chain break) clears any stale transform. The
        ``scale/rotation_rad/tx/ty`` come from the COMPOSED chain transform; the
        per-pair ``residual_rms_px``/``n_points`` come from the floor's own pair
        record (the link to the floor below). Reference floor → identity + zeros.
        """
        if comp is None:
            return None
        solve = next((s for s in solves if s.floor_id == floor.id), None)
        residual = solve.residual_rms_px if solve else 0.0
        n_points = solve.n_points if solve else 0
        return {
            "scale": comp.scale,
            "rotation_rad": comp.rotation_rad,
            "tx": comp.tx,
            "ty": comp.ty,
            "residual_rms_px": residual,
            "n_points": n_points,
        }

    @staticmethod
    def _build_stitch_transform(
        comp: Optional[SimilarityT],
        solve: _PairSolve,
    ) -> Optional[StitchTransform]:
        """Build the response ``StitchTransform`` from a composed transform.

        Mirrors ``_similarity_to_dict`` but for the response model. ``None`` when
        the floor has no building-frame transform (unsolved / cut off below).
        """
        if comp is None:
            return None
        return StitchTransform(
            scale=comp.scale,
            rotation_rad=comp.rotation_rad,
            tx=comp.tx,
            ty=comp.ty,
            residual_rms_px=solve.residual_rms_px,
            n_points=solve.n_points,
        )

    @staticmethod
    def _residual_in_metres(solve: _PairSolve) -> Optional[float]:
        """Convert a pair's pixel residual to metres via the floor's ppm.

        ``None`` for the reference floor (zero residual) or when no positive ppm
        is available. ``residual_rms_m = residual_rms_px / pixels_per_meter``.
        """
        if solve.status == "reference":
            return 0.0
        if solve.status != "ok":
            return None
        ppm = solve.pixels_per_meter
        if ppm is None or not math.isfinite(ppm) or ppm <= 0:
            return None
        return solve.residual_rms_px / ppm

    @staticmethod
    def _pair_status(
        floor,  # type: ignore[no-untyped-def]
        is_reference: bool,
        has_mask: bool,
    ) -> str:
        """Derive a floor's ``pair_status`` for the assembly read (read-only state).

        ``reference`` for the lowest floor; ``no_mask`` if its wall mask is
        missing; ``ok`` if a ``building_transform`` is persisted; ``needs_points``
        if fewer than ``MIN_CONTROL_POINTS`` paired points are stored; else
        ``unsolved`` (points present but solve not run / chain broken below).
        """
        if is_reference:
            return "reference"
        if not has_mask:
            return "no_mask"
        if floor.building_transform:
            return "ok"
        upper = floor.stitch_points or []
        lower = floor.stitch_ref_points or []
        paired = len({str(p["id"]) for p in upper if isinstance(p, dict)} &
                     {str(p["id"]) for p in lower if isinstance(p, dict)})
        if paired < MIN_CONTROL_POINTS:
            return "needs_points"
        return "unsolved"

    # ── IO seams (patched in service tests — Cyrillic-tmp caveat) ────────────

    def _floor_mask_dims(self, floor) -> Optional[tuple[int, int]]:  # type: ignore[no-untyped-def]
        """Return the floor's wall-mask pixel dims ``(W, H)``, or ``None``.

        Reads the persisted ``Floor.mask_file`` (``mask_file_id``) from storage.
        ``None`` when the floor has no mask or the file is missing on disk (both
        EXPECTED — the floor just can't be aligned yet). An UNDECODABLE file is an
        UNEXPECTED ``ImageProcessingError``. This is the single IO seam service
        tests patch (no real image round-trip — Cyrillic-tmp caveat).

        Raises:
            ImageProcessingError: the mask file exists but cannot be decoded.
        """
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

    @staticmethod
    def _floor_mask_url(floor) -> Optional[str]:  # type: ignore[no-untyped-def]
        """Viewable URL of the floor's persisted wall mask, or ``None``.

        Mirrors ``FloorService.get_by_id``'s ``mask_file_url`` derivation.
        """
        mask_file = getattr(floor, "mask_file", None)
        if getattr(floor, "mask_file_id", None) and mask_file is not None:
            return mask_file.url
        return None
