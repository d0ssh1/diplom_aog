import glob
import logging
import os
from typing import Optional

import cv2

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.db.models.reconstruction import Reconstruction
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.processing.vectorizer import find_contours
from app.processing.mesh_builder import build_mesh

logger = logging.getLogger(__name__)

# Single source of truth for status display — eliminates duplication from api/reconstruction.py
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

    async def build_mesh(
        self,
        plan_file_id: str,
        mask_file_id: str,
        user_id: int,
    ) -> Reconstruction:
        """Full pipeline: create record → load mask → vectorize → build mesh → export → update DB."""
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
            # 2. Find mask on disk using glob
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

            # 4. Get dimensions
            h, w = mask_array.shape

            # 5. Vectorize: find contours
            contours = find_contours(mask_array)

            # 6. Build trimesh
            mesh = build_mesh(contours, w, h)

            # 7. Export paths
            obj_path = os.path.join(
                self._models_dir, f"reconstruction_{reconstruction.id}.obj"
            )
            glb_path = os.path.join(
                self._models_dir, f"reconstruction_{reconstruction.id}.glb"
            )

            # 8. Export mesh
            mesh.export(obj_path)
            mesh.export(glb_path)
            logger.info(
                "Mesh exported: obj=%s, glb=%s", obj_path, glb_path
            )

            # 9. Update DB with paths and status=3 (done)
            reconstruction = await self._repo.update_mesh(
                reconstruction.id, obj_path, glb_path, status=3
            )

        except Exception as e:
            logger.error(
                "Error building mesh for reconstruction %d: %s",
                reconstruction.id,
                e,
            )
            reconstruction = await self._repo.update_mesh(
                reconstruction.id, None, None, status=4, error_message=str(e)
            )

        return reconstruction

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

    def build_mesh_url(self, reconstruction: Reconstruction) -> Optional[str]:
        """Forms URL for GLB file."""
        if reconstruction.mesh_file_id_glb:
            return f"/api/v1/uploads/models/reconstruction_{reconstruction.id}.glb"
        return None
