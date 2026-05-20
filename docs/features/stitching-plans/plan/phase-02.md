# Phase 2: Processing — Clip

phase: 2
layer: processing
depends_on: none
design: ../README.md

## Goal

Implement pure functions for clipping walls, rooms, and doors using Shapely polygon operations. Removes elements inside clip polygons (subtract operation).

## Context

This phase is independent of Phase 1. Can be implemented in parallel.

**Key requirement:** Functions must be pure (no DB, no HTTP, no side effects). Only Shapely operations.

## Files to Create

### `backend/app/processing/stitching/clip.py`

**Purpose:** Polygon clipping operations using Shapely.

**Implementation details:**
- **Clip semantics:** "subtract" = remove what's INSIDE the clip polygon
- **Wall clipping:** Use `LineString.difference()` to subtract clip polygon
- **Room clipping:** Check if center is inside clip polygon. If yes, remove. If polygon intersects, trim polygon and recalculate center.
- **Door clipping:** Check if position is inside clip polygon. If yes, remove.

**Key functions:**

```python
from typing import List
from shapely.geometry import Polygon, LineString, MultiLineString, Point
from app.models.domain import Wall, Room, Door, Point2D

def clip_walls(
    walls: List[Wall],
    clip_polygon: Polygon,
) -> List[Wall]:
    """
    Remove walls inside clip polygon.

    Walls fully inside → removed
    Walls fully outside → unchanged
    Walls intersecting → trimmed (may create multiple segments)

    Args:
        walls: List of Wall objects
        clip_polygon: Shapely Polygon to subtract

    Returns:
        List of Wall objects after clipping
    """
    # For each wall:
    #   Convert points to LineString
    #   diff = line.difference(clip_polygon)
    #   If empty → skip
    #   If LineString → create Wall
    #   If MultiLineString → create multiple Walls

def clip_rooms(
    rooms: List[Room],
    clip_polygon: Polygon,
) -> List[Room]:
    """
    Remove rooms whose center is inside clip polygon.

    If room polygon intersects clip boundary, trim polygon and recalculate center.

    Args:
        rooms: List of Room objects
        clip_polygon: Shapely Polygon to subtract

    Returns:
        List of Room objects after clipping
    """
    # For each room:
    #   Check if center inside clip_polygon
    #   If yes → skip
    #   Check if polygon intersects clip_polygon
    #   If yes → trim polygon, recalculate center
    #   If no → keep unchanged

def clip_doors(
    doors: List[Door],
    clip_polygon: Polygon,
) -> List[Door]:
    """
    Remove doors inside clip polygon.

    Args:
        doors: List of Door objects
        clip_polygon: Shapely Polygon to subtract

    Returns:
        List of Door objects after clipping
    """
    # For each door:
    #   Check if position inside clip_polygon
    #   If no → keep
```

**Reference:** Ticket section "Шаг 5 — Clip polygons" (lines 385-459)

### `backend/tests/processing/stitching/test_clip.py`

**Tests from 04-testing.md to implement here:**
- `test_clip_walls_fully_inside_removed`
- `test_clip_walls_fully_outside_unchanged`
- `test_clip_walls_partially_intersecting_trimmed`
- `test_clip_walls_crossing_creates_segments`
- `test_clip_rooms_center_inside_removed`
- `test_clip_rooms_center_outside_kept`
- `test_clip_rooms_partial_clip_updates_polygon`
- `test_clip_rooms_fully_clipped_removed`
- `test_clip_doors_inside_removed`
- `test_clip_doors_outside_kept`

**Example test:**
```python
def test_clip_walls_fully_inside_removed():
    # Arrange
    wall = Wall(
        id="w1",
        points=[Point2D(x=0.3, y=0.5), Point2D(x=0.7, y=0.5)],
        thickness=0.2,
    )
    clip_poly = Polygon([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])

    # Act
    result = clip_walls([wall], clip_poly)

    # Assert
    assert len(result) == 0
```

**Reference:** 04-testing.md "Processing Function Coverage" → clip.py

### Fixtures to add to `conftest.py`

```python
@pytest.fixture
def clip_polygon_square():
    """Square clip polygon (100x100 at origin)."""
    from shapely.geometry import Polygon
    return Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])

@pytest.fixture
def two_room_model() -> VectorizationResult:
    """Model with 2 rooms and 1 door."""
    return VectorizationResult(
        walls=[
            Wall(id="w1", points=[Point2D(x=0.0, y=0.0), Point2D(x=1.0, y=0.0)]),
            Wall(id="w2", points=[Point2D(x=0.0, y=1.0), Point2D(x=1.0, y=1.0)]),
        ],
        rooms=[
            Room(
                id="r1",
                name="A301",
                polygon=[Point2D(x=0.0, y=0.0), Point2D(x=0.5, y=0.0), Point2D(x=0.5, y=1.0), Point2D(x=0.0, y=1.0)],
                center=Point2D(x=0.25, y=0.5),
                room_type="room",
                area_normalized=0.5,
            ),
            Room(
                id="r2",
                name="A302",
                polygon=[Point2D(x=0.5, y=0.0), Point2D(x=1.0, y=0.0), Point2D(x=1.0, y=1.0), Point2D(x=0.5, y=1.0)],
                center=Point2D(x=0.75, y=0.5),
                room_type="room",
                area_normalized=0.5,
            ),
        ],
        doors=[
            Door(id="d1", position=Point2D(x=0.5, y=0.5), width=0.1),
        ],
        image_size_original=(1000, 800),
        image_size_cropped=(1000, 800),
    )
```

## Files to Modify

- `backend/requirements.txt` — add `shapely>=2.0.0`

**Change:**
```diff
+ shapely>=2.0.0
```

## Verification

- [ ] `python -m py_compile backend/app/processing/stitching/clip.py` passes
- [ ] `pytest backend/tests/processing/stitching/test_clip.py -v` passes (10 tests)
- [ ] All functions have type hints (args + return)
- [ ] All functions have docstrings
- [ ] No imports from `api/`, `db/`, `services/` (pure functions only)
- [ ] Shapely installed: `python -c "import shapely; print(shapely.__version__)"` shows 2.x
- [ ] Clip semantics verified: subtract (delete inside), not keep (delete outside)
