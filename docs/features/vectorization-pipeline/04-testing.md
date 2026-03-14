# Testing Strategy: Vectorization Pipeline

## Test Rules

Following `prompts/testing.md`:
- **AAA pattern:** Arrange → Act → Assert
- **Naming:** `test_{function}_{condition}_{expected_result}`
- **Processing tests:** No DB, only numpy/cv2, use synthetic images
- **Service tests:** Mock repositories, test orchestration logic
- **API tests:** TestClient, in-memory DB, full stack

## Test Structure

```
backend/tests/
├── conftest.py                          ← global fixtures (db, client)
├── processing/
│   ├── conftest.py                      ← test image fixtures
│   ├── test_pipeline.py                 ← NEW: color_filter, auto_crop, text_detect, room_detect, door_detect
│   ├── test_binarization.py             ← EXISTING: BinarizationService tests
│   └── test_contours.py                 ← EXISTING: ContourService tests
├── services/
│   ├── test_mask_service.py             ← MODIFIED: add tests for new pipeline integration
│   └── test_reconstruction_service.py   ← MODIFIED: add tests for VectorizationResult
└── api/
    └── test_reconstruction.py           ← MODIFIED: add tests for GET/PUT /vectors endpoints
```

---

## Coverage Mapping

Every business rule, error case, and edge case must trace to a test.

### Processing Function Coverage (processing/pipeline.py)

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| normalize_brightness() | CLAHE on low-contrast image increases contrast | test_normalize_brightness_low_contrast_increases_contrast |
| normalize_brightness() | Already uniform image unchanged | test_normalize_brightness_uniform_image_unchanged |
| color_filter() | Green pixels (H=60°, S>50) removed | test_color_filter_green_pixels_removed |
| color_filter() | Red pixels (H=0°, S>50) removed | test_color_filter_red_pixels_removed |
| color_filter() | Gray pixels (S<50) preserved | test_color_filter_gray_pixels_preserved |
| color_filter() | Inpaint fills removed regions | test_color_filter_inpaint_fills_gaps |
| auto_crop_suggest() | Detects building boundary (largest contour >20% area) | test_auto_crop_suggest_finds_building |
| auto_crop_suggest() | Excludes mini-plan (small contour <20% area) | test_auto_crop_suggest_excludes_miniplan |
| auto_crop_suggest() | Returns None if no large contour | test_auto_crop_suggest_no_boundary_returns_none |
| text_detect() | Detects room number pattern "1103" | test_text_detect_finds_room_number_digits_only |
| text_detect() | Detects room number pattern "A304" | test_text_detect_finds_room_number_letter_prefix |
| text_detect() | Detects room number pattern "1103А" | test_text_detect_finds_room_number_cyrillic_suffix |
| text_detect() | Non-matching text marked is_room_number=False | test_text_detect_non_room_text_not_marked |
| text_detect() | Empty image returns empty list | test_text_detect_empty_image_returns_empty |
| remove_text_regions() | Inpaints text bounding boxes | test_remove_text_regions_inpaints_boxes |
| room_detect() | Inverts mask: walls→0, spaces→255 | test_room_detect_inverts_mask |
| room_detect() | Connected components finds rooms | test_room_detect_rectangle_image_finds_one_room |
| room_detect() | Filters small components (area < min_area) | test_room_detect_filters_noise |
| room_detect() | Computes room center (centroid) | test_room_detect_computes_center |
| classify_rooms() | Aspect ratio >3:1 → corridor | test_classify_rooms_long_narrow_is_corridor |
| classify_rooms() | Aspect ratio ≤3:1 → room | test_classify_rooms_square_is_room |
| door_detect() | Dilates walls, finds gaps between rooms | test_door_detect_gap_between_rooms_is_door |
| door_detect() | No gaps → no doors | test_door_detect_no_gaps_returns_empty |
| door_detect() | Sets door.connects to adjacent room IDs | test_door_detect_sets_connected_rooms |
| assign_room_numbers() | Text center inside room polygon → assigns name | test_assign_room_numbers_text_inside_room |
| assign_room_numbers() | Text outside all rooms → no assignment | test_assign_room_numbers_text_outside_ignored |
| assign_room_numbers() | Multiple texts in one room → first wins | test_assign_room_numbers_multiple_texts_first_wins |
| compute_wall_thickness() | Distance transform → median of nonzero | test_compute_wall_thickness_returns_median |
| compute_wall_thickness() | Empty mask → returns 0 | test_compute_wall_thickness_empty_mask_returns_zero |
| compute_scale_factor() | wall_thickness_px / 0.2m | test_compute_scale_factor_standard_wall |
| compute_scale_factor() | wall_thickness_px=0 → default 50.0 | test_compute_scale_factor_zero_thickness_returns_default |
| normalize_coords() | Converts pixel coords to [0,1] | test_normalize_coords_pixel_to_normalized |
| normalize_coords() | Validates all coords in [0,1] | test_normalize_coords_all_in_range |

