# Phase 4: Processing — Image Stitch

phase: 4
layer: processing
depends_on: [phase-01]
design: ../README.md

## Goal

Implement pure function for stitching raster images using OpenCV warpAffine. Creates composite preview image for stitched reconstruction.

## Context

**Depends on Phase 1:** Uses affine transformation matrices.

**Purpose:** Generate preview image for reconstruction card. Not critical for 3D generation (uses vector data), but useful for UI and debugging.

## Files to Create

### `backend/app/processing/stitching/image_stitch.py`

**Purpose:** Raster image stitching using OpenCV.

**Implementation details:**
- **Input:** List of images + transforms + z-order
- **Output:** Single composite image
- **Algorithm:**
  1. Compute bounding box of all transformed images
  2. Create canvas with bounding box size
  3. For each image (sorted by z-index): warpAffine + composite onto canvas

**Key function:**

```python
import cv2
import numpy as np
from typing import List, Tuple

def stitch_raster_images(
    images: List[np.ndarray],
    transforms: List[np.ndarray],
    z_indices: List[int],
) -> np.ndarray:
    """
    Stitch multiple raster images using affine transforms.

    Args:
        images: List of BGR images (H, W, 3)
        transforms: List of 3x3 affine matrices (one per image)
        z_indices: List of z-order indices (0 = bottom)

    Returns:
        Composite BGR image

    Raises:
        ValueError: If lists have different lengths
    """
    # Validate input lengths match
    # Sort by z_index (bottom to top)
    # Compute bounding box of all transformed corners
    # Create canvas (white background)
    # For each image:
    #   Apply warpAffine with transform
    #   Composite onto canvas (alpha blend or overwrite)
    # Return canvas
```

**Reference:** Ticket section "Шаг 11 — Сохранение" (line 513) mentions "сшить растровые изображения"

### `backend/tests/processing/stitching/test_image_stitch.py`

**Tests from 04-testing.md to implement here:**
- `test_stitch_raster_images_applies_transform`
- `test_stitch_raster_images_respects_z_order`
- `test_stitch_raster_images_correct_size`

**Example test:**
```python
def test_stitch_raster_images_applies_transform():
    # Arrange
    img1 = np.ones((100, 100, 3), dtype=np.uint8) * 255  # White
    img2 = np.zeros((100, 100, 3), dtype=np.uint8)       # Black

    identity = np.eye(3)
    translate = np.array([
        [1, 0, 100],
        [0, 1, 0],
        [0, 0, 1],
    ], dtype=np.float64)

    # Act
    result = stitch_raster_images(
        images=[img1, img2],
        transforms=[identity, translate],
        z_indices=[0, 1],
    )

    # Assert
    assert result.shape[0] >= 100  # Height
    assert result.shape[1] >= 200  # Width (100 + 100 translation)
    assert result.shape[2] == 3    # BGR
```

**Reference:** 04-testing.md "Processing Function Coverage" → image_stitch.py

## Files to Modify

None.

## Verification

- [ ] `python -m py_compile backend/app/processing/stitching/image_stitch.py` passes
- [ ] `pytest backend/tests/processing/stitching/test_image_stitch.py -v` passes (3 tests)
- [ ] All functions have type hints (args + return)
- [ ] All functions have docstrings
- [ ] No imports from `api/`, `db/`, `services/` (pure functions only)
- [ ] OpenCV warpAffine used correctly (not warpPerspective)
- [ ] Z-order respected (lower z-index drawn first, higher on top)
- [ ] Bounding box computed correctly (handles negative translations)
