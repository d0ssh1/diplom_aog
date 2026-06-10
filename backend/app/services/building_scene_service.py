"""BuildingSceneService — stacked 3D building viewer orchestration (subfeature B).

Read-only orchestration behind ``GET /buildings/{id}/scene-3d``: load the building's
floors, and for each derive

- ``mesh_url`` — the static URL of its assembled GLB (``Floor.mesh_file_glb`` via
  ``FileStorage.uploads_url``), and
- ``placement`` — its 3D pose in the building (reference-floor) metric world frame,
  computed by the PURE ``processing.building_stack.floor_placement`` from subfeature A's
  ``Floor.building_transform`` (mask px) + the floor's ppm + mask dims + elevation.

Layer rules (``prompts/architecture.md``): this is a SERVICE — it owns the IO (DB via
repositories, mask dims via ``FileStorage`` + ``cv2``) and calls the PURE ``processing``
function with plain values. The reference floor IS the world origin by definition, so it is
placed at identity regardless of any stored transform (it may not be solved yet). Unsolved /
unlinked non-reference floors get ``placement=None`` (skipped in the scene, listed in the UI).

SHARED CONTRACT (from A, do NOT change): ``building_transform`` maps THIS floor's wall-mask
px → the REFERENCE (lowest) floor's wall-mask px; lowest = identity; ``None`` = unsolved.
``elevation_m = (number − min_number) × FLOOR_HEIGHT``.
"""

import logging
from typing import Optional

import cv2

from app.core.exceptions import (
    BuildingNotFoundError,
    FileStorageError,
    ImageProcessingError,
)
from app.core.floor_stitching_constants import FLOOR_HEIGHT, INTER_FLOOR_GAP_M
from app.db.repositories.building_repo import BuildingRepository
from app.db.repositories.floor_repo import FloorRepository
from app.models.building_scene import (
    BuildingScene3DResponse,
    ScenePlacement,
    SceneFloor,
)
from app.processing.building_stack import Placement3D, floor_placement
from app.services.file_storage import FileStorage

logger = logging.getLogger(__name__)


class BuildingSceneService:
    """Builds the stacked 3D scene payload for a building (read-only)."""

    def __init__(
        self,
        building_repo: BuildingRepository,
        floor_repo: FloorRepository,
        storage: FileStorage,
    ) -> None:
        self._building_repo = building_repo
        self._floor_repo = floor_repo
        self._storage = storage

    async def get_scene_3d(self, building_id: int) -> BuildingScene3DResponse:
        """Build the stacked 3D scene for a building.

        Args:
            building_id: the building to render.

        Returns:
            BuildingScene3DResponse — per-floor mesh URL + 3D placement (ordered by
            ``number`` ASC). Floors without a mesh or without a placement are still
            listed (the viewer skips them; the UI labels why).

        Raises:
            BuildingNotFoundError: building absent (404).
            ImageProcessingError: a mask file exists but cannot be decoded.
        """
        logger.debug("get_scene_3d: building_id=%d", building_id)
        building = await self._building_repo.get_by_id(building_id)
        if building is None:
            raise BuildingNotFoundError(building_id)

        floors = await self._floor_repo.list_by_building(building_id)
        if not floors:
            return BuildingScene3DResponse(
                building_id=building_id,
                reference_floor_id=None,
                floor_height_m=FLOOR_HEIGHT,
                floors=[],
            )

        # list_by_building is ordered by number ASC → floors[0] is the reference.
        min_number = floors[0].number
        reference_floor_id = floors[0].id
        ppm_ref = floors[0].pixels_per_meter
        ref_dims = self._floor_mask_dims(floors[0])
        mask_h_ref = ref_dims[1] if ref_dims else None

        scene_floors: list[SceneFloor] = []
        for floor in floors:
            # Stacking pitch clears the upper floor's slab off the lower floor's
            # walls (FLOOR_HEIGHT alone makes them intersect — see INTER_FLOOR_GAP_M).
            elevation = (floor.number - min_number) * (FLOOR_HEIGHT + INTER_FLOOR_GAP_M)
            has_mesh = floor.mesh_file_glb is not None
            mesh_url = (
                self._storage.uploads_url_versioned(floor.mesh_file_glb)
                if has_mesh
                else None
            )
            placement = self._placement_for(
                floor,
                is_reference=(floor.id == reference_floor_id),
                ppm_ref=ppm_ref,
                mask_h_ref=mask_h_ref,
                elevation=elevation,
            )
            scene_floors.append(
                SceneFloor(
                    floor_id=floor.id,
                    number=floor.number,
                    elevation_m=elevation,
                    has_mesh=has_mesh,
                    mesh_url=mesh_url,
                    placement=placement,
                )
            )

        return BuildingScene3DResponse(
            building_id=building_id,
            reference_floor_id=reference_floor_id,
            floor_height_m=FLOOR_HEIGHT,
            floors=scene_floors,
        )

    # ── Placement (delegates the math to the pure layer) ─────────────────────────

    def _placement_for(
        self,
        floor,  # type: ignore[no-untyped-def]
        is_reference: bool,
        ppm_ref: Optional[float],
        mask_h_ref: Optional[int],
        elevation: float,
    ) -> Optional[ScenePlacement]:
        """Derive a floor's ``ScenePlacement`` (or ``None``).

        The reference floor IS the world origin (identity) by definition — placed even
        before ``solve_stitch`` has run. Non-reference floors need this floor's + the
        reference's ppm and mask height to map px → metres; if any is missing, or the
        floor is unsolved (``building_transform is None``), the placement is ``None``.
        """
        if is_reference:
            return ScenePlacement(
                scale=1.0, rotation_y_rad=0.0, tx=0.0, ty=0.0, tz=0.0
            )

        ppm_self = floor.pixels_per_meter
        dims = self._floor_mask_dims(floor)
        mask_h_self = dims[1] if dims else None
        if (
            ppm_self is None
            or ppm_ref is None
            or mask_h_self is None
            or mask_h_ref is None
        ):
            return None

        placement = floor_placement(
            floor.building_transform,
            ppm_self=ppm_self,
            ppm_ref=ppm_ref,
            mask_h_self=mask_h_self,
            mask_h_ref=mask_h_ref,
            elevation_m=elevation,
        )
        return self._to_placement(placement)

    @staticmethod
    def _to_placement(p: Optional[Placement3D]) -> Optional[ScenePlacement]:
        """Map the pure ``Placement3D`` value object to the Pydantic response model."""
        if p is None:
            return None
        return ScenePlacement(
            scale=p.scale,
            rotation_y_rad=p.rotation_y_rad,
            tx=p.tx,
            ty=p.ty,
            tz=p.tz,
        )

    # ── IO seam (patched in service tests — Cyrillic-tmp caveat) ─────────────────

    def _floor_mask_dims(self, floor) -> Optional[tuple[int, int]]:  # type: ignore[no-untyped-def]
        """Return the floor's wall-mask pixel dims ``(W, H)``, or ``None``.

        Reads the persisted ``Floor.mask_file`` (``mask_file_id``) from storage. ``None``
        when the floor has no mask or the file is missing on disk (both EXPECTED — the
        floor just cannot be placed yet). An UNDECODABLE file is an UNEXPECTED
        ``ImageProcessingError``. This is the single IO seam service tests patch (no real
        image round-trip — Cyrillic-tmp caveat). Mirrors ``BuildingAssemblyService``.

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
