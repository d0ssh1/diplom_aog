"""
File storage abstraction for managing uploads and model exports.
"""
import glob
import json
import logging
import os
from typing import List, Optional

import cv2
import numpy as np

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.models.domain import TextBlock

logger = logging.getLogger(__name__)


class FileStorage:
    """Handles all file I/O operations for uploads and exports."""

    def __init__(self, upload_dir: str) -> None:
        """
        Initialize file storage.

        Args:
            upload_dir: Root directory for uploads and exports
        """
        self._upload_dir = upload_dir
        self._models_dir = os.path.join(upload_dir, "models")
        os.makedirs(self._models_dir, exist_ok=True)
        logger.debug("FileStorage initialized: upload_dir=%s", upload_dir)

    def find_file(self, file_id: str, subfolder: str) -> str:
        """
        Find file by ID in subfolder (any extension).

        Args:
            file_id: File identifier
            subfolder: Subfolder name (e.g., "masks", "plans")

        Returns:
            Full path to file

        Raises:
            FileStorageError: If file not found
        """
        pattern = os.path.join(self._upload_dir, subfolder, f"{file_id}.*")
        files = glob.glob(pattern)
        if not files:
            raise FileStorageError(file_id, pattern)
        logger.debug("Found file: %s", files[0])
        return files[0]

    async def load_mask(self, mask_file_id: str) -> np.ndarray:
        """
        Load mask image as grayscale array.

        Args:
            mask_file_id: Mask file identifier

        Returns:
            Grayscale image array (np.uint8)

        Raises:
            FileStorageError: If file not found
            ImageProcessingError: If image cannot be loaded
        """
        mask_path = self.find_file(mask_file_id, "masks")
        mask_array = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask_array is None:
            msg = f"Failed to load mask: {mask_path}"
            raise ImageProcessingError("cv2.imread", msg)
        logger.debug("Loaded mask: %s, shape=%s", mask_path, mask_array.shape)
        return mask_array

    async def load_text_blocks(
        self, mask_file_id: str
    ) -> Optional[List[TextBlock]]:
        """
        Load text blocks from JSON file if exists.

        Args:
            mask_file_id: Mask file identifier

        Returns:
            List of TextBlock objects or None if file doesn't exist

        Raises:
            Exception: If JSON is malformed
        """
        text_json_path = os.path.join(
            self._upload_dir, "masks", f"{mask_file_id}_text.json"
        )
        if not os.path.exists(text_json_path):
            logger.debug("Text blocks file not found: %s", text_json_path)
            return None

        try:
            with open(text_json_path, "r", encoding="utf-8") as f:
                text_data = json.load(f)
            text_blocks = [TextBlock(**tb) for tb in text_data]
            logger.info(
                "Loaded %d text blocks from %s",
                len(text_blocks),
                text_json_path,
            )
            return text_blocks
        except Exception as e:
            logger.warning("Failed to load text blocks: %s", e)
            return None

    async def save_mesh_files(
        self, reconstruction_id: int, mesh
    ) -> tuple[str, str]:
        """
        Export mesh to OBJ and GLB files.

        Args:
            reconstruction_id: Reconstruction ID
            mesh: Trimesh mesh object to export

        Returns:
            Tuple of (obj_path, glb_path)
        """
        obj_path = os.path.join(
            self._models_dir, f"reconstruction_{reconstruction_id}.obj"
        )
        glb_path = os.path.join(
            self._models_dir, f"reconstruction_{reconstruction_id}.glb"
        )

        mesh.export(obj_path)
        mesh.export(glb_path)
        logger.debug("Mesh exported: obj=%s, glb=%s", obj_path, glb_path)
        return obj_path, glb_path

    async def save_mesh(
        self, reconstruction_id: int, obj_path: str, glb_path: str
    ) -> None:
        """
        Ensure mesh export paths are in models directory.

        Args:
            reconstruction_id: Reconstruction ID
            obj_path: OBJ file path
            glb_path: GLB file path

        Note:
            Mesh export is handled by mesh.export() in the service.
            This method validates paths are in the correct directory.
        """
        for path in [obj_path, glb_path]:
            if not path.startswith(self._models_dir):
                logger.warning("Mesh path outside models dir: %s", path)
        logger.info("Mesh paths validated: obj=%s, glb=%s", obj_path, glb_path)

    async def save_uploaded_file(
        self,
        file_content: bytes,
        filename: str,
        subfolder: str = "",
    ) -> str:
        """
        Save uploaded file to storage.

        Args:
            file_content: File content as bytes
            filename: Original filename (for extension)
            subfolder: Subdirectory within upload_dir

        Returns:
            Generated file_id (UUID)

        Raises:
            FileStorageError: If save fails
        """
        import uuid

        file_id = str(uuid.uuid4())
        ext = filename.split(".")[-1].lower() if filename else "jpg"

        upload_dir = os.path.join(self._upload_dir, subfolder)
        os.makedirs(upload_dir, exist_ok=True)

        file_path = os.path.join(upload_dir, f"{file_id}.{ext}")

        try:
            with open(file_path, "wb") as f:
                f.write(file_content)
            logger.info("File saved: %s", file_path)
            return file_id
        except Exception as e:
            logger.error("Failed to save file: %s", e, exc_info=True)
            raise FileStorageError(file_id, f"Failed to save: {e}")