### Service Coverage (services/)

| Method | Scenario | Test Name |
|--------|----------|-----------|
| MaskService.calculate_mask() | Valid file, no crop → processes full image | test_calculate_mask_no_crop_processes_full_image |
| MaskService.calculate_mask() | Valid file, with crop → applies crop | test_calculate_mask_with_crop_applies_crop |
| MaskService.calculate_mask() | Valid file, with rotation → rotates image | test_calculate_mask_with_rotation_rotates_image |
| MaskService.calculate_mask() | File not found → raises FileStorageError | test_calculate_mask_file_not_found_raises_error |
| MaskService.calculate_mask() | Invalid image → raises ImageProcessingError | test_calculate_mask_invalid_image_raises_error |
| MaskService.calculate_mask() | Calls BinarizationService.binarize_otsu | test_calculate_mask_calls_binarization_service |
| MaskService.calculate_mask() | Calls pipeline.color_filter | test_calculate_mask_calls_color_filter |
| MaskService.calculate_mask() | Calls pipeline.text_detect | test_calculate_mask_calls_text_detect |
| ReconstructionService.build_mesh() | Valid mask → creates VectorizationResult | test_build_mesh_valid_mask_creates_vectorization_result |
| ReconstructionService.build_mesh() | Saves VectorizationResult to DB as JSON | test_build_mesh_saves_vectorization_result_to_db |
| ReconstructionService.build_mesh() | Calls ContourService.extract_elements | test_build_mesh_calls_contour_service |
| ReconstructionService.build_mesh() | Calls pipeline.room_detect | test_build_mesh_calls_room_detect |
| ReconstructionService.build_mesh() | Calls pipeline.door_detect | test_build_mesh_calls_door_detect |
| ReconstructionService.build_mesh() | Mask not found → updates status=ERROR | test_build_mesh_mask_not_found_sets_error_status |
| ReconstructionService.build_mesh() | Processing fails → updates status=ERROR, saves error_message | test_build_mesh_processing_fails_sets_error_status |
| ReconstructionService.get_vectorization_data() | Reconstruction exists, data present → returns VectorizationResult | test_get_vectorization_data_returns_result |
| ReconstructionService.get_vectorization_data() | Reconstruction exists, data NULL → returns None | test_get_vectorization_data_null_returns_none |
| ReconstructionService.get_vectorization_data() | Reconstruction not found → returns None | test_get_vectorization_data_not_found_returns_none |
| ReconstructionService.update_vectorization_data() | Valid data → updates DB | test_update_vectorization_data_updates_db |
| ReconstructionService.update_vectorization_data() | Reconstruction not found → raises error | test_update_vectorization_data_not_found_raises_error |

### API Endpoint Coverage (api/reconstruction.py)

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| POST /reconstruction/initial-masks | 200 | test_calculate_initial_mask_valid_request_returns_200 |
| POST /reconstruction/initial-masks | 400 (invalid file_id) | test_calculate_initial_mask_invalid_file_id_returns_400 |
| POST /reconstruction/initial-masks | 400 (empty crop) | test_calculate_initial_mask_empty_crop_returns_400 |
| POST /reconstruction/initial-masks | 404 (file not found) | test_calculate_initial_mask_file_not_found_returns_404 |
| POST /reconstruction/initial-masks | 500 (processing error) | test_calculate_initial_mask_processing_error_returns_500 |
| POST /reconstruction/reconstructions | 200 | test_calculate_mesh_valid_request_returns_200 |
| POST /reconstruction/reconstructions | 200 (includes vectorization metadata) | test_calculate_mesh_response_includes_vectorization_metadata |
| POST /reconstruction/reconstructions | 404 (mask not found) | test_calculate_mesh_mask_not_found_returns_404 |
| POST /reconstruction/reconstructions | 500 (processing error) | test_calculate_mesh_processing_error_returns_500 |
| GET /reconstruction/reconstructions/{id}/vectors | 200 | test_get_vectors_valid_id_returns_200 |
| GET /reconstruction/reconstructions/{id}/vectors | 200 (VectorizationResult schema valid) | test_get_vectors_returns_valid_schema |
| GET /reconstruction/reconstructions/{id}/vectors | 404 (reconstruction not found) | test_get_vectors_not_found_returns_404 |
| GET /reconstruction/reconstructions/{id}/vectors | 404 (vectorization_data NULL) | test_get_vectors_null_data_returns_404 |
| GET /reconstruction/reconstructions/{id}/vectors | 500 (corrupted JSON) | test_get_vectors_corrupted_json_returns_500 |
| GET /reconstruction/reconstructions/{id}/vectors | 401 (no auth) | test_get_vectors_no_auth_returns_401 |
| PUT /reconstruction/reconstructions/{id}/vectors | 200 | test_update_vectors_valid_data_returns_200 |
| PUT /reconstruction/reconstructions/{id}/vectors | 400 (invalid schema) | test_update_vectors_invalid_schema_returns_400 |
| PUT /reconstruction/reconstructions/{id}/vectors | 400 (coords out of range) | test_update_vectors_invalid_coords_returns_400 |
| PUT /reconstruction/reconstructions/{id}/vectors | 404 (reconstruction not found) | test_update_vectors_not_found_returns_404 |
| PUT /reconstruction/reconstructions/{id}/vectors | 401 (no auth) | test_update_vectors_no_auth_returns_401 |

