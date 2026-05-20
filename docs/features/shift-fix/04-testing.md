# Testing Strategy: shift-fix

## Test Rules
Use the project testing standards from `prompts/testing.md`: AAA structure, explicit names, and coverage for processing, service, and API layers. For this feature, tests must verify that crop/rotation and coordinate transforms remain consistent across preview, saved mask, reconstruction, and nav graph flows.

## Test Structure
```text
backend/tests/
├── processing/
│   └── test_shift_fix.py
├── services/
│   └── test_shift_fix_service.py
└── api/
    └── test_shift_fix_api.py
```

## Coverage Mapping

### Processing Function Coverage

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| `normalize_coords(...)` | Converts image-space geometry into normalized `[0, 1]` coordinates consistently | `test_normalize_coords_returns_normalized_points` |
| `auto_crop_suggest(...)` | Crop suggestion does not change coordinate origin unexpectedly | `test_auto_crop_suggest_preserves_expected_origin` |
| `build_skeleton(...)` / `serialize_nav_graph(...)` | Route graph output uses the same geometry frame as the saved mask | `test_nav_graph_serialization_uses_same_coordinate_frame` |
| `preprocess_image(...)` | Preprocessing does not mutate the input image | `test_preprocess_image_does_not_mutate_input` |

### Service Coverage

| Method | Scenario | Test Name |
|--------|----------|-----------|
| `MaskService.preview_mask(...)` | Crop and rotation preview matches saved-mask frame | `test_preview_mask_uses_same_crop_and_rotation_as_saved_mask` |
| `MaskService.calculate_mask(...)` | Saved mask uses the same transform as preview | `test_calculate_mask_matches_preview_transform` |
| `ReconstructionService.build_mesh(...)` | Reconstruction uses the saved vectorization frame | `test_build_mesh_uses_saved_vectorization_frame` |
| `ReconstructionService.update_vectorization_data(...)` | Vectorization data round-trips without shifting geometry | `test_update_vectorization_data_preserves_geometry_frame` |
| `NavService.build_graph(...)` | Nav graph is generated from the same normalized coordinates | `test_build_graph_uses_normalized_coordinates` |

### API Endpoint Coverage

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| `POST /api/v1/reconstruction/mask-preview` | 200 | `test_mask_preview_valid_request_200` |
| `POST /api/v1/reconstruction/mask-preview` | 400 | `test_mask_preview_invalid_request_400` |
| `POST /api/v1/reconstruction/initial-masks` | 200 | `test_initial_masks_valid_request_200` |
| `PUT /api/v1/reconstruction/reconstructions/{id}/vectors` | 200 | `test_update_vectors_valid_request_200` |
| `POST /api/v1/reconstruction/reconstructions` | 200 | `test_build_reconstruction_valid_request_200` |
| `POST /api/v1/reconstruction/nav-graph` | 200 | `test_build_nav_graph_valid_request_200` |
| `POST /api/v1/reconstruction/route` | 200 | `test_find_route_valid_request_200` |

### Frontend Coverage

| Area | Scenario | Test Name |
|------|----------|-----------|
| `StepPreprocess` | Crop overlay and rotation state stay aligned with preview request | `test_step_preprocess_produces_expected_crop_payload` |
| `StepWallEditor` / `WallEditorCanvas` | Saved annotations preserve the same canvas origin | `test_wall_editor_canvas_preserves_annotation_origin` |
| `useWizard` | Mask preview / save / build sequence passes consistent transform parameters | `test_use_wizard_passes_consistent_transform_params` |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing | 4 |
| Service | 5 |
| API | 7 |
| Frontend | 3 |
| **TOTAL** | **19** |
