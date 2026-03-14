# Code Plan: Vectorization Pipeline — Phases 6-12

## Phase 6: Service Integration (MaskService)

**Goal:** Integrate BinarizationService + pipeline steps 1-6 into MaskService.

**Modify:** `backend/app/services/mask_service.py`

**Changes:**
- Replace `preprocess_image()` call with pipeline steps:
  1. normalize_brightness()
  2. color_filter()
  3. auto_crop_suggest() (if no user crop provided)
  4. BinarizationService.binarize_otsu() or apply_adaptive_threshold()
  5. text_detect()
  6. remove_text_regions()
- Save text_blocks for later use in ReconstructionService
- Return mask_file_id + text_blocks

**Verification:**
- [ ] calculate_mask() calls all 6 steps
- [ ] Saves mask to uploads/masks/
- [ ] Returns mask_file_id
- [ ] Handles errors gracefully

---

## Phase 7: Service Integration (ReconstructionService)

**Goal:** Integrate ContourService + pipeline steps 7-8, save VectorizationResult to DB.

**Modify:** `backend/app/services/reconstruction_service.py`

**Changes:**
- Replace `find_contours()` call with:
  1. ContourService.extract_elements() → walls
  2. compute_wall_thickness()
  3. room_detect()
  4. classify_rooms()
  5. door_detect()
  6. assign_room_numbers(rooms, text_blocks)
  7. normalize_coords()
  8. compute_scale_factor()
  9. Assemble VectorizationResult
  10. Save to DB: repo.update_vectorization_data(json.dumps(result.model_dump()))
- Add methods: get_vectorization_data(), update_vectorization_data()

**Verification:**
- [ ] build_mesh() creates VectorizationResult
- [ ] Saves to DB as JSON
- [ ] get_vectorization_data() retrieves and deserializes
- [ ] update_vectorization_data() updates DB

---

## Phase 8: API Endpoints

**Goal:** Add GET/PUT /reconstructions/{id}/vectors endpoints.

**Modify:** `backend/app/api/reconstruction.py`

**Add endpoints:**

```python
@router.get("/reconstructions/{id}/vectors", response_model=VectorizationResult)
async def get_vectorization_data(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
) -> VectorizationResult:
    """Retrieve vectorization data for reconstruction."""
    result = await svc.get_vectorization_data(id)
    if result is None:
        raise HTTPException(status_code=404, detail="Vectorization data not available")
    return result


@router.put("/reconstructions/{id}/vectors", response_model=dict)
async def update_vectorization_data(
    id: int,
    data: VectorizationResult,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
) -> dict:
    """Update vectorization data (from floor-editor)."""
    await svc.update_vectorization_data(id, data)
    return {"message": "Vectorization data updated"}
```

**Verification:**
- [ ] GET /vectors returns 200 with VectorizationResult
- [ ] GET /vectors returns 404 if data is NULL
- [ ] PUT /vectors updates data
- [ ] PUT /vectors validates schema (Pydantic)
- [ ] Auth required (401 if no token)

---

## Phase 9: Tests (Processing)

**Goal:** Write 32 tests for pipeline functions.

**Create:** `backend/tests/processing/test_pipeline.py`

**Tests:** See `../04-testing.md` lines 37-71 for full list.

**Key tests:**
- test_normalize_brightness_low_contrast_increases_contrast
- test_color_filter_green_pixels_removed
- test_auto_crop_suggest_finds_building
- test_text_detect_finds_room_number_digits_only
- test_room_detect_rectangle_image_finds_one_room
- test_classify_rooms_long_narrow_is_corridor
- test_door_detect_gap_between_rooms_is_door
- test_normalize_coords_pixel_to_normalized

**Fixtures:** Add to `backend/tests/processing/conftest.py`:
- blank_white_image, simple_room_image, corridor_image, two_rooms_with_door_image
- image_with_green_arrow, image_with_red_symbol, image_with_miniplan
- binary_mask_simple_room, binary_mask_two_rooms
- sample_text_blocks, sample_rooms

**Verification:**
- [ ] pytest backend/tests/processing/test_pipeline.py -v
- [ ] All 32 tests pass
- [ ] Coverage: pytest --cov=backend/app/processing/pipeline.py

---

## Phase 10: Tests (Services)

**Goal:** Add 17 tests for service integration.

**Modify:**
- `backend/tests/services/test_mask_service.py` — add 8 tests
- `backend/tests/services/test_reconstruction_service.py` — add 9 tests

**Key tests:**
- test_calculate_mask_calls_binarization_service
- test_calculate_mask_calls_color_filter
- test_build_mesh_creates_vectorization_result
- test_build_mesh_saves_vectorization_result_to_db
- test_get_vectorization_data_returns_result
- test_update_vectorization_data_updates_db

**Verification:**
- [ ] pytest backend/tests/services/ -v
- [ ] All new tests pass
- [ ] Mock dependencies (AsyncMock for repo)

---

## Phase 11: Tests (API)

**Goal:** Add 17 tests for API endpoints.

**Modify:** `backend/tests/api/test_reconstruction.py`

**Key tests:**
- test_calculate_initial_mask_empty_crop_returns_400
- test_get_vectors_valid_id_returns_200
- test_get_vectors_returns_valid_schema
- test_get_vectors_null_data_returns_404
- test_get_vectors_corrupted_json_returns_500
- test_update_vectors_valid_data_returns_200
- test_update_vectors_invalid_schema_returns_400
- test_update_vectors_invalid_coords_returns_400

**Verification:**
- [ ] pytest backend/tests/api/test_reconstruction.py -v
- [ ] All new tests pass
- [ ] TestClient with in-memory DB

---

## Phase 12: Integration Tests

**Goal:** End-to-end tests for full pipeline.

**Create:** `backend/tests/test_integration_vectorization.py`

**Tests:**
- test_full_pipeline_end_to_end
- test_full_pipeline_with_room_numbers
- test_full_pipeline_without_room_numbers
- test_full_pipeline_thick_walls
- test_full_pipeline_phone_photo
- test_full_pipeline_scan

**Verification:**
- [ ] pytest backend/tests/test_integration_vectorization.py -v
- [ ] All 7 integration tests pass
- [ ] Full pipeline: upload → mask → mesh → retrieve vectors

---

## Final Verification

After all phases complete:

- [ ] All 86 tests passing
- [ ] Build clean: python -m py_compile backend/app/**/*.py
- [ ] No imports from api/services/db in processing/
- [ ] Manual test: upload plan 1 → rooms have names
- [ ] Manual test: upload plan 2 → rooms have empty names
- [ ] Manual test: GET /vectors returns VectorizationResult
- [ ] Manual test: PUT /vectors updates data
- [ ] All 19 acceptance criteria met (see plan/README.md)
