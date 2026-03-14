# Phase 2: Pipeline Functions (Steps 1-3)

phase: 2
layer: processing
depends_on: phase-01
design: ../README.md

## Goal

Implement first 3 steps of pipeline: brightness normalization, color filtering, auto-crop suggestion.

## Context

Phase 1 completed: domain models (VectorizationResult, Room, Door, TextBlock) are available.

This phase creates NEW file `processing/pipeline.py` with pure functions for Steps 1-3.

## Files to Create

### `backend/app/processing/pipeline.py`

**Purpose:** Pure functions for 8-step vectorization pipeline. This phase implements Steps 1-3.

**Implementation details:**

**Step 1: Brightness Normalization**

Reference: `../06-pipeline-spec.md` lines 27-90

```python
import cv2
import numpy as np
from typing import Optional, Tuple, List, Dict, Any
from backend.app.core.exceptions import ImageProcessingError


def normalize_brightness(
    image: np.ndarray,
    clip_limit: float = 2.0,
    tile_size: int = 8
) -> np.ndarray:
    """
    Normalize brightness using CLAHE on L channel.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        clip_limit: CLAHE clip limit (higher = more contrast)
        tile_size: CLAHE tile grid size

    Returns:
        Normalized BGR image (H, W, 3), dtype=uint8

    Raises:
        ImageProcessingError: if image is empty or wrong dtype
    """
    if image is None or image.size == 0:
        raise ImageProcessingError("Empty image", step="normalize_brightness")
    if image.dtype != np.uint8:
        raise ImageProcessingError(
            f"Expected uint8, got {image.dtype}",
            step="normalize_brightness"
        )

    # Convert to LAB
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    # Apply CLAHE to L channel
    clahe = cv2.createCLAHE(
        clipLimit=clip_limit,
        tileGridSize=(tile_size, tile_size)
    )
    l_clahe = clahe.apply(l)

    # Merge and convert back
    lab_clahe = cv2.merge([l_clahe, a, b])
    normalized = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2BGR)

    return normalized
```

**Step 2: Color Filtering**

Reference: `../06-pipeline-spec.md` lines 94-154

```python
def color_filter(
    image: np.ndarray,
    saturation_threshold: int = 50,
    inpaint_radius: int = 3
) -> np.ndarray:
    """
    Remove colored elements (green arrows, red symbols) via HSV saturation mask + inpaint.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        saturation_threshold: Saturation threshold (0-255). Pixels with S > threshold are colored.
        inpaint_radius: Inpainting radius (pixels)

    Returns:
        Filtered BGR image with colored elements removed (H, W, 3), dtype=uint8

    Raises:
        ImageProcessingError: if image is empty or wrong dtype
    """
    if image is None or image.size == 0:
        raise ImageProcessingError("Empty image", step="color_filter")
    if image.dtype != np.uint8:
        raise ImageProcessingError(
            f"Expected uint8, got {image.dtype}",
            step="color_filter"
        )

    # Convert to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)

    # Create mask: high saturation = colored pixels
    mask = (s > saturation_threshold).astype(np.uint8) * 255

    # Inpaint colored regions
    filtered = cv2.inpaint(image, mask, inpaint_radius, cv2.INPAINT_TELEA)

    return filtered
```

**Step 3: Auto-Crop Suggestion**

Reference: `../06-pipeline-spec.md` lines 158-245

```python
def auto_crop_suggest(
    image: np.ndarray,
    min_area_ratio: float = 0.2,
    margin_ratio: float = 0.05
) -> Optional[Dict[str, float]]:
    """
    Suggest crop rectangle around building boundary.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        min_area_ratio: Minimum contour area as ratio of image area (0.2 = 20%)
        margin_ratio: Margin to add around bounding box (0.05 = 5%)

    Returns:
        Crop rect {x, y, width, height} normalized [0,1], or None if no boundary found

    Raises:
        ImageProcessingError: if image is empty
    """
    if image is None or image.size == 0:
        raise ImageProcessingError("Empty image", step="auto_crop_suggest")

    h, w = image.shape[:2]
    image_area = h * w

    # Coarse binarization
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter by area
    large_contours = [c for c in contours if cv2.contourArea(c) > image_area * min_area_ratio]

    if not large_contours:
        return None

    # Select largest
    largest = max(large_contours, key=cv2.contourArea)

    # Bounding box
    x, y, bw, bh = cv2.boundingRect(largest)

    # Add margin
    margin_x = int(bw * margin_ratio)
    margin_y = int(bh * margin_ratio)
    x = max(0, x - margin_x)
    y = max(0, y - margin_y)
    bw = min(w - x, bw + 2 * margin_x)
    bh = min(h - y, bh + 2 * margin_y)

    # Normalize
    crop_rect = {
        "x": x / w,
        "y": y / h,
        "width": bw / w,
        "height": bh / h,
    }

    return crop_rect
```

**Business rules:**
- Never mutate input arrays (cv2 functions create new arrays, but be careful)
- All functions are pure (no side effects, no DB, no HTTP)
- Raise ImageProcessingError with step name for all errors
- Document array format in docstrings (shape, dtype, value range)

**Reference:**
- Design: `../06-pipeline-spec.md` Steps 1-3
- Standards: `../../../../prompts/cv_patterns.md` (OpenCV patterns)
- Standards: `../../../../prompts/python_style.md` (naming conventions)

## Verification

- [ ] `python -m py_compile backend/app/processing/pipeline.py` passes
- [ ] Import test: `python -c "from backend.app.processing.pipeline import normalize_brightness, color_filter, auto_crop_suggest; print('OK')"` succeeds
- [ ] No imports from api/, services/, or db/ (check with grep)
- [ ] All functions have type hints
- [ ] All functions have docstrings with Args/Returns/Raises
- [ ] Manual test with synthetic image:
  ```python
  import numpy as np
  import cv2
  from backend.app.processing.pipeline import normalize_brightness, color_filter, auto_crop_suggest

  # Create test image
  img = np.ones((200, 200, 3), dtype=np.uint8) * 128

  # Test Step 1
  normalized = normalize_brightness(img)
  assert normalized.shape == img.shape
  assert normalized.dtype == np.uint8

  # Test Step 2
  filtered = color_filter(img)
  assert filtered.shape == img.shape
  assert filtered.dtype == np.uint8

  # Test Step 3
  crop = auto_crop_suggest(img)
  # May return None for uniform image, that's OK
  if crop:
      assert 0.0 <= crop["x"] <= 1.0
      assert 0.0 <= crop["y"] <= 1.0
      assert 0.0 < crop["width"] <= 1.0
      assert 0.0 < crop["height"] <= 1.0

  print("All manual tests passed")
  ```
