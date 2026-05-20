# Code Plan: Stitching-Plans

date: 2026-03-22
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — Build from pure functions → service → API → frontend.

**Rationale:** Processing functions are the foundation. They must be correct and tested before service layer uses them. Service layer must work before API exposes it. Frontend is last because it depends on working API.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Processing: Transform | Processing | — | ☐ |
| 2 | Processing: Clip | Processing | — | ☐ |
| 3 | Processing: Merge | Processing | Phase 1, 2 | ☐ |
| 4 | Processing: Image Stitch | Processing | Phase 1 | ☐ |
| 5 | Models: Pydantic | Models | — | ☐ |
| 6 | Service: Stitching | Service | Phase 1-5 | ☐ |
| 7 | API: Router | API | Phase 5, 6 | ☐ |
| 8 | Frontend: Types | Frontend | — | ☐ |
| 9 | Frontend: Hooks (History) | Frontend | Phase 8 | ☐ |
| 10 | Frontend: Hooks (Canvas) | Frontend | Phase 8, 9 | ☐ |
| 11 | Frontend: Components (Step 1) | Frontend | Phase 8 | ☐ |
| 12 | Frontend: Components (Step 2) | Frontend | Phase 8, 9, 10 | ☐ |
| 13 | Frontend: Page | Frontend | Phase 11, 12 | ☐ |
| 14 | Integration | Full Stack | All | ☐ |

## File Map

### New Files

**Backend:**
- `backend/app/processing/stitching/__init__.py` — exports
- `backend/app/processing/stitching/transform.py` — affine transforms
- `backend/app/processing/stitching/clip.py` — Shapely clipping
- `backend/app/processing/stitching/merge.py` — model merging + normalization
- `backend/app/processing/stitching/image_stitch.py` — raster stitching
- `backend/app/models/stitching.py` — Pydantic models
- `backend/app/services/stitching_service.py` — orchestration
- `backend/app/api/stitching.py` — router
- `backend/tests/processing/stitching/test_transform.py` — transform tests
- `backend/tests/processing/stitching/test_clip.py` — clip tests
- `backend/tests/processing/stitching/test_merge.py` — merge tests
- `backend/tests/processing/stitching/test_image_stitch.py` — image tests
- `backend/tests/processing/stitching/conftest.py` — fixtures
- `backend/tests/services/test_stitching_service.py` — service tests
- `backend/tests/api/test_stitching_api.py` — API tests

**Frontend:**
- `frontend/src/types/stitching.ts` — TypeScript types
- `frontend/src/hooks/useStitchingHistory.ts` — undo/redo
- `frontend/src/hooks/useStitchingCanvas.ts` — Fabric.js logic
- `frontend/src/hooks/useStitching.ts` — main state management
- `frontend/src/components/Stitching/PlanSelectionStep.tsx` — step 1
- `frontend/src/components/Stitching/StitchingCanvas.tsx` — canvas
- `frontend/src/components/Stitching/ToolPanel.tsx` — tools
- `frontend/src/components/Stitching/LayerPanel.tsx` — layers
- `frontend/src/components/Stitching/PropertiesPanel.tsx` — properties
- `frontend/src/components/Stitching/StitchingSidebar.tsx` — sidebar
- `frontend/src/pages/StitchingPage.tsx` — page orchestrator

### Modified Files

**Backend:**
- `backend/app/api/__init__.py` — register stitching router
- `backend/app/main.py` — include stitching router
- `backend/requirements.txt` — add shapely>=2.0.0
- `backend/app/db/models/reconstruction.py` — add source_reconstruction_ids, is_stitched fields (optional, can use JSON in vectorization_data)

**Frontend:**
- `frontend/src/App.tsx` — add /stitching route
- `frontend/src/api/apiService.ts` — add getReadyReconstructions(), postStitching()
- `frontend/src/components/Layout/Sidebar.tsx` — add "Сшивание планов" menu item

## Success Criteria

- [ ] All phases completed and verified
- [ ] All 51 tests passing (see ../04-testing.md)
- [ ] Backend: `pytest backend/tests/processing/stitching/ -v` passes
- [ ] Backend: `pytest backend/tests/services/test_stitching_service.py -v` passes
- [ ] Backend: `pytest backend/tests/api/test_stitching_api.py -v` passes
- [ ] Frontend: `npx tsc --noEmit` passes
- [ ] Backend: `python -m flake8 backend/app/processing/stitching/` passes
- [ ] Backend: `python -m flake8 backend/app/services/stitching_service.py` passes
- [ ] Backend: `python -m flake8 backend/app/api/stitching.py` passes
- [ ] API contract matches implementation (see ../05-api-contract.md)
- [ ] All acceptance criteria from ../README.md met
- [ ] Manual test: stitch 2 plans, verify merged model has all rooms

## Dependencies

**Python packages to add:**
- `shapely>=2.0.0` — polygon operations

**Frontend packages:**
- No new packages (Fabric.js already installed)

## Estimated Complexity

| Phase | Complexity | Reason |
|-------|-----------|--------|
| 1-4 (Processing) | Medium | Pure functions, well-defined math, but need careful testing |
| 5 (Models) | Low | Straightforward Pydantic models |
| 6 (Service) | Medium | Orchestration logic, error handling |
| 7 (API) | Low | Thin router, validation |
| 8-10 (Frontend Hooks) | High | Fabric.js integration, undo/redo, state management |
| 11-13 (Frontend Components) | Medium | UI assembly, styling to match existing |
| 14 (Integration) | Low | End-to-end testing |

**Total estimated effort:** 5-7 days for experienced developer familiar with codebase.
