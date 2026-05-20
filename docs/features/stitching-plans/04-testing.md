# Testing Strategy: Stitching-Plans

## Test Rules

**From prompts/testing.md:**
- AAA pattern: Arrange → Act → Assert
- Naming: `test_{function}_{scenario}_{expected}`
- Processing tests: no DB, only numpy/Shapely
- Service tests: mock repositories
- API tests: full stack with TestClient

## Test Structure

```
backend/tests/
├── processing/
│   └── stitching/
│       ├── test_transform.py
│       ├── test_clip.py
│       ├── test_merge.py
│       └── test_image_stitch.py
├── services/
│   └── test_stitching_service.py
└── api/
    └── test_stitching_api.py

frontend/src/
└── __tests__/
    ├── useStitchingCanvas.test.ts
    └── useStitchingHistory.test.ts
```

## Coverage Mapping

### Processing Function Coverage

#### transform.py

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| build_affine_matrix() | Identity transform (scale=1, rotate=0, translate=0) returns identity matrix | test_build_affine_matrix_identity_returns_identity |
| build_affine_matrix() | Translation only moves point | test_build_affine_matrix_translate_only_moves_point |
| build_affine_matrix() | Scale only multiplies coordinates | test_build_affine_matrix_scale_only_multiplies_coords |
| build_affine_matrix() | Rotation 90° transforms (1,0) to (0,1) | test_build_affine_matrix_rotate_90_transforms_correctly |
| build_affine_matrix() | Combined transform applies in correct order (scale→rotate→translate) | test_build_affine_matrix_combined_correct_order |
| apply_affine_to_point() | Applies matrix to single point | test_apply_affine_to_point_transforms_correctly |
| apply_affine_to_polygon() | Applies matrix to all polygon points | test_apply_affine_to_polygon_transforms_all_points |
| apply_affine_to_polygon() | Empty polygon returns empty list | test_apply_affine_to_polygon_empty_returns_empty |

#### clip.py

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| clip_walls() | Wall fully inside clip polygon is removed | test_clip_walls_fully_inside_removed |
| clip_walls() | Wall fully outside clip polygon is unchanged | test_clip_walls_fully_outside_unchanged |
| clip_walls() | Wall partially intersecting clip polygon is trimmed | test_clip_walls_partially_intersecting_trimmed |
| clip_walls() | Wall crossing clip boundary creates multiple segments | test_clip_walls_crossing_creates_segments |
| clip_rooms() | Room center inside clip polygon is removed | test_clip_rooms_center_inside_removed |
| clip_rooms() | Room center outside clip polygon is kept | test_clip_rooms_center_outside_kept |
| clip_rooms() | Room polygon partially clipped updates polygon and center | test_clip_rooms_partial_clip_updates_polygon |
| clip_rooms() | Room fully clipped (empty result) is removed | test_clip_rooms_fully_clipped_removed |
| clip_doors() | Door inside clip polygon is removed | test_clip_doors_inside_removed |
| clip_doors() | Door outside clip polygon is kept | test_clip_doors_outside_kept |

#### merge.py

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| merge_models() | Concatenates walls from multiple plans | test_merge_models_concatenates_walls |
| merge_models() | Concatenates rooms from multiple plans | test_merge_models_concatenates_rooms |
| merge_models() | Concatenates doors from multiple plans | test_merge_models_concatenates_doors |
| merge_models() | Empty plans return empty model | test_merge_models_empty_plans_returns_empty |
| normalize_to_bounding_box() | All coordinates normalized to [0,1] | test_normalize_to_bounding_box_coords_in_range |
| normalize_to_bounding_box() | Bounding box computed from all walls | test_normalize_to_bounding_box_uses_all_walls |
| normalize_to_bounding_box() | Rooms and doors normalized with same scale | test_normalize_to_bounding_box_consistent_scale |
| check_duplicate_rooms() | Two rooms with same name close together detected | test_check_duplicate_rooms_close_detected |
| check_duplicate_rooms() | Two rooms with same name far apart not detected | test_check_duplicate_rooms_far_not_detected |
| check_duplicate_rooms() | Distance threshold configurable | test_check_duplicate_rooms_threshold_configurable |

#### image_stitch.py

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| stitch_raster_images() | Applies affine transform to each image | test_stitch_raster_images_applies_transform |
| stitch_raster_images() | Composites images in z-order | test_stitch_raster_images_respects_z_order |
| stitch_raster_images() | Returns image with correct bounding box size | test_stitch_raster_images_correct_size |

### Service Coverage

#### stitching_service.py

| Method | Scenario | Test Name |
|--------|----------|-----------|
| stitch_plans() | Happy path: 2 plans, no clip, no crop | test_stitch_plans_two_plans_no_clip_succeeds |
| stitch_plans() | With clip polygons applied | test_stitch_plans_with_clip_polygons_succeeds |
| stitch_plans() | With rect crop applied | test_stitch_plans_with_rect_crop_succeeds |
| stitch_plans() | Source plan not found raises error | test_stitch_plans_source_not_found_raises_404 |
| stitch_plans() | Duplicate rooms detected returns warnings | test_stitch_plans_duplicate_rooms_returns_warnings |
| stitch_plans() | Empty result (all clipped) raises error | test_stitch_plans_all_clipped_raises_400 |
| stitch_plans() | Saves new reconstruction with correct fields | test_stitch_plans_saves_reconstruction_correctly |

