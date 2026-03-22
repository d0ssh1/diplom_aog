# Testing Strategy: 3D Color API

## Test Rules

Reference `prompts/testing.md`:
- AAA pattern (Arrange, Act, Assert)
- Naming: `test_{what}_{condition}_{expected_result}`
- Processing tests: no DB, only numpy/cv2
- Service tests: mock repositories
- API tests: full stack with TestClient

## Test Structure

```
backend/tests/
├── processing/
│   └── test_color_utils.py          ← Color parsing/validation
├── services/
│   └── test_reconstruction_service_color.py  ← Service with color param
└── api/
    └── test_reconstruction_api_color.py      ← API endpoint with color
```

## Coverage Mapping

### Color Utils Module (`processing/color_utils.py`)

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| `parse_color(value)` | Valid hex #RRGGBB → [R, G, B, 255] | `test_parse_color_valid_hex_6_returns_rgba` |
| `parse_color(value)` | Valid hex #RRGGBBAA → [R, G, B, A] | `test_parse_color_valid_hex_8_returns_rgba` |
| `parse_color(value)` | Valid RGBA array [0-255, 0-255, 0-255, 0-255] → same | `test_parse_color_valid_rgba_array_returns_same` |
| `parse_color(value)` | Invalid hex format → ColorParseError | `test_parse_color_invalid_hex_raises_error` |
| `parse_color(value)` | Invalid RGBA array (out of range) → ColorParseError | `test_parse_color_invalid_rgba_raises_error` |
| `parse_color(value)` | None/empty → uses default | `test_parse_color_none_returns_default` |
| `parse_color(value)` | Whitespace in hex → stripped | `test_parse_color_hex_with_whitespace_stripped` |
| `validate_rgba(rgba)` | Valid [R, G, B, A] → True | `test_validate_rgba_valid_returns_true` |
| `validate_rgba(rgba)` | Invalid length → False | `test_validate_rgba_invalid_length_returns_false` |
| `validate_rgba(rgba)` | Out of range value → False | `test_validate_rgba_out_of_range_returns_false` |

### ReconstructionService (`services/reconstruction_service.py`)

| Method | Scenario | Test Name |
|--------|----------|-----------|
| `build_mesh(wall_color="#FF5733")` | Valid hex color | `test_build_mesh_with_valid_hex_color_succeeds` |
| `build_mesh(wall_color=[255, 87, 51, 255])` | Valid RGBA array | `test_build_mesh_with_valid_rgba_array_succeeds` |
| `build_mesh(wall_color=None)` | Omitted color uses default | `test_build_mesh_no_color_uses_default` |
| `build_mesh(wall_color="INVALID")` | Invalid color raises error | `test_build_mesh_invalid_color_raises_error` |
| `build_mesh(wall_color="#FF5733")` | Color passed to mesh generator | `test_build_mesh_color_passed_to_generator` |

### API Endpoint (`api/reconstruction.py`)

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| POST /reconstructions + valid hex | 201 | `test_calculate_mesh_with_valid_hex_color_201` |
| POST /reconstructions + valid RGBA | 201 | `test_calculate_mesh_with_valid_rgba_color_201` |
| POST /reconstructions + no color | 201 | `test_calculate_mesh_no_color_uses_default_201` |
| POST /reconstructions + invalid hex | 400 | `test_calculate_mesh_invalid_hex_color_400` |
| POST /reconstructions + invalid RGBA | 400 | `test_calculate_mesh_invalid_rgba_color_400` |
| POST /reconstructions + response includes url | 201 | `test_calculate_mesh_response_includes_glb_url` |

## Test Count Summary

| Layer | Tests |
|-------|-------|
| Color Utils (processing) | 8 |
| ReconstructionService | 5 |
| API Endpoint | 6 |
| **TOTAL** | **19** |

## Fixtures

```python
# tests/processing/conftest.py
@pytest.fixture
def valid_hex_colors() -> list[str]:
    return ["#FF5733", "#000000", "#FFFFFF", "#4A4A4A"]

@pytest.fixture
def valid_rgba_colors() -> list[list[int]]:
    return [
        [255, 87, 51, 255],
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [74, 74, 74, 255],
    ]

@pytest.fixture
def invalid_colors() -> list:
    return [
        "FF5733",           # missing #
        "#FF57",            # too short
        "#FF573399",        # too long
        "#GGGGGG",          # invalid hex chars
        [256, 0, 0, 255],   # out of range
        [255, 0, 0],        # missing alpha
        "not a color",
    ]
```

## Integration Test

One end-to-end test verifying the full flow:

```python
async def test_e2e_generate_mesh_with_custom_color():
    """
    Full flow: upload mask → generate mesh with custom color → verify GLB has vertex colors.
    """
    # Arrange: create test mask file
    # Act: POST /reconstructions with wall_color="#FF5733"
    # Assert: response 201, GLB file exists, GLB contains vertex colors
```
