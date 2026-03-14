# Code Plan: Vectorization Pipeline

date: 2026-03-14
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — Build from domain models → processing functions → services → API → tests.

**Why bottom-up:**
- Domain models (VectorizationResult, Room, Door, TextBlock) are foundation for everything
- Processing functions are pure, no dependencies — can be built and tested independently
- Services orchestrate processing functions — need processing layer complete first
- API endpoints consume services — need services complete first
- Tests can be written alongside each layer

**Alternative considered:** Vertical slice (one endpoint end-to-end). Rejected because processing pipeline has 8 interdependent steps — better to build all processing functions first, then wire them together in services.

---

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Domain Models | models/domain.py | — | ☐ |
| 2 | Pipeline Functions (Steps 1-3) | processing/pipeline.py | Phase 1 | ☐ |
| 3 | Pipeline Functions (Steps 4-6) | processing/pipeline.py | Phase 1 | ☐ |
| 4 | Pipeline Functions (Steps 7-8) | processing/pipeline.py | Phase 1 | ☐ |
| 5 | Database Migration | db/models, alembic | Phase 1 | ☐ |
| 6 | Service Integration (MaskService) | services/mask_service.py | Phase 2, 3 | ☐ |
| 7 | Service Integration (ReconstructionService) | services/reconstruction_service.py | Phase 4, 5 | ☐ |
| 8 | API Endpoints | api/reconstruction.py | Phase 7 | ☐ |
| 9 | Tests (Processing) | tests/processing/ | Phase 2, 3, 4 | ☐ |
| 10 | Tests (Services) | tests/services/ | Phase 6, 7 | ☐ |
| 11 | Tests (API) | tests/api/ | Phase 8 | ☐ |
| 12 | Integration Tests | tests/ | Phase 8 | ☐ |

---

## File Map

### New Files

**Domain Models:**
- `backend/app/models/domain.py` — MODIFIED: extend VectorizationResult, add Room, Door, TextBlock

**Processing Functions:**
- `backend/app/processing/pipeline.py` — NEW: 8-step pipeline functions (normalize_brightness, color_filter, auto_crop_suggest, text_detect, remove_text_regions, room_detect, classify_rooms, door_detect, assign_room_numbers, compute_wall_thickness, compute_scale_factor, normalize_coords)

**Database:**
- `backend/app/db/models/reconstruction.py` — MODIFIED: add vectorization_data column (Text)
- `backend/alembic/versions/{timestamp}_add_vectorization_data.py` — NEW: migration

**Tests:**
- `backend/tests/processing/test_pipeline.py` — NEW: 32 tests for pipeline functions
- `backend/tests/services/test_mask_service.py` — MODIFIED: add 8 tests for new integration
- `backend/tests/services/test_reconstruction_service.py` — MODIFIED: add 9 tests for VectorizationResult
- `backend/tests/api/test_reconstruction.py` — MODIFIED: add 17 tests for new endpoints
- `backend/tests/conftest.py` — MODIFIED: add fixtures for VectorizationResult testing
- `backend/tests/processing/conftest.py` — MODIFIED: add image fixtures

### Modified Files

**Services:**
- `backend/app/services/mask_service.py` — MODIFIED: integrate BinarizationService + pipeline steps 1-6
- `backend/app/services/reconstruction_service.py` — MODIFIED: integrate ContourService + pipeline steps 7-8, save VectorizationResult

**API:**
- `backend/app/api/reconstruction.py` — MODIFIED: add GET/PUT /reconstructions/{id}/vectors endpoints

**Repositories:**
- `backend/app/db/repositories/reconstruction_repo.py` — MODIFIED: add update_vectorization_data() method

---

## Success Criteria

- [ ] All phases completed and verified
- [ ] All 86 tests passing (73 new + 13 existing)
- [ ] Build clean: `python -m py_compile backend/app/**/*.py`
- [ ] Lint clean: `flake8 backend/app/` (or project linter)
- [ ] Type check clean: `mypy backend/app/` (if used)
- [ ] All acceptance criteria from ../README.md met:
  - [ ] AC 1-12: Pipeline steps work correctly
  - [ ] AC 13: VectorizationResult structure complete
  - [ ] AC 14: VectorizationResult persisted to DB
  - [ ] AC 15: New API endpoints work
  - [ ] AC 16: mesh_builder accepts VectorizationResult
  - [ ] AC 17: Existing tests pass
  - [ ] AC 18: New tests ≥ 10 (73 new tests)
  - [ ] AC 19: processing/ remains pure
- [ ] Manual verification:
  - [ ] Upload plan 1 (with room numbers) → rooms have names
  - [ ] Upload plan 2 (without room numbers) → rooms have empty names
  - [ ] Upload plan 3 (rotated) → rotation_angle saved
  - [ ] Color filtering removes green arrows
  - [ ] Auto-crop suggests building boundary
  - [ ] GET /vectors returns VectorizationResult
  - [ ] PUT /vectors updates data

---

## Implementation Notes

1. **pytesseract dependency:** Make optional. If not installed, text_detect returns empty list, system continues.

2. **Coordinate validation:** Pydantic Field(ge=0.0, le=1.0) validates all coordinates in [0, 1] range automatically.

3. **Error handling:** All processing functions raise ImageProcessingError(message, step=step_name) for consistent error reporting.

4. **Logging:** Use logging module, not print(). Add performance logging (time.perf_counter) for each pipeline step.

5. **Backward compatibility:** Old reconstructions (vectorization_data=NULL) handled gracefully. GET /vectors returns 404 if NULL.

6. **Testing strategy:**
   - Processing tests use synthetic images (fixtures in conftest.py)
   - Service tests mock dependencies (AsyncMock for repo, Mock for processing)
   - API tests use TestClient with in-memory DB

7. **Phase order:** Must follow dependencies. Cannot start Phase 6 until Phase 2-3 complete. Cannot start Phase 7 until Phase 4-5 complete.

8. **Verification per phase:** Each phase has verification checklist. Must pass before moving to next phase.
