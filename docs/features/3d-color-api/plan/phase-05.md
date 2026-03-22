# Phase 5: API Endpoint Update

phase: 5
layer: api
depends_on: phase-01, phase-03, phase-04
design: ../README.md

## Goal

Update the `POST /api/v1/reconstruction/reconstructions` endpoint to extract `wall_color` from request and pass to service.

## Context

Phase 1 created color validation.
Phase 3 updated service to accept and validate color.
Phase 4 added `wall_color` field to request model.

This phase connects them: extract from request → pass to service → handle errors → return response.

## Files to Create

### `backend/tests/api/test_reconstruction_api_color.py`

**Tests from 04-testing.md to implement here:**
- `test_calculate_mesh_with_valid_hex_color_201`
- `test_calculate_mesh_with_valid_rgba_color_201`
- `test_calculate_mesh_no_color_uses_default_201`
- `test_calculate_mesh_invalid_hex_color_400`
- `test_calculate_mesh_invalid_rgba_color_400`
- `test_calculate_mesh_response_includes_glb_url`

## Files to Modify

### `backend/app/api/reconstruction.py`

**What changes:**
- Update `calculate_mesh()` endpoint to extract `wall_color` from request
- Pass `wall_color` to `svc.build_mesh()`
- Handle `ValueError` from service (invalid color) and return 400 with exact error message

**Lines affected:** ~126-150 (calculate_mesh function)

**Implementation details:**
- Endpoint already receives `CalculateMeshRequest` (which now has `wall_color` field)
- Extract: `wall_color = request.wall_color`
- Pass to service: `await svc.build_mesh(..., wall_color=wall_color)`
- Catch `ValueError` from service and return 400:
  ```python
  except ValueError as e:
      logger.error("Invalid wall_color: %s", e)
      raise HTTPException(
          status_code=status.HTTP_400_BAD_REQUEST,
          detail=str(e)  # Error message from service layer
      )
  ```

**Error flow:**
1. API receives `wall_color` parameter
2. Service validates via `parse_color()` → raises `ColorParseError` if invalid
3. Service catches `ColorParseError` → re-raises as `ValueError` with exact message
4. API catches `ValueError` → returns 400 with error message
5. Error messages match 05-api-contract.md exactly

**Error handling:**
- Service raises `ValueError` if color is invalid
- Router catches and returns 400 with error message from service
- Existing error handling for mask not found (404) and mesh generation failure (500) unchanged

**Reference:** 02-behavior.md for error cases, 05-api-contract.md for exact response format, prompts/python_style.md for router patterns

## Verification

- [ ] `python -m py_compile backend/app/api/reconstruction.py` passes
- [ ] `python -m pytest backend/tests/api/test_reconstruction_api_color.py -v` passes (all 6 tests)
- [ ] Valid hex color → 201 with GLB URL
- [ ] Valid RGBA array → 201 with GLB URL
- [ ] No color parameter → 201 with default color
- [ ] Invalid hex → 400 with error message
- [ ] Invalid RGBA → 400 with error message
- [ ] Response includes `url` field pointing to GLB file
- [ ] Existing tests still pass (backward compatible)
