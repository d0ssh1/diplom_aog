# Phase 4: Add regression tests

phase: 4
layer: tests
depends_on: [phase-01, phase-02, phase-03]
design: ../README.md

## Goal
Add backend and frontend regression tests that prove edit-plan restore/save does not flatten room geometry.

## Context
The schema and implementation are aligned. This phase adds the safety net so the bug cannot regress.

## Files to Create

### `backend/tests/services/test_reconstruction_service.py`
**Tests from 04-testing.md to implement here:**
- test_get_vectorization_data_returns_vector_model
- test_get_vectorization_data_invalid_json_returns_none
- test_update_vectorization_data_saves_json

### `backend/tests/api/test_reconstruction_vectors_api.py`
**Tests from 04-testing.md to implement here:**
- test_get_reconstruction_vectors_200
- test_update_reconstruction_vectors_200
- test_update_reconstruction_vectors_400

### `frontend/src/__tests__/edit-plan-restore.spec.tsx`
**Tests from 04-testing.md to implement here:**
- test_edit_plan_load_preserves_polygon_geometry
- test_edit_plan_save_does_not_flatten_room_geometry
- test_wall_editor_restore_renders_initial_rooms

## Files to Modify

### `backend/tests/conftest.py` if needed
**What changes:** Add fixtures for reconstruction vector payloads.

## Verification
- [ ] All backend regression tests pass
- [ ] Frontend regression tests pass in the existing test harness
- [ ] The failing bug scenario is covered by at least one test at each relevant layer
