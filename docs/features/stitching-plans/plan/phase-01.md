# Phase 1: Processing — Transform

phase: 1
layer: processing
depends_on: none
design: ../README.md

## Goal

Implement pure functions for affine transformations (scale → rotate → translate) to transform coordinates from image space to canvas space.

## Context

This is the first phase. No dependencies on other phases.

**Key requirement:** Functions must be pure (no DB, no HTTP, no side effects). Only numpy and math operations.

## Files to Create

### `backend/app/processing/stitching/__init__.py`

**Purpose:** Export all public functions from the stitching module.

**Implementation details:**
```python
from .transform import (
    build_affine_matrix,
    apply_affine_to_point,
    apply_affine_to_polygon,
)
from .clip import (
    clip_walls,
    clip_rooms,
    clip_doors,
)
from .merge import (
    merge_models,
    normalize_to_bounding_box,
    check_duplicate_rooms,
)
from .image_stitch import stitch_raster_images

__all__ = [
    "build_affine_matrix",
    "apply_affine_to_point",
    "apply_affine_to_polygon",
    "clip_walls",
    "clip_rooms",
    "clip_doors",
    "merge_models",
    "normalize_to_bounding_box",
    "check_duplicate_rooms",
    "stitch_raster_images",
]
```

### `backend/app/processing/stitching/transform.py`

**Purpose:** Affine transformation functions for coordinate transformation.

**Implementation details:**
- **Transformation order:** Scale → Rotate → Translate (matches Fabric.js)
- **Matrix format:** 3x3 homogeneous coordinates (numpy array)
- **Input coordinates:** Can be in any space (pixels, normalized)
- **Output coordinates:** Same space as input, transformed

**Key functions:**

```python
import numpy as np
from typing import Tuple, List

def build_affine_matrix(
    scale_x: float,
    scale_y: float,
    rotation_deg: float,
    translate_x: float,
    translate_y: float,
) -> np.ndarray:
    """
    Build 3x3 affine transformation matrix.

    Order: Scale → Rotate → Translate

    Args:
        scale_x: Horizontal scale factor
        scale_y: Vertical scale factor
        rotation_deg: Rotation angle in degrees (counterclockwise)
        translate_x: Horizontal translation
        translate_y: Vertical translation

    Returns:
        3x3 numpy array (float64)
    """
    # Convert to radians
    # Build S, R, T matrices
    # Return T @ R @ S

def apply_affine_to_point(
    matrix: np.ndarray,
    x: float,
    y: float,
) -> Tuple[float, float]:
    """
    Apply affine matrix to a single point.

    Args:
        matrix: 3x3 affine matrix
        x: X coordinate
        y: Y coordinate

    Returns:
        Tuple of (x_transformed, y_transformed)
    """
    # Create homogeneous point [x, y, 1]
    # Multiply: result = matrix @ point
    # Return (result[0], result[1])

def apply_affine_to_polygon(
    matrix: np.ndarray,
    points: List[List[float]],
) -> List[List[float]]:
    """
    Apply affine matrix to all points in a polygon.

    Args:
        matrix: 3x3 affine matrix
        points: List of [x, y] coordinates

    Returns:
        List of transformed [x, y] coordinates
    """
    # Apply to each point
    # Return list of transformed points
```

**Reference:** Ticket section "Шаг 4 — Аффинная трансформация" (lines 322-383)

### `backend/tests/processing/stitching/conftest.py`

**Purpose:** Pytest fixtures for stitching tests.

**Implementation details:**
```python
import pytest
import numpy as np
from app.models.domain import VectorizationResult, Wall, Room, Door, Point2D

@pytest.fixture
def simple_wall() -> Wall:
    """Single horizontal wall."""
    return Wall(
        id="w1",
        points=[Point2D(x=0.0, y=0.5), Point2D(x=1.0, y=0.5)],
        thickness=0.2,
    )

@pytest.fixture
def simple_room() -> Room:
    """Single rectangular room."""
    return Room(
        id="r1",
        name="A301",
        polygon=[
            Point2D(x=0.2, y=0.2),
            Point2D(x=0.8, y=0.2),
            Point2D(x=0.8, y=0.8),
            Point2D(x=0.2, y=0.8),
        ],
        center=Point2D(x=0.5, y=0.5),
        room_type="room",
        area_normalized=0.36,
    )

@pytest.fixture
def identity_matrix() -> np.ndarray:
    """Identity transformation matrix."""
    return np.array([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ], dtype=np.float64)
```

**Reference:** 04-testing.md "Test Fixtures" section

### `backend/tests/processing/stitching/test_transform.py`

**Tests from 04-testing.md to implement here:**
- `test_build_affine_matrix_identity_returns_identity`
- `test_build_affine_matrix_translate_only_moves_point`
- `test_build_affine_matrix_scale_only_multiplies_coords`
- `test_build_affine_matrix_rotate_90_transforms_correctly`
- `test_build_affine_matrix_combined_correct_order`
- `test_apply_affine_to_point_transforms_correctly`
- `test_apply_affine_to_polygon_transforms_all_points`
- `test_apply_affine_to_polygon_empty_returns_empty`

**Example test:**
```python
def test_build_affine_matrix_identity_returns_identity():
    # Arrange
    # Act
    matrix = build_affine_matrix(1.0, 1.0, 0.0, 0.0, 0.0)
    # Assert
    expected = np.eye(3)
    np.testing.assert_array_almost_equal(matrix, expected)
```

**Reference:** 04-testing.md "Processing Function Coverage" → transform.py

## Files to Modify

None.

## Verification

- [ ] `python -m py_compile backend/app/processing/stitching/transform.py` passes
- [ ] `pytest backend/tests/processing/stitching/test_transform.py -v` passes (8 tests)
- [ ] All functions have type hints (args + return)
- [ ] All functions have docstrings
- [ ] No imports from `api/`, `db/`, `services/` (pure functions only)
- [ ] Matrix multiplication order verified: T @ R @ S (not S @ R @ T)
- [ ] Rotation is counterclockwise (standard math convention)
