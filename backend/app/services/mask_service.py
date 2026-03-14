import glob
import logging
import os
from typing import List, Tuple

import cv2

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.processing.binarization import BinarizationService
from app.processing.pipeline import (
    auto_crop_suggest,
    color_filter,
    normalize_brightness,
    remove_text_regions,
    text_detect,
)
from app.models.domain import TextBlock

logger = logging.getLogger(__name__)


class MaskService:
    def __init__(self, upload_dir: str) -> None:
        self._upload_dir = upload_dir
        self._plans_dir = os.path.join(upload_dir, "plans")
        self._masks_dir = os.path.join(upload_dir, "masks")
        os.makedirs(self._masks_dir, exist_ok=True)
        self._binarization = BinarizationService(os.path.join(upload_dir, "processed"))

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
    ) -> Tuple[str, List[TextBlock]]:
        """
        Full mask pipeline:
        load → normalize → color filter → crop → binarize → text detect → remove.


        Returns:
            Tuple of (mask_filename, text_blocks)

        Raises:
            FileStorageError: plan file not found on disk
            ImageProcessingError: processing error at any step
        """
        # 1. Find and load the plan file
        plan_path = self._find_file(file_id, "plans")
        logger.info("Plan file found: %s", plan_path)

        img = cv2.imread(plan_path)
        if img is None:
            raise ImageProcessingError("cv2.imread", f"Failed to load image: {plan_path}")

        original_h, original_w = img.shape[:2]

        # 2. Rotate if provided
        if rotation:
            r = rotation % 360
            if r == 90:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif r == 180:
                img = cv2.rotate(img, cv2.ROTATE_180)
            elif r == 270:
                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

        # Step 1: Brightness normalization
        img = normalize_brightness(img)

        # Step 2: Color filtering (remove green arrows, red symbols)
        img = color_filter(img)

        # Step 3: Auto-crop suggestion (use user crop if provided)
        crop_rect = crop
        if crop is None:
            crop_rect = auto_crop_suggest(img)

        if crop_rect is not None:
            h, w = img.shape[:2]
            x = int(crop_rect["x"] * w)
            y = int(crop_rect["y"] * h)
            cw = int(crop_rect["width"] * w)
            ch = int(crop_rect["height"] * h)
            x = max(0, min(x, w - 1))
            y = max(0, min(y, h - 1))
            cw = max(1, min(cw, w - x))
            ch = max(1, min(ch, h - y))
            img = img[y:y + ch, x:x + cw]

        cropped_h, cropped_w = img.shape[:2]

        # Step 4: Adaptive binarization (delegate to BinarizationService)
        gray = self._binarization.to_grayscale(img)
        binary, _ = self._binarization.binarize_otsu(gray)
        binary = self._binarization.apply_morphology(binary, kernel_size=3, iterations=2)
        binary = self._binarization.invert_if_needed(binary)

        # Step 5: Text detection
        text_blocks = text_detect(img, binary)

        # Step 6: Text removal
        mask = remove_text_regions(binary, text_blocks, (cropped_w, cropped_h))

        # Save mask
        output_path = os.path.join(self._masks_dir, f"{file_id}.png")
        cv2.imwrite(output_path, mask)
        logger.info("Mask saved: %s", output_path)

        # Save text blocks for later use by reconstruction pipeline
        if text_blocks:
            import json
            text_json_path = os.path.join(self._masks_dir, f"{file_id}_text.json")
            with open(text_json_path, "w", encoding="utf-8") as f:
                json.dump([tb.model_dump() for tb in text_blocks], f, ensure_ascii=False)
            logger.info("Text blocks saved: %s (%d blocks)", text_json_path, len(text_blocks))

        return os.path.basename(output_path), text_blocks
