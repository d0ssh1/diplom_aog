# Code Plan: edit-plan-restore

date: 2026-04-04
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up**, because the fix is a data-fidelity issue that starts at the API contract and state mapping, then flows into frontend restore/save behavior. The smallest safe path is to align the vector schema first, then adjust the edit-plan page and canvas mapping, then verify the API behavior with tests.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Define vector schema | Models/API contract | — | ☐ |
| 2 | Preserve vector payloads in backend | Service/API | Phase 1 | ☐ |
| 3 | Restore and save canonical geometry in frontend | Frontend | Phase 2 | ☐ |
| 4 | Add regression tests | Tests | Phases 1-3 | ☐ |

## File Map

### New Files
- `backend/app/models/reconstruction_vectors.py` — request/response DTOs for room/door vector payloads used by edit-plan restore/save.
- `backend/tests/api/test_reconstruction_vectors_api.py` — API regression tests for vectors round-trip.
- `backend/tests/services/test_reconstruction_service.py` — service tests for load/save JSON fidelity.
- `frontend/src/types/reconstructionVectors.ts` — typed frontend representation of stored vector data.
- `frontend/src/__tests__/edit-plan-restore.spec.tsx` — frontend regression tests for load/save mapping.

### Modified Files
- `backend/app/api/reconstruction.py` — expose vector endpoints with typed request/response models.
- `backend/app/services/reconstruction_service.py` — return and persist vector DTOs without flattening geometry.
- `frontend/src/pages/EditPlanPage.tsx` — stop regenerating polygons from bounding boxes on save; preserve loaded geometry.
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — keep restore mapping consistent with the canonical room annotation model.
- `frontend/src/api/apiService.ts` — type vector API helpers.
- `frontend/src/types/wizard.ts` — adjust room annotation contract if needed for canonical geometry flow.

## Success Criteria
- [ ] Edit-plan reopen shows the same rooms that were previously saved.
- [ ] Saving without edits does not rewrite polygon geometry into a new synthetic rectangle.
- [ ] API returns and persists the same room geometry shape end-to-end.
- [ ] Frontend tests prove restored annotations are not flattened during load/save.
- [ ] Backend tests prove vector JSON round-trips without data loss.
- [ ] All acceptance criteria from `../README.md` are met.
