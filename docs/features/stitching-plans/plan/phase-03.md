# Phase 3: Processing — Merge

phase: 3
layer: processing
depends_on: [phase-01, phase-02]
design: ../README.md

## Goal

Implement pure functions for merging multiple vectorization models and normalizing coordinates to [0,1] bounding box.

## Context

**Depends on Phase 1 and 2:** Uses transformation and clipping results.

**Key operations:**
1. Concatenate walls, rooms, doors from multiple plans
2. Detect duplicate rooms (same name, close proximity)
3. Compute bounding box from all walls
4. Normalize all coordinates to [0,1] relative to bounding box

## Files to Create

### `backend/app/processing/stitching/merge.py`

**Purpose:** Model merging and coordinate normalization.

**Implementation details:**
- **Merge:** Simple concatenation of lists
- **Duplicate detection:** Distance threshold 30px (configurable)
- **Normalization:** Find min/max X/Y across all walls, scale to [0,1]

**Key functions:**

```python
from typing import List, Tuple
from app.models.domain import VectorizationResult, Wall, Room, Door, Point2D
import math

def merge_models(
    models: List[VectorizationResult],
) -> VectorizationResult:
    """
    Merge multiple vectorization models into one.

    Concatenates walls, rooms, doors. Does NOT normalize coordinates.

    Args:
        models: List of VectorizationResult objects

    Returns:
        Single VectorizationResult with all elements combined
    """
    # Concatenate all walls
    # Concatenate all rooms
    # Concatenate all doors
    # Concatenate all text_blocks
    # Use first model's metadata as base
    # Return merged VectorizationResult

def normalize_to_bounding_box(
    model: VectorizationResult,
) -> VectorizationResult:
    """
    Normalize all coordinates to [0,1] relative to bounding box.

    Bounding box computed from all wall points.

    Args:
        model: VectorizationResult with coordinates in any space

    Returns:
        VectorizationResult with coordinates in [0,1]
    """
    # Find min_x, min_y, max_x, max_y from all wall points
    # width = max_x - min_x
    # height = max_y - min_y
    # For each point: x_norm = (x - min_x) / width
    # Apply to walls, rooms (polygon + center), doors

def check_duplicate_rooms(
    rooms: List[Room],
    distance_threshold: float = 30.0,
) -> List[str]:
    """
    Detect rooms with same name located close together.

    Args:
        rooms: List of Room objects
        distance_threshold: Max distance (pixels) to consider duplicate

    Returns:
        List of warning messages (empty if no duplicates)
    """
    # Group rooms by name
    # For each group with >1 room:
    #   Check pairwise distances between centers
    #   If distance < threshold → add warning
    # Return list of warnings
```

**Reference:** Ticket sections "Шаг 6-7 — Объединение" (lines 461-469) and "Шаг 8 — Проверка дубликатов" (lines 471-486)

### `backend/tests/processing/stitching/test_merge.py`

**Tests from 04-testing.md to implement here:**
- `test_merge_models_concatenates_walls`
- `test_merge_models_concatenates_rooms`
- `test_merge_models_concatenates_doors`
- `test_merge_models_empty_plans_returns_empty`
- `test_normalize_to_bounding_box_coords_in_range`
- `test_normalize_to_bounding_box_uses_all_walls`
- `test_normalize_to_bounding_box_consistent_scale`
- `test_check_duplicate_rooms_close_detected`
- `test_check_duplicate_rooms_far_not_detected`
- `test_check_duplicate_rooms_threshold_configurable`

**Example test:**
```python
def test_merge_models_concatenates_walls():
    # Arrange
    model_a = VectorizationResult(
        walls=[Wall(id="w1", points=[Point2D(x=0.0, y=0.0), Point2D(x=1.0, y=0.0)])],
        rooms=[],
        doors=[],
        image_size_original=(1000, 800),
        image_size_cropped=(1000, 800),
    )
    model_b = VectorizationResult(
        walls=[Wall(id="w2", points=[Point2D(x=0.0, y=1.0), Point2D(x=1.0, y=1.0)])],
        rooms=[],
        doors=[],
        image_size_original=(1000, 800),
        image_size_cropped=(1000, 800),
    )

    # Act
    merged = merge_models([model_a, model_b])

    # Assert
    assert len(merged.walls) == 2
    assert merged.walls[0].id == "w1"
    assert merged.walls[1].id == "w2"
```

**Reference:** 04-testing.md "Processing Function Coverage" → merge.py

## Files to Modify

None.

## Verification

- [ ] `python -m py_compile backend/app/processing/stitching/merge.py` passes
- [ ] `pytest backend/tests/processing/stitching/test_merge.py -v` passes (9 tests)
- [ ] All functions have type hints (args + return)
- [ ] All functions have docstrings
- [ ] No imports from `api/`, `db/`, `services/` (pure functions only)
- [ ] Normalization verified: all coords in [0,1] after normalize_to_bounding_box()
- [ ] Duplicate detection threshold is configurable (default 30.0)
- [ ] Empty models handled gracefully (no division by zero)
