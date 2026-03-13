import glob
import logging
import os

import cv2

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.processing.preprocessor import preprocess_image

logger = logging.getLogger(__name__)


class MaskService:
    def __init__(self, upload_dir: str) -> None:
        self._upload_dir = upload_dir
        self._plans_dir = os.path.join(upload_dir, "plans")
        self._masks_dir = os.path.join(upload_dir, "masks")
        os.makedirs(self._masks_dir, exist_ok=True)

    def _find_file(self, file_id: str, subfolder: str) -> str:
        """Finds file with any extension. Raises FileStorageError if not found."""
        pattern = os.path.join(self._upload_dir, subfolder, f"{file_id}.*")
        files = glob.glob(pattern)
        if not files:
            raise FileStorageError(file_id, pattern)
        return files[0]

    async def calculate_mask(
        self,
        file_id: str,
        crop: dict | None = None,
        rotation: int = 0,
    ) -> str:
        """
        Loads plan image, binarizes it, saves mask.

        Returns:
            filename of mask (e.g. "uuid.png")

        Raises:
            FileStorageError: plan file not found on disk
            ImageProcessingError: binarization error
        """
        # 1. Find the plan file (any extension)
        plan_path = self._find_file(file_id, "plans")
        logger.info("Plan file found: %s", plan_path)

        # 2. Load image — check for None
        img = cv2.imread(plan_path)
        if img is None:
            raise ImageProcessingError("cv2.imread", f"Failed to load image: {plan_path}")

        # 3. Preprocess (pure function: applies crop, rotation, binarization)
        mask = preprocess_image(img, crop, rotation)

        # 4. Save mask
        output_path = os.path.join(self._masks_dir, f"{file_id}.png")
        cv2.imwrite(output_path, mask)
        logger.info("Mask saved: %s", output_path)

        # 5. Return filename
        return os.path.basename(output_path)
