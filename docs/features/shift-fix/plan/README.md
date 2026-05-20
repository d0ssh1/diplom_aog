# Code Plan: shift-fix

date: 2026-03-31
design: ../README.md
status: draft

## Phase Strategy
Bottom-up. The bug is caused by inconsistent geometry transforms, so the plan starts with the shared data model and processing transform rules, then updates services, then API/ frontend consumers.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Align geometry contract | Domain/Models | — | ☐ |
| 2 | Centralize transform pipeline | Processing | Phase 1 | ☐ |
| 3 | Preserve transform in services | Service | Phase 2 | ☐ |
| 4 | Pass consistent payloads from API | API | Phase 3 | ☐ |
| 5 | Sync editor and preprocess UI | Frontend | Phase 4 | ☐ |

## File Map

### New Files
- `backend/tests/processing/test_shift_fix.py` — processing coverage for normalization and transform consistency
- `backend/tests/services/test_shift_fix_service.py` — service coverage for preview/save/build flows
- `backend/tests/api/test_shift_fix_api.py` — API coverage for preview/reconstruction endpoints
- `frontend/src/__tests__/shift-fix.test.tsx` — frontend coverage for crop/editor payload consistency

### Modified Files
- `backend/app/models/domain.py` — carry crop/rotation metadata in vectorization/domain objects if needed
- `backend/app/models/reconstruction.py` — remove duplicate request model and align API schemas
- `backend/app/services/mask_service.py` — ensure preview/save use the same transform path
- `backend/app/services/reconstruction_service.py` — read/write geometry metadata without shifting coordinates
- `backend/app/services/nav_service.py` — consume the same normalized geometry frame
- `backend/app/processing/pipeline.py` — isolate and reuse transform/normalization helpers
- `backend/app/processing/nav_graph.py` — verify route conversion uses normalized coordinates consistently
- `frontend/src/components/Editor/CropOverlay.tsx` — keep crop rectangle normalization consistent with backend
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — preserve the same canvas origin when saving/reloading annotations
- `frontend/src/components/Wizard/StepPreprocess.tsx` — pass the same crop/rotation payload used by preview
- `frontend/src/components/Wizard/StepWallEditor.tsx` — forward transform metadata with preview updates
- `frontend/src/hooks/useWizard.ts` — keep transform state as the single source of truth for requests
- `frontend/src/api/apiService.ts` — ensure request payloads match the aligned contract

## Success Criteria
- [ ] All phases completed and verified
- [ ] All tests passing (see ../04-testing.md for full test list)
- [ ] Build clean
- [ ] Lint clean
- [ ] API contract matches implementation
- [ ] All acceptance criteria from ../README.md met
