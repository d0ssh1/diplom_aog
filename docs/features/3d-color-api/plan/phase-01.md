# Phase 1: Color Parsing & Validation

phase: 1
layer: processing
depends_on: none
design: ../README.md

## Goal

Create pure functions for parsing and validating wall colors in hex (#RRGGBB/#RRGGBBAA) and RGBA array formats. These functions are the foundation for all color handling in the feature.

## Context

This is the first phase. No previous phases to depend on.

## Files to Create

### `backend/app/processing/color_utils.py`

**Purpose:** Pure functions for color parsing and validation. No imports from `api/`, `db/`, or `services/`. No side effects.

**Implementation details:**
- Function `parse_color(value: str | list | None) -> list[int]` — converts hex or RGBA to normalized RGBA array
  - Input: hex string (e.g., `"#FF5733"` or `"#FF573380"`), RGBA array (e.g., `[255, 87, 51, 255]`), or None
  - Output: RGBA array `[R, G, B, A]` where each value is 0-255
  - Raises `ColorParseError` with exact message if invalid:
    - For invalid hex: `"Invalid wall_color: expected #RRGGBB, #RRGGBBAA, or [R, G, B, A] array"`
    - For invalid RGBA: `"Invalid wall_color: RGBA values must be integers in range [0, 255]"`
  - Strips whitespace from hex strings
  - Defaults to `[74, 74, 74, 255]` (#4A4A4A) if None

- Function `validate_rgba(rgba: list) -> bool` — checks if RGBA array is valid
  - Input: list of 4 integers
  - Output: True if all values in [0, 255], False otherwise

- Exception class `ColorParseError(Exception)` — raised on invalid color
  - Stores error message for service layer to convert to ValueError

**Reference:** 02-behavior.md for error cases, 05-api-contract.md for color format spec and exact error messages

### `backend/tests/processing/test_color_utils.py`

**Tests from 04-testing.md to implement here:**
- `test_parse_color_valid_hex_6_returns_rgba`
- `test_parse_color_valid_hex_8_returns_rgba`
- `test_parse_color_valid_rgba_array_returns_same`
- `test_parse_color_invalid_hex_raises_error`
- `test_parse_color_invalid_rgba_raises_error`
- `test_parse_color_none_returns_default`
- `test_parse_color_hex_with_whitespace_stripped`
- `test_validate_rgba_valid_returns_true`
- `test_validate_rgba_invalid_length_returns_false`
- `test_validate_rgba_out_of_range_returns_false`

## Files to Modify

None in this phase.

## Verification

- [ ] `python -m py_compile backend/app/processing/color_utils.py` passes
- [ ] `python -m pytest backend/tests/processing/test_color_utils.py -v` passes (all 10 tests)
- [ ] No imports from `api/`, `db/`, `services/` in `color_utils.py`
- [ ] All functions are pure (no side effects, no global state)