### API Endpoint Coverage

#### POST /api/v1/stitching/

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| POST /api/v1/stitching/ | 201 | test_post_stitching_valid_request_returns_201 |
| POST /api/v1/stitching/ | 400 (invalid transform) | test_post_stitching_invalid_transform_returns_400 |
| POST /api/v1/stitching/ | 400 (<2 plans) | test_post_stitching_less_than_two_plans_returns_400 |
| POST /api/v1/stitching/ | 404 (source not found) | test_post_stitching_source_not_found_returns_404 |
| POST /api/v1/stitching/ | 500 (processing error) | test_post_stitching_processing_error_returns_500 |

#### GET /api/v1/reconstructions?status=ready_for_stitching

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| GET /reconstructions?status=ready_for_stitching | 200 | test_get_reconstructions_ready_for_stitching_returns_200 |
| GET /reconstructions?status=ready_for_stitching | 200 (empty) | test_get_reconstructions_no_ready_returns_empty_list |

### Frontend Coverage

#### useStitchingCanvas.ts

| Hook Function | Scenario | Test Name |
|---------------|----------|-----------|
| loadPlanToCanvas() | Loads image and vector mask as fabric.Group | test_load_plan_to_canvas_creates_group |
| exportState() | Exports transforms and clip polygons | test_export_state_includes_transforms_and_clips |
| applyPolygonClip() | Applies clipPath to selected layer | test_apply_polygon_clip_updates_layer |

#### useStitchingHistory.ts

| Hook Function | Scenario | Test Name |
|---------------|----------|-----------|
| pushState() | Adds snapshot to history | test_push_state_adds_snapshot |
| undo() | Restores previous state | test_undo_restores_previous_state |
| redo() | Restores next state | test_redo_restores_next_state |
| pushState() | FIFO removes oldest when >50 | test_push_state_fifo_removes_oldest |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing (transform.py) | 8 |
| Processing (clip.py) | 10 |
| Processing (merge.py) | 9 |
| Processing (image_stitch.py) | 3 |
| Service | 7 |
| API | 7 |
| Frontend (hooks) | 7 |
| **TOTAL** | **51** |

## Critical End-to-End Tests

### E2E Test 1: Room Names Preserved After Full Pipeline

**Purpose:** Verify that room names and positions survive the full transformation pipeline.

```python
def test_e2e_room_names_preserved_after_full_pipeline():
    """
    Create 2 models with rooms (A301, A302) and (A303, A304).
    Apply different transforms to each.
    Merge and normalize.
    Assert all 4 rooms present with correct names.
    Assert all room centers in [0, 1].
    """
    # Arrange
    plan_a = create_model_with_rooms(["A301", "A302"])
    plan_b = create_model_with_rooms(["A303", "A304"])

    transform_a = build_affine_matrix(1.0, 1.0, 0, 0, 0)
    transform_b = build_affine_matrix(1.0, 1.0, 0, 500, 0)

    # Act
    transformed_a = apply_transforms(plan_a, transform_a)
    transformed_b = apply_transforms(plan_b, transform_b)
    merged = merge_models([transformed_a, transformed_b])
    normalized = normalize_to_bounding_box(merged)

    # Assert
    assert len(normalized.rooms) == 4
    room_names = {r.name for r in normalized.rooms}
    assert room_names == {"A301", "A302", "A303", "A304"}

    for room in normalized.rooms:
        assert 0.0 <= room.center.x <= 1.0
        assert 0.0 <= room.center.y <= 1.0
```

### E2E Test 2: Door Positions Match Walls After Transform

**Purpose:** Verify that doors remain on walls after affine transformation.

```python
def test_e2e_door_positions_match_walls_after_transform():
    """
    Create model with wall and door on that wall.
    Apply rotation + translation.
    Assert door still on wall (distance < threshold).
    """
    # Arrange
    wall = Wall(id="w1", points=[
        Point2D(x=0.0, y=0.5),
        Point2D(x=1.0, y=0.5),
    ])
    door = Door(id="d1", position=Point2D(x=0.5, y=0.5))  # Middle of wall
    model = VectorizationResult(walls=[wall], doors=[door], ...)

    # Act
    matrix = build_affine_matrix(1.0, 1.0, 45, 100, 100)  # Rotate 45°
    transformed = apply_transforms(model, matrix)

    # Assert
    door_pos = transformed.doors[0].position
    wall_line = LineString([
        (transformed.walls[0].points[0].x, transformed.walls[0].points[0].y),
        (transformed.walls[0].points[1].x, transformed.walls[0].points[1].y),
    ])
    door_point = Point(door_pos.x, door_pos.y)
    distance = door_point.distance(wall_line)

    assert distance < 0.01, f"Door not on wall after transform (distance={distance})"
```

