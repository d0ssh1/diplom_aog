# Phase 3: Service Layer Update

phase: 3
layer: service
depends_on: phase-01, phase-02
design: ../README.md

## Goal

Update ReconstructionService to accept, validate, and pass custom wall colors to mesh builder.

## Context

Phase 1 created color validation (`color_utils.py`).
Phase 2 updated mesh generator to accept `wall_color` parameter.

This phase orchestrates: validate color → pass to mesh builder → handle errors.

## Files to Create

### `backend/tests/services/test_reconstruction_service_color.py`

**Tests from 04-testing.md to implement here:**
- `test_build_mesh_with_valid_hex_color_succeeds`
- `test_build_mesh_with_valid_rgba_array_succeeds`
- `test_build_mesh_no_color_uses_default`
- `test_build_mesh_invalid_color_raises_error`
- `test_build_mesh_color_passed_to_generator`

## Files to Modify

### `backend/app/services/reconstruction_service.py`

**What changes:**
- Import `parse_color` and `ColorParseError` from `color_utils`
- Update `build_mesh()` method signature to accept `wall_color` parameter
- **ONLY in service layer:** Validate color via `parse_color()` before passing to mesh builder
- Handle `ColorParseError` and convert to appropriate exception
- Pass pre-validated RGBA array to mesh builder (processing layer receives only valid colors)

**Lines affected:** ~54-65 (method signature), ~130-145 (color validation), ~160-180 (pass to mesh_builder)

**Implementation details:**
- Method `async def build_mesh(..., wall_color: str | list | None = None) -> Reconstruction`
  - Accept optional `wall_color` parameter (string or list)
  - **Validate immediately:** Call `parse_color(wall_color)` to validate and normalize to RGBA array
  - If `ColorParseError` raised, log and re-raise as `ValueError` with message from 05-api-contract.md
  - Pass normalized RGBA array to `build_mesh_from_mask(wall_color=rgba_array)`
  - If None, pass None (mesh builder uses default)

**Error handling:**
- Catch `ColorParseError` from `parse_color()`
- Log error with context: `logger.error("Invalid wall_color: %s", e)`
- Re-raise as `ValueError` with exact message from 05-api-contract.md:
  - For hex errors: `"Invalid wall_color: expected #RRGGBB, #RRGGBBAA, or [R, G, B, A] array"`
  - For RGBA errors: `"Invalid wall_color: RGBA values must be integers in range [0, 255]"`
- Router catches `ValueError` and returns 400 (see Phase 5)

**Architecture principle:**
- Service layer = validation + orchestration
- Processing layer = pure functions (no validation)
- API layer = thin routing

**Reference:** 02-behavior.md for error cases, 01-architecture.md for service responsibilities, 05-api-contract.md for exact error messages

## Verification

- [ ] `python -m py_compile backend/app/services/reconstruction_service.py` passes
- [ ] `python -m pytest backend/tests/services/test_reconstruction_service_color.py -v` passes (all 5 tests)
- [ ] Service layer validates color before mesh generation
- [ ] Invalid colors raise `ValueError` (caught by router)
- [ ] Existing calls without `wall_color` still work
