# Code Plan: crop→mask→rooms

date: 2026-03-31
design: ../README.md
status: draft

## Phase Strategy
Vertical slice — the bug spans frontend rendering, editor state hydration, and backend vector payloads, so the safest order is to align the shared geometry basis first and then wire save/rehydrate paths around that basis in the same slice.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Define shared editor geometry contract | models / api | — | ☐ |
| 2 | Align editor rendering and annotation normalization | frontend | Phase 1 | ☐ |
| 3 | Persist and rehydrate the shared geometry basis | backend / frontend | Phase 1, Phase 2 | ☐ |
| 4 | Verify geometry consistency with tests | tests | Phase 1, Phase 2, Phase 3 | ☐ |

## File Map

### New Files
- `backend/tests/api/test_reconstruction_vectors.py` — API coverage for vector payload save/load and crop/rotation fields.
- `frontend/src/components/Editor/__tests__/WallEditorCanvas.test.tsx` — editor geometry behavior coverage if the project already supports frontend tests.

### Modified Files
- `backend/app/models/reconstruction.py` — add or align vector payload schema fields for crop/rotation and normalized annotations.
- `backend/app/api/reconstruction.py` — ensure vector endpoints accept and return the shared geometry basis.
- `backend/app/db/models/reconstruction.py` — persist any missing vector metadata needed for editor rehydration.
- `backend/app/db/repositories/reconstruction_repo.py` — map vector metadata to/from storage.
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — use one shared transform basis for plan, mask, rooms, and doors.
- `frontend/src/components/Wizard/StepWallEditor.tsx` — pass the shared geometry data into the editor and refresh preview on crop/rotation changes.
- `frontend/src/pages/WizardPage.tsx` — keep wizard state as the source of truth for crop, rotation, mask, and annotations.
- `frontend/src/pages/EditPlanPage.tsx` — rehydrate editor state from stored vectors without introducing a second transform path.
- `frontend/src/api/apiService.ts` — type the vector payloads and preview requests so crop/rotation/annotations remain consistent.

## Success Criteria
- [ ] The plan and mask are rendered from the same crop/rotation basis in the editor.
- [ ] Rooms and doors saved from the editor match the visible geometry.
- [ ] Re-opened reconstructions restore the same room and door positions without drift.
- [ ] Nav graph generation uses the same normalized room/door coordinates that the editor saved.
- [ ] Relevant tests pass for the geometry/save/rehydration flow.
