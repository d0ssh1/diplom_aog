# Testing Strategy: edit-plan-restore

## Test Rules
- Follow `prompts/testing.md`: AAA pattern, explicit test names, and coverage for happy path + error path.
- Frontend behavior should be validated at the data-mapping level where possible; backend persistence must be covered with API/service tests.
- The bugfix must have tests that prove geometry is not flattened during restore/save.

## Test Structure

```text
backend/tests/
├── api/
│   └── test_reconstruction_vectors_api.py
├── services/
│   └── test_reconstruction_service.py
└── processing/
    └── (none for this bugfix)

frontend/src/
└── __tests__/
    └── edit-plan-restore.spec.tsx (if test harness exists)
```

## Coverage Mapping

### Frontend Data-Mapping Coverage

| Function / Flow | Business Rule | Test Name |
|-----------------|---------------|-----------|
| EditPlanPage load mapping | Polygon rooms must be preserved in in-memory edit data instead of being silently reshaped into a new geometry | test_edit_plan_load_preserves_polygon_geometry |
| EditPlanPage save mapping | Saving without edits must not rewrite stored polygon geometry into a new synthetic rectangle | test_edit_plan_save_does_not_flatten_room_geometry |
| WallEditorCanvas restore | Restored annotations must render from the canonical annotation model and maintain room type styling | test_wall_editor_restore_renders_initial_rooms |

### Backend Service / API Coverage

| Method / Endpoint | Scenario | Test Name |
|-------------------|----------|-----------|
| get_vectorization_data() | Valid stored vector JSON with polygon rooms | test_get_vectorization_data_returns_vector_model |
| get_vectorization_data() | Missing or invalid vector JSON | test_get_vectorization_data_invalid_json_returns_none |
| update_vectorization_data() | Persist updated vectors | test_update_vectorization_data_saves_json |
| GET /reconstruction/reconstructions/{id}/vectors | Existing reconstruction returns vectors | test_get_reconstruction_vectors_200 |
| PUT /reconstruction/reconstructions/{id}/vectors | Valid payload persists | test_update_reconstruction_vectors_200 |
| PUT /reconstruction/reconstructions/{id}/vectors | Invalid payload returns validation error | test_update_reconstruction_vectors_400 |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Frontend data mapping | 2-3 |
| Backend service | 2 |
| Backend API | 2 |
| Processing | 0 |
| **TOTAL** | **6-7** |

## Notes
- No image-processing tests are required because the bug is not in `processing/`.
- The key regression check is that loading and saving the same reconstruction does not replace existing polygons with generated 4-point rectangles.
