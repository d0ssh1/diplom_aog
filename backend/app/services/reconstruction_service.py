import glob
import json
import logging
import os
from typing import List, Optional

import cv2

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.db.models.reconstruction import Reconstruction
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.models.domain import (
    Point2D,
    TextBlock,
    VectorizationResult,
    Wall,
)
from app.processing.contours import ContourService
from app.processing.pipeline import (
    assign_room_numbers,
    classify_rooms,
    compute_scale_factor,
    compute_wall_thickness,
    door_detect,
    normalize_coords,
    room_detect,
)
from app.core.config import settings
from app.processing.mesh_builder import build_mesh_from_mask

logger = logging.getLogger(__name__)

# Single source of truth for status display
STATUS_DISPLAY: dict[int, str] = {
    1: "Создано",
    2: "Построение 3D модели...",
    3: "Готово",
    4: "Ошибка",
}


class ReconstructionService:
    def __init__(
        self,
        repo: ReconstructionRepository,
        upload_dir: str,
    ) -> None:
        self._repo = repo
        self._upload_dir = upload_dir
        self._models_dir = os.path.join(upload_dir, "models")
        os.makedirs(self._models_dir, exist_ok=True)
        self._contour_service = ContourService(os.path.join(upload_dir, "contours"))

    async def build_mesh(
        self,
        plan_file_id: str,
        mask_file_id: str,
        user_id: int,
        text_blocks: Optional[List[TextBlock]] = None,
        image_size_original: Optional[tuple] = None,
        crop_rect: Optional[dict] = None,
        crop_applied: bool = False,
        rotation_angle: int = 0,
    ) -> Reconstruction:
        """Full pipeline: create record → load mask → vectorize → build mesh → export → update DB.
        """
        # 1. Create reconstruction record with status=2 (processing)
        reconstruction = await self._repo.create_reconstruction(
            plan_file_id, mask_file_id, user_id, status=2
        )
        logger.info(
            "Created reconstruction record: id=%d, plan=%s, mask=%s",
            reconstruction.id,
            plan_file_id,
            mask_file_id,
        )

        try:
            # 2. Find mask on disk
            mask_glob = os.path.join(self._upload_dir, "masks", f"{mask_file_id}.*")
            mask_files = glob.glob(mask_glob)
            if not mask_files:
                raise FileStorageError(mask_file_id, mask_glob)
            mask_path = mask_files[0]
            logger.info("Mask file found: %s", mask_path)

            # 3. Load mask as grayscale
            mask_array = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            if mask_array is None:
                raise ImageProcessingError("cv2.imread", f"Failed to load mask: {mask_path}")

            h, w = mask_array.shape
            image_size = (w, h)

            # Step 7a: Extract walls via ContourService
            # Use all non-noise elements as wall contours for mesh building
            elements = self._contour_service.extract_elements(mask_array)
            wall_elements = [e for e in elements if e.element_type not in ("noise",)]

            walls: List[Wall] = []
            for i, elem in enumerate(wall_elements):
                points = [
                    Point2D(
                        x=max(0.0, min(1.0, float(pt[0][0]) / w)),
                        y=max(0.0, min(1.0, float(pt[0][1]) / h)),
                    )
                    for pt in elem.contour
                ]
                if len(points) >= 3:
                    walls.append(Wall(id=f"wall_{i}", points=points, thickness=0.2))

            # Step 7b: Compute wall thickness
            wall_thickness_px = compute_wall_thickness(mask_array)

            # Step 7c: Detect rooms
            rooms = room_detect(mask_array)

            # Step 7d: Classify rooms
            rooms = classify_rooms(rooms)

            # Step 7e: Detect doors
            doors = door_detect(mask_array, rooms)

            # Load text blocks from mask pipeline if not provided
            if not text_blocks:
                text_json_path = os.path.join(
                    self._upload_dir, "masks", f"{mask_file_id}_text.json"
                )
                if os.path.exists(text_json_path):
                    try:
                        with open(text_json_path, "r", encoding="utf-8") as f:
                            text_data = json.load(f)
                        text_blocks = [TextBlock(**tb) for tb in text_data]
                        logger.info(
                            "Loaded %d text blocks from %s", len(text_blocks), text_json_path
                        )
                    except Exception as e:
                        logger.warning("Failed to load text blocks: %s", e)

            # Step 7f: Assign room numbers
            if text_blocks:
                rooms = assign_room_numbers(rooms, text_blocks)

            # Step 8: Normalize coordinates
            walls, rooms, doors = normalize_coords(walls, rooms, doors, image_size)

            # Step 8: Compute scale factor
            pixels_per_meter = compute_scale_factor(wall_thickness_px)

            # Assemble VectorizationResult
            orig_size = image_size_original or image_size
            vectorization_result = VectorizationResult(
                walls=walls,
                rooms=rooms,
                doors=doors,
                text_blocks=text_blocks or [],
                image_size_original=orig_size,
                image_size_cropped=image_size,
                crop_rect=crop_rect,
                crop_applied=crop_applied,
                rotation_angle=rotation_angle,
                wall_thickness_px=wall_thickness_px,
                estimated_pixels_per_meter=pixels_per_meter,
                rooms_with_names=sum(1 for r in rooms if r.name),
                corridors_count=sum(1 for r in rooms if r.room_type == "corridor"),
                doors_count=len(doors),
            )

            # Save VectorizationResult to DB
            await self._repo.update_vectorization_data(
                reconstruction.id,
                json.dumps(vectorization_result.model_dump(), ensure_ascii=False),
            )

            # Build 3D mesh from binary mask (raw contours → correct 3D)
            mesh = build_mesh_from_mask(
                mask_array,
                floor_height=settings.DEFAULT_FLOOR_HEIGHT,
                pixels_per_meter=pixels_per_meter,
                vr=vectorization_result,
            )

            obj_path = os.path.join(
                self._models_dir, f"reconstruction_{reconstruction.id}.obj"
            )
            glb_path = os.path.join(
                self._models_dir, f"reconstruction_{reconstruction.id}.glb"
            )

            mesh.export(obj_path)
            mesh.export(glb_path)
            logger.info("Mesh exported: obj=%s, glb=%s", obj_path, glb_path)

            reconstruction = await self._repo.update_mesh(
                reconstruction.id, obj_path, glb_path, status=3
            )

        except Exception as e:
            logger.error(
                "Error building mesh for reconstruction %d: %s",
                reconstruction.id,
                e,
            )
            safe_msg = "Ошибка построения модели"
            reconstruction = await self._repo.update_mesh(
                reconstruction.id, None, None, status=4, error_message=safe_msg
            )

        return reconstruction

    async def get_vectorization_data(
        self, reconstruction_id: int
    ) -> Optional[VectorizationResult]:
        """Retrieve vectorization data from DB."""
        reconstruction = await self._repo.get_by_id(reconstruction_id)
        if not reconstruction or not reconstruction.vectorization_data:
            return None
        try:
            data = json.loads(reconstruction.vectorization_data)
            return VectorizationResult(**data)
        except (json.JSONDecodeError, Exception) as e:
            logger.error("Failed to parse vectorization data for %d: %s", reconstruction_id, e)
            return None

    async def update_vectorization_data(
        self, reconstruction_id: int, data: VectorizationResult
    ) -> Optional[Reconstruction]:
        """Update vectorization data in DB."""
        json_str = json.dumps(data.model_dump(), ensure_ascii=False)
        return await self._repo.update_vectorization_data(reconstruction_id, json_str)

    async def get_reconstruction(self, reconstruction_id: int) -> Optional[Reconstruction]:
        """Get by ID. Returns None if not found."""
        return await self._repo.get_by_id(reconstruction_id)

    async def get_saved_reconstructions(self) -> list[Reconstruction]:
        """List saved (name IS NOT NULL)."""
        return await self._repo.get_saved()

    async def save_reconstruction(
        self, reconstruction_id: int, name: str
    ) -> Optional[Reconstruction]:
        """Save name. Returns None if not found."""
        return await self._repo.update_name(reconstruction_id, name)

    async def delete_reconstruction(self, reconstruction_id: int) -> bool:
        """Delete. Returns False if not found."""
        return await self._repo.delete(reconstruction_id)

    @staticmethod
    def get_status_display(status: int) -> str:
        """Returns human-readable status from STATUS_DISPLAY."""
        return STATUS_DISPLAY.get(status, "Неизвестно")

    @staticmethod
    def get_room_labels(vr: Optional[VectorizationResult]) -> list[dict]:
        """Формирует список меток комнат для API ответа."""
        if not vr or not vr.rooms:
            return []
        colors = {
            "classroom": "#f5c542", "corridor": "#4287f5",
            "staircase": "#f54242", "toilet": "#42f5c8",
            "other": "#c8c8c8", "room": "#c8c8c8",
        }
        return [
            {
                "id": room.id,
                "name": room.name,
                "room_type": room.room_type,
                "center_x": room.center.x,
                "center_y": room.center.y,
                "color": colors.get(room.room_type, "#c8c8c8"),
            }
            for room in vr.rooms
        ]

    def build_mesh_url(self, reconstruction: Reconstruction) -> Optional[str]:
        """Forms URL for GLB file."""
        if reconstruction.mesh_file_id_glb:
            return f"/api/v1/uploads/models/reconstruction_{reconstruction.id}.glb"
        return None