### Integration Tests (end-to-end)

| Scenario | Test Name |
|----------|-----------|
| Full pipeline: upload → mask → mesh → retrieve vectors | test_full_pipeline_end_to_end |
| Plan with room numbers → room.name populated | test_full_pipeline_with_room_numbers |
| Plan without room numbers → room.name empty | test_full_pipeline_without_room_numbers |
| Plan with thick walls → wall_thickness computed correctly | test_full_pipeline_thick_walls |
| Plan with thin walls → wall_thickness computed correctly | test_full_pipeline_thin_walls |
| Phone photo (uneven lighting) → adaptive binarization used | test_full_pipeline_phone_photo |
| Scan (uniform contrast) → Otsu binarization used | test_full_pipeline_scan |

---

## Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing (pipeline.py) | 32 |
| Processing (binarization.py) | 5 (existing) |
| Processing (contours.py) | 8 (existing) |
| Services (mask_service.py) | 8 |
| Services (reconstruction_service.py) | 9 |
| API (reconstruction.py) | 17 |
| Integration | 7 |
| **TOTAL** | **86** |

**New tests:** 32 (pipeline) + 8 (mask_service) + 9 (reconstruction_service) + 17 (API) + 7 (integration) = **73 new tests**

**Existing tests:** 5 (binarization) + 8 (contours) = **13 existing tests** (should still pass)

---

## Test Fixtures (tests/processing/conftest.py)

```python
import pytest
import numpy as np
import cv2

@pytest.fixture
def blank_white_image() -> np.ndarray:
    """White 200x200 image."""
    return np.ones((200, 200, 3), dtype=np.uint8) * 255

@pytest.fixture
def simple_room_image() -> np.ndarray:
    """Image with one rectangular room (black walls on white background)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), thickness=3)
    return img

@pytest.fixture
def corridor_image() -> np.ndarray:
    """Image with long narrow corridor (aspect ratio > 3:1)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 80), (180, 120), (0, 0, 0), thickness=3)
    return img

@pytest.fixture
def two_rooms_with_door_image() -> np.ndarray:
    """Image with two rooms separated by wall with gap (door)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    # Left room
    cv2.rectangle(img, (20, 20), (95, 180), (0, 0, 0), thickness=3)
    # Right room
    cv2.rectangle(img, (105, 20), (180, 180), (0, 0, 0), thickness=3)
    # Gap between rooms (door) at x=95-105, y=90-110
    return img

@pytest.fixture
def image_with_green_arrow() -> np.ndarray:
    """Image with green evacuation arrow (should be filtered)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    # Draw green arrow (BGR: 0, 255, 0)
    pts = np.array([[100, 50], [150, 100], [100, 150]], dtype=np.int32)
    cv2.fillPoly(img, [pts], (0, 255, 0))
    return img

@pytest.fixture
def image_with_red_symbol() -> np.ndarray:
    """Image with red fire extinguisher symbol (should be filtered)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    # Draw red circle (BGR: 0, 0, 255)
    cv2.circle(img, (100, 100), 20, (0, 0, 255), -1)
    return img

@pytest.fixture
def image_with_miniplan() -> np.ndarray:
    """Image with main building and small mini-plan in corner."""
    img = np.ones((400, 400, 3), dtype=np.uint8) * 255
    # Main building (large, >20% area)
    cv2.rectangle(img, (50, 50), (350, 350), (0, 0, 0), thickness=5)
    # Mini-plan in corner (small, <20% area)
    cv2.rectangle(img, (10, 10), (60, 60), (0, 0, 0), thickness=2)
    return img

@pytest.fixture
def binary_mask_simple_room() -> np.ndarray:
    """Binary mask with one room (walls=255, background=0)."""
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.rectangle(mask, (20, 20), (180, 180), 255, thickness=3)
    return mask

@pytest.fixture
def binary_mask_two_rooms() -> np.ndarray:
    """Binary mask with two rooms separated by wall."""
    mask = np.zeros((200, 200), dtype=np.uint8)
    # Left room
    cv2.rectangle(mask, (20, 20), (95, 180), 255, thickness=3)
    # Right room
    cv2.rectangle(mask, (105, 20), (180, 180), 255, thickness=3)
    return mask

@pytest.fixture
def sample_text_blocks() -> list:
    """Sample text blocks with room numbers."""
    from app.models.domain import TextBlock, Point2D
    return [
        TextBlock(text="1103", center=Point2D(x=0.25, y=0.25), is_room_number=True),
        TextBlock(text="A304", center=Point2D(x=0.75, y=0.75), is_room_number=True),
        TextBlock(text="EXIT", center=Point2D(x=0.5, y=0.9), is_room_number=False),
    ]

@pytest.fixture
def sample_rooms() -> list:
    """Sample rooms for testing."""
    from app.models.domain import Room, Point2D
    return [
        Room(
            id="room1",
            name="",
            polygon=[Point2D(x=0.1, y=0.1), Point2D(x=0.4, y=0.1), Point2D(x=0.4, y=0.4), Point2D(x=0.1, y=0.4)],
            center=Point2D(x=0.25, y=0.25),
            room_type="room",
            area_normalized=0.09,
        ),
        Room(
            id="room2",
            name="",
            polygon=[Point2D(x=0.6, y=0.6), Point2D(x=0.9, y=0.6), Point2D(x=0.9, y=0.9), Point2D(x=0.6, y=0.9)],
            center=Point2D(x=0.75, y=0.75),
            room_type="room",
            area_normalized=0.09,
        ),
    ]
```

