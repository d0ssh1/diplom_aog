import json
import logging
from typing import List, Optional

from app.db.models.reconstruction import Reconstruction
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.models.domain import (
    Point2D,
    TextBlock,
    VectorizationResult,
    Wall,
)
from app.processing.contours import extract_elements
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
from app.services.file_storage import FileStorage

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
        storage: FileStorage,
    ) -> None:
        self._repo = repo
        self._storage = storage

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
        """
        Execute full 3D reconstruction pipeline.

        Orchestrates the complete workflow: creates DB record, loads mask
        image, extracts walls and rooms, builds 3D mesh, exports files,
        and updates DB.

        Args:
            plan_file_id: Original plan image file ID
            mask_file_id: Binary mask file ID
            user_id: User ID who initiated the reconstruction
            text_blocks: Optional pre-extracted text blocks from the plan
            image_size_original: Original image size before cropping
                (width, height)
            crop_rect: Crop rectangle coordinates if cropping was applied
            crop_applied: Whether cropping was applied
            rotation_angle: Rotation angle applied to the image

        Returns:
            Reconstruction ORM model with status=3 (ready) or status=4
            (error)
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
            # 2. Load mask from storage
            mask_array = await self._storage.load_mask(mask_file_id)
            h, w = mask_array.shape
            image_size = (w, h)

            # 3. Extract walls via extract_elements pure function
            elements = extract_elements(mask_array)
            wall_elements = [
                e for e in elements if e.element_type not in ("noise",)
            ]

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
                    walls.append(
                        Wall(id=f"wall_{i}", points=points, thickness=0.2)
                    )

            # 4. Compute wall thickness
            wall_thickness_px = compute_wall_thickness(mask_array)

            # 5. Detect rooms
            rooms = room_detect(mask_array)
            rooms = classify_rooms(rooms)

            # 6. Detect doors
            doors = door_detect(mask_array, rooms)

            # 7. Load text blocks from storage if not provided
            if not text_blocks:
                text_blocks = await self._storage.load_text_blocks(
                    mask_file_id
                )

            # 8. Assign room numbers
            if text_blocks:
                rooms = assign_room_numbers(rooms, text_blocks)

            # 9. Normalize coordinates
            walls, rooms, doors = normalize_coords(
                walls, rooms, doors, image_size
            )

            # 10. Compute scale factor
            pixels_per_meter = compute_scale_factor(wall_thickness_px)

            # 11. Assemble VectorizationResult
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
                corridors_count=sum(
                    1 for r in rooms if r.room_type == "corridor"
                ),
                doors_count=len(doors),
            )

            # 12. Save VectorizationResult to DB
            await self._repo.update_vectorization_data(
                reconstruction.id,
                json.dumps(
                    vectorization_result.model_dump(), ensure_ascii=False
                ),
            )

            # 13. Build 3D mesh from binary mask
            mesh = build_mesh_from_mask(
                mask_array,
                floor_height=settings.DEFAULT_FLOOR_HEIGHT,
                pixels_per_meter=pixels_per_meter,
                vr=vectorization_result,
            )

            # 14. Export mesh
            obj_path, glb_path = await self._storage.save_mesh_files(
                reconstruction.id, mesh
            )
            logger.info("Mesh exported: obj=%s, glb=%s", obj_path, glb_path)

            # 15. Update DB with mesh paths
            reconstruction = await self._repo.update_mesh(
                reconstruction.id, obj_path, glb_path, status=3
            )

        except Exception as e:
            logger.error(
                "Error building mesh for reconstruction %d: %s",
                reconstruction.id,
                e,
                exc_info=True,
            )
            safe_msg = "Ошибка построения модели"
            reconstruction = await self._repo.update_mesh(
                reconstruction.id, None, None, status=4, error_message=safe_msg
            )

        return reconstruction

    async def get_vectorization_data(
        self, reconstruction_id: int
    ) -> Optional[VectorizationResult]:
        """
        Retrieve vectorization data from database.

        Args:
            reconstruction_id: Reconstruction ID

        Returns:
            VectorizationResult object or None if not found or invalid
        """
        reconstruction = await self._repo.get_by_id(reconstruction_id)
        if not reconstruction or not reconstruction.vectorization_data:
            return None
        try:
            data = json.loads(reconstruction.vectorization_data)
            return VectorizationResult(**data)
        except (json.JSONDecodeError, Exception) as e:
            logger.error(
                "Failed to parse vectorization data for %d: %s",
                reconstruction_id,
                e,
                exc_info=True,
            )
            return None

    async def update_vectorization_data(
        self, reconstruction_id: int, data: VectorizationResult
    ) -> bool:
        """
        Update vectorization data in database.

        Args:
            reconstruction_id: Reconstruction ID
            data: VectorizationResult object to save

        Returns:
            True if successful, False if reconstruction not found
        """
        json_str = json.dumps(data.model_dump(), ensure_ascii=False)
        result = await self._repo.update_vectorization_data(
            reconstruction_id, json_str
        )
        return result is not None

    async def get_reconstruction(
        self, reconstruction_id: int
    ) -> Optional[Reconstruction]:
        """
        Get reconstruction by ID.

        Args:
            reconstruction_id: Reconstruction ID

        Returns:
            Reconstruction ORM model or None if not found
        """
        return await self._repo.get_by_id(reconstruction_id)

    async def get_saved_reconstructions(self) -> list[Reconstruction]:
        """
        List all saved reconstructions.

        Returns:
            List of Reconstruction ORM models where name is not NULL
        """
        return await self._repo.get_saved()

    async def save_reconstruction(
        self, reconstruction_id: int, name: str, building_id: Optional[str] = None, floor_number: Optional[int] = None
    ) -> Optional[Reconstruction]:
        """
        Save reconstruction with a name, building_id, and floor_number.

        Args:
            reconstruction_id: Reconstruction ID
            name: Name to assign to the reconstruction
            building_id: Building identifier (e.g., "A", "B", "C")
            floor_number: Floor number

        Returns:
            Updated Reconstruction ORM model or None if not found
        """
        return await self._repo.update_reconstruction(reconstruction_id, name, building_id, floor_number)

    async def delete_reconstruction(self, reconstruction_id: int) -> bool:
        """
        Delete reconstruction by ID.

        Args:
            reconstruction_id: Reconstruction ID

        Returns:
            True if deleted, False if not found
        """
        return await self._repo.delete(reconstruction_id)

    @staticmethod
    def get_status_display(status: int) -> str:
        """
        Get human-readable status text.

        Args:
            status: Status code (1=created, 2=processing, 3=ready, 4=error)

        Returns:
            Human-readable status string in Russian
        """
        return STATUS_DISPLAY.get(status, "Неизвестно")

    @staticmethod
    def get_room_labels(vr: Optional[VectorizationResult]) -> list[dict]:
        """
        Format room labels for API response.

        Args:
            vr: VectorizationResult containing room data

        Returns:
            List of room label dictionaries with id, name, type, center,
            and color
        """
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
        """
        Build URL for GLB mesh file.

        Args:
            reconstruction: Reconstruction ORM model

        Returns:
            URL string or None if mesh file doesn't exist
        """
        if reconstruction.mesh_file_id_glb:
            model_id = reconstruction.id
            return f"/api/v1/uploads/models/reconstruction_{model_id}.glb"
        return None