### E2E Test 3: Full API Request to Response

**Purpose:** Integration test covering full stitching flow.

```python
async def test_e2e_full_stitching_request(client: AsyncClient, db_session):
    """
    Create 2 reconstructions in DB.
    POST /api/v1/stitching/ with transforms.
    Assert 201 response.
    Assert new reconstruction in DB with merged data.
    """
    # Arrange
    recon_a = await create_reconstruction(db_session, name="Plan A", rooms=["A301"])
    recon_b = await create_reconstruction(db_session, name="Plan B", rooms=["A302"])

    request = {
        "name": "Merged Floor 3",
        "building_id": "building-uuid",
        "floor_number": 3,
        "source_plans": [
            {
                "reconstruction_id": str(recon_a.id),
                "transform": {"translate_x": 0, "translate_y": 0, "scale_x": 1.0, "scale_y": 1.0, "rotation_deg": 0},
                "clip_polygons": [],
                "rect_crop": None,
                "image_width_px": 1000,
                "image_height_px": 800,
                "z_index": 0,
            },
            {
                "reconstruction_id": str(recon_b.id),
                "transform": {"translate_x": 500, "translate_y": 0, "scale_x": 1.0, "scale_y": 1.0, "rotation_deg": 0},
                "clip_polygons": [],
                "rect_crop": None,
                "image_width_px": 1000,
                "image_height_px": 800,
                "z_index": 1,
            },
        ],
    }

    # Act
    response = await client.post("/api/v1/stitching/", json=request)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Merged Floor 3"
    assert data["rooms_count"] == 2
    assert len(data["source_reconstruction_ids"]) == 2

    # Verify DB
    merged_recon = await db_session.get(Reconstruction, data["id"])
    assert merged_recon is not None
    vectorization = json.loads(merged_recon.vectorization_data)
    assert len(vectorization["rooms"]) == 2
```

## Test Fixtures

### Backend Fixtures

```python
# backend/tests/processing/stitching/conftest.py

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
def two_room_model() -> VectorizationResult:
    """Model with 2 rooms and 1 door."""
    return VectorizationResult(
        walls=[
            Wall(id="w1", points=[Point2D(x=0.0, y=0.0), Point2D(x=1.0, y=0.0)]),
            Wall(id="w2", points=[Point2D(x=0.0, y=1.0), Point2D(x=1.0, y=1.0)]),
        ],
        rooms=[
            Room(id="r1", name="A301", polygon=[...], center=Point2D(x=0.25, y=0.5)),
            Room(id="r2", name="A302", polygon=[...], center=Point2D(x=0.75, y=0.5)),
        ],
        doors=[
            Door(id="d1", position=Point2D(x=0.5, y=0.5), width=0.1),
        ],
        image_size_original=(1000, 800),
        image_size_cropped=(1000, 800),
    )

@pytest.fixture
def clip_polygon_square():
    """Square clip polygon (100x100 at origin)."""
    from shapely.geometry import Polygon
    return Polygon([(0, 0), (100, 0), (100, 100), (0, 100)])
```

## Test Execution Commands

```bash
# Run all stitching tests
pytest backend/tests/processing/stitching/ -v

# Run with coverage
pytest backend/tests/processing/stitching/ --cov=app.processing.stitching --cov-report=html

# Run specific test file
pytest backend/tests/processing/stitching/test_transform.py -v

# Run specific test
pytest backend/tests/processing/stitching/test_transform.py::test_build_affine_matrix_identity_returns_identity -v

# Run service tests
pytest backend/tests/services/test_stitching_service.py -v

# Run API tests
pytest backend/tests/api/test_stitching_api.py -v

# Run all tests (backend + frontend)
pytest backend/tests/ -v && npm test --prefix frontend
```

## Coverage Goals

- **Processing functions:** 100% line coverage (pure functions, easy to test)
- **Service layer:** 90% line coverage (mock DB, focus on business logic)
- **API layer:** 85% line coverage (integration tests, cover main paths + errors)
- **Frontend hooks:** 80% line coverage (mock Fabric.js, test state management)

## Test Data

### Sample Transformation Matrices

```python
# Identity (no change)
IDENTITY_MATRIX = np.array([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
])

# Translate (100, 50)
TRANSLATE_MATRIX = np.array([
    [1, 0, 100],
    [0, 1, 50],
    [0, 0, 1],
])

# Scale 2x
SCALE_MATRIX = np.array([
    [2, 0, 0],
    [0, 2, 0],
    [0, 0, 1],
])

# Rotate 90° (counterclockwise)
ROTATE_90_MATRIX = np.array([
    [0, -1, 0],
    [1,  0, 0],
    [0,  0, 1],
])
```

### Sample Clip Polygons

```python
# Square at origin
CLIP_SQUARE = [(0, 0), (100, 0), (100, 100), (0, 100)]

# Triangle
CLIP_TRIANGLE = [(0, 0), (100, 0), (50, 100)]

# L-shape (overlap zone)
CLIP_L_SHAPE = [(0, 0), (50, 0), (50, 50), (100, 50), (100, 100), (0, 100)]
```
