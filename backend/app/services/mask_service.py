import glob
import json
import logging
import os
from typing import Tuple

import cv2
import numpy as np

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.processing.binarization import BinarizationService
from app.processing.pipeline import (
    color_filter,
    normalize_brightness,
    remove_colored_elements,
    text_detect,
    remove_text_regions,
)

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

    async def preview_mask(
        self,
        file_id: str,
        crop: dict | None = None,
        rotation: int = 0,
        block_size: int = 15,
        threshold_c: int = 10,
    ) -> bytes:
        """Генерирует превью маски БЕЗ сохранения на диск. Возвращает PNG bytes."""
        plan_path = self._find_file(file_id, "plans")
        img = cv2.imread(plan_path)
        if img is None:
            raise ImageProcessingError("preview_mask", f"Failed to load: {plan_path}")

        if rotation:
            r = rotation % 360
            if r == 90:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif r == 180:
                img = cv2.rotate(img, cv2.ROTATE_180)
            elif r == 270:
                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

        img = remove_colored_elements(img)

        if crop is not None:
            h, w = img.shape[:2]
            x = max(0, int(crop["x"] * w))
            y = max(0, int(crop["y"] * h))
            cw = max(1, int(crop["width"] * w))
            ch = max(1, int(crop["height"] * h))
            img = img[y:y + ch, x:x + cw]

        gray = self._binarization.to_grayscale(img)
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)

        bs = max(3, block_size)
        if bs % 2 == 0:
            bs += 1

        binary = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=bs,
            C=threshold_c,
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

        _, buffer = cv2.imencode('.png', mask)
        return buffer.tobytes()

    async def calculate_mask(
        self,
        file_id: str,
        crop: dict | None = None,
        rotation: int = 0,
        block_size: int = 15,
        threshold_c: int = 10,
        enable_normalize: bool = False,
        enable_color_filter: bool = False,
        enable_color_removal: bool = True,
        enable_text_removal: bool = True,
    ) -> str:
        """
        Mask pipeline: load → rotate → [normalize] → [color filter] → color removal
        → crop → binarize → text detect → text removal → save mask + text.json.

        Returns:
            mask_filename

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

        # 2. Rotate if provided
        if rotation:
            r = rotation % 360
            if r == 90:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif r == 180:
                img = cv2.rotate(img, cv2.ROTATE_180)
            elif r == 270:
                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

        # Step 1: Brightness normalization (disabled by default — corrupts Otsu threshold)
        if enable_normalize:
            img = normalize_brightness(img)

        # Step 2a: Color filtering (disabled by default — too aggressive for evacuation plans)
        if enable_color_filter:
            img = color_filter(img)

        # Step 2b: Color removal (enabled by default — removes green arrows, red symbols)
        if enable_color_removal:
            img = remove_colored_elements(img)

        # Step 3: Apply user-provided crop (no auto-crop — it picks wrong regions)
        if crop is not None:
            h, w = img.shape[:2]
            x = int(crop["x"] * w)
            y = int(crop["y"] * h)
            cw = int(crop["width"] * w)
            ch = int(crop["height"] * h)
            x = max(0, min(x, w - 1))
            y = max(0, min(y, h - 1))
            cw = max(1, min(cw, w - x))
            ch = max(1, min(ch, h - y))
            img = img[y:y + ch, x:x + cw]

        # Keep reference to cropped BGR for text_detect (OCR works on color image)
        cropped_bgr = img

        # Step 4: Binarization
        # Adaptive threshold preserves thin wall lines that global Otsu misses.
        # GaussianBlur(3,3) removes noise without destroying thin lines.
        gray = self._binarization.to_grayscale(img)
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)
        bs = max(3, block_size)
        if bs % 2 == 0:
            bs += 1
        binary = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=bs,
            C=threshold_c,
        )
        # Only closing — fills small gaps in walls. No opening (it erases thin lines).
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

        # Step 5: Text detection + removal
        text_blocks = []
        if enable_text_removal:
            text_blocks = text_detect(cropped_bgr, mask)
            if text_blocks:
                mask = remove_text_regions(
                    mask, text_blocks,
                    (cropped_bgr.shape[1], cropped_bgr.shape[0]),
                )

        # Save mask
        output_path = os.path.join(self._masks_dir, f"{file_id}.png")
        cv2.imwrite(output_path, mask)
        logger.info("Mask saved: %s", output_path)

        # Save text blocks
        if text_blocks:
            text_json_path = os.path.join(self._masks_dir, f"{file_id}_text.json")
            text_data = [
                {
                    "text": tb.text,
                    "center": {"x": tb.center.x, "y": tb.center.y},
                    "confidence": tb.confidence,
                    "is_room_number": tb.is_room_number,
                }
                for tb in text_blocks
            ]
            with open(text_json_path, "w", encoding="utf-8") as f:
                json.dump(text_data, f, ensure_ascii=False, indent=2)
            logger.info("Text blocks saved: %s (%d blocks)", text_json_path, len(text_blocks))

        return os.path.basename(output_path)
