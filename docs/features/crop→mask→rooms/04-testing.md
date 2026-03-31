# Testing Strategy: crop→mask→rooms

## Test Rules
- Use the AAA pattern from `prompts/testing.md`.
- Processing tests should not use the database.
- Service tests should mock repositories and external file access where possible.
- API tests should cover happy path and relevant error cases.
- Frontend behavior that affects geometry should be covered by component or integration tests if the project already supports them.

## Test Structure

```text
backend/tests/
├── processing/
│   └── test_*.py
├── services/
│   └── test_*.py
└── api/
    └── test_*.py
```

## Coverage Mapping

### Processing / Geometry Coverage
The current feature does not introduce a new backend processing function in the existing codebase. The relevant behavior is the frontend geometry transform pipeline.

| Function / Behavior | Business Rule | Test Name |
|---------------------|---------------|-----------|
| `WallEditorCanvas` plan transform effect | Applies the same crop and rotation basis for the visible plan | `test_wall_canvas_display_plan_matches_crop_and_rotation` |
| `WallEditorCanvas` room normalization | Normalizes rooms against the shared background basis | `test_wall_canvas_room_normalization_uses_background_bounds` |
| `WallEditorCanvas` door normalization | Normalizes doors against the shared background basis | `test_wall_canvas_door_normalization_uses_background_bounds` |
| `StepWallEditor` preview refresh | Regenerates mask preview when crop/rotation changes | `test_step_wall_editor_refreshes_mask_when_crop_or_rotation_changes` |

### Service / API Coverage

| Method / Endpoint | Scenario | Test Name |
|-------------------|----------|-----------|
| `PUT /reconstruction/reconstructions/{id}/vectors` | Save edited rooms and doors | `test_update_vectorization_data_saves_rooms_and_doors` |
| `GET /reconstruction/reconstructions/{id}/vectors` | Load crop/rotation/vector data for editor | `test_get_vectorization_data_returns_crop_and_rooms` |
| `POST /reconstruction/nav-graph` | Build nav graph from normalized room/door data | `test_build_nav_graph_uses_editor_geometry` |
| `POST /reconstruction/mask-preview` | Generate preview with crop/rotation | `test_mask_preview_respects_crop_and_rotation` |
| `GET /reconstruction/reconstructions/{id}` | Rehydrate editor with stored file ids and URLs | `test_get_reconstruction_returns_plan_and_mask_urls` |

### Frontend Coverage

| Behavior | Scenario | Test Name |
|----------|----------|-----------|
| Step 2 → Step 3 handoff | Crop and rotation propagate into mask preview | `test_wizard_passes_crop_and_rotation_to_wall_editor` |
| Edit reopening | Stored vectors rehydrate into room/door annotations | `test_edit_plan_page_maps_vectors_to_annotations` |
| Save flow | Edited geometry is sent before nav graph build | `test_wizard_save_sends_annotations_before_building_nav_graph` |

## Test Count Summary

| Layer | Tests |
|-------|-------|
| Frontend component / integration | 4 |
| API | 4 |
| Backend service / DB | 3 |
| Processing | 0 |
| **TOTAL** | **11** |

## Notes on Gaps
- There is no new pure `processing/` function identified for this fix, so there is no backend processing unit test target yet.
- Existing backend API tests for reconstruction behavior need to be verified separately before implementation; current search did not fully enumerate them.