---

## Test Execution

```bash
# Run all tests
pytest backend/tests/ -v

# Run only processing tests
pytest backend/tests/processing/ -v

# Run only new pipeline tests
pytest backend/tests/processing/test_pipeline.py -v

# Run with coverage
pytest backend/tests/ --cov=backend/app --cov-report=html

# Run integration tests only
pytest backend/tests/ -v -k "test_full_pipeline"
```

---

## Acceptance Criteria Coverage

Each acceptance criterion from README.md maps to tests:

| AC # | Criterion | Tests |
|------|-----------|-------|
| 1 | Color filtering removes green/red | test_color_filter_green_pixels_removed, test_color_filter_red_pixels_removed |
| 2 | Auto-crop detects building, excludes mini-plan | test_auto_crop_suggest_finds_building, test_auto_crop_suggest_excludes_miniplan |
| 3 | Adaptive binarization (Otsu/adaptive) | test_full_pipeline_scan, test_full_pipeline_phone_photo |
| 4 | Text detection via pytesseract | test_text_detect_finds_room_number_* |
| 5 | Room numbers assigned by containment | test_assign_room_numbers_text_inside_room |
| 6 | Plans without room numbers work | test_full_pipeline_without_room_numbers |
| 7 | Room detection via mask inversion | test_room_detect_inverts_mask, test_room_detect_rectangle_image_finds_one_room |
| 8 | Corridor classification (aspect ratio) | test_classify_rooms_long_narrow_is_corridor |
| 9 | Door detection (gaps between rooms) | test_door_detect_gap_between_rooms_is_door |
| 10 | Wall thickness via distance transform | test_compute_wall_thickness_returns_median |
| 11 | Scale factor computed | test_compute_scale_factor_standard_wall |
| 12 | Coordinates normalized to [0,1] | test_normalize_coords_pixel_to_normalized, test_normalize_coords_all_in_range |
| 13 | VectorizationResult structure | test_build_mesh_valid_mask_creates_vectorization_result, test_get_vectors_returns_valid_schema |
| 14 | VectorizationResult persisted as JSON | test_build_mesh_saves_vectorization_result_to_db |
| 15 | New API endpoints | test_get_vectors_valid_id_returns_200, test_update_vectors_valid_data_returns_200 |
| 16 | mesh_builder accepts VectorizationResult | (tested in integration test_full_pipeline_end_to_end) |
| 17 | Existing tests pass | (run full test suite) |
| 18 | New tests ≥ 10 | 71 new tests created |
| 19 | processing/ remains pure | (verified by import checks in tests) |
