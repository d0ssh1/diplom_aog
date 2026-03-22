# Phase 6: Tests

phase: 6
layer: all
depends_on: phase-01, phase-02, phase-03, phase-04, phase-05
design: ../README.md

## Goal

Implement all unit and integration tests across all layers. Verify full feature coverage and backward compatibility.

## Context

All previous phases completed:
- Phase 1: `color_utils.py` with parsing/validation
- Phase 2: Mesh generator accepts `wall_color`
- Phase 3: Service validates and passes color
- Phase 4: Request model has `wall_color` field
- Phase 5: API endpoint extracts and passes color

This phase implements tests for all layers.

## Files to Create

Tests already listed in previous phases:
- `backend/tests/processing/test_color_utils.py` (Phase 1)
- `backend/tests/services/test_reconstruction_service_color.py` (Phase 3)
- `backend/tests/api/test_reconstruction_api_color.py` (Phase 5)

This phase ensures all tests are implemented and passing.

## Test Implementation Details

### Color Utils Tests (10 tests)

```python
# tests/processing/test_color_utils.py

def test_parse_color_valid_hex_6_returns_rgba():
    """#FF5733 → [255, 87, 51, 255]"""
    result = parse_color("#FF5733")
    assert result == [255, 87, 51, 255]

def test_parse_color_valid_hex_8_returns_rgba():
    """#FF573380 → [255, 87, 51, 128]"""
    result = parse_color("#FF573380")
    assert result == [255, 87, 51, 128]

def test_parse_color_valid_rgba_array_returns_same():
    """[255, 87, 51, 255] → [255, 87, 51, 255]"""
    result = parse_color([255, 87, 51, 255])
    assert result == [255, 87, 51, 255]

def test_parse_color_invalid_hex_raises_error():
    """Invalid hex format raises ColorParseError"""
    with pytest.raises(ColorParseError):
        parse_color("INVALID")

def test_parse_color_invalid_rgba_raises_error():
    """RGBA out of range raises ColorParseError"""
    with pytest.raises(ColorParseError):
        parse_color([256, 0, 0, 255])

def test_parse_color_none_returns_default():
    """None → default [74, 74, 74, 255]"""
    result = parse_color(None)
    assert result == [74, 74, 74, 255]

def test_parse_color_hex_with_whitespace_stripped():
    """' #FF5733 ' → [255, 87, 51, 255]"""
    result = parse_color(" #FF5733 ")
    assert result == [255, 87, 51, 255]

def test_validate_rgba_valid_returns_true():
    """Valid RGBA → True"""
    assert validate_rgba([255, 87, 51, 255]) is True

def test_validate_rgba_invalid_length_returns_false():
    """Wrong length → False"""
    assert validate_rgba([255, 87, 51]) is False

def test_validate_rgba_out_of_range_returns_false():
    """Value > 255 → False"""
    assert validate_rgba([256, 0, 0, 255]) is False
```

### Service Tests (5 tests)

```python
# tests/services/test_reconstruction_service_color.py

@pytest.mark.asyncio
async def test_build_mesh_with_valid_hex_color_succeeds(service, mock_repo):
    """Valid hex color → mesh generated successfully"""
    # Arrange: mock repo, create test mask file
    # Act: await service.build_mesh(..., wall_color="#FF5733")
    # Assert: reconstruction.status == 3 (completed)

@pytest.mark.asyncio
async def test_build_mesh_with_valid_rgba_array_succeeds(service, mock_repo):
    """Valid RGBA array → mesh generated successfully"""
    # Similar to above with RGBA array

@pytest.mark.asyncio
async def test_build_mesh_no_color_uses_default(service, mock_repo):
    """No color parameter → uses default #4A4A4A"""
    # Arrange: mock repo, create test mask file
    # Act: await service.build_mesh(..., wall_color=None)
    # Assert: reconstruction.status == 3

@pytest.mark.asyncio
async def test_build_mesh_invalid_color_raises_error(service, mock_repo):
    """Invalid color → ValueError raised"""
    # Arrange: mock repo
    # Act: await service.build_mesh(..., wall_color="INVALID")
    # Assert: raises ValueError

@pytest.mark.asyncio
async def test_build_mesh_color_passed_to_generator(service, mock_repo, mocker):
    """Color parameter passed to mesh_builder.build_mesh_from_mask()"""
    # Arrange: mock mesh_builder.build_mesh_from_mask
    # Act: await service.build_mesh(..., wall_color="#FF5733")
    # Assert: build_mesh_from_mask called with wall_color=[255, 87, 51, 255]
```

### API Tests (6 tests)

```python
# tests/api/test_reconstruction_api_color.py

@pytest.mark.asyncio
async def test_calculate_mesh_with_valid_hex_color_201(client, mock_service):
    """POST with valid hex → 201"""
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={
            "plan_file_id": "plan-123",
            "user_mask_file_id": "mask-123",
            "wall_color": "#FF5733"
        }
    )
    assert response.status_code == 201
    assert response.json()["url"].endswith(".glb")

@pytest.mark.asyncio
async def test_calculate_mesh_with_valid_rgba_color_201(client, mock_service):
    """POST with valid RGBA → 201"""
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={
            "plan_file_id": "plan-123",
            "user_mask_file_id": "mask-123",
            "wall_color": [255, 87, 51, 255]
        }
    )
    assert response.status_code == 201

@pytest.mark.asyncio
async def test_calculate_mesh_no_color_uses_default_201(client, mock_service):
    """POST without color → 201 with default"""
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={
            "plan_file_id": "plan-123",
            "user_mask_file_id": "mask-123"
        }
    )
    assert response.status_code == 201

@pytest.mark.asyncio
async def test_calculate_mesh_invalid_hex_color_400(client):
    """POST with invalid hex → 400"""
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={
            "plan_file_id": "plan-123",
            "user_mask_file_id": "mask-123",
            "wall_color": "INVALID"
        }
    )
    assert response.status_code == 400
    assert "Invalid wall_color" in response.json()["detail"]

@pytest.mark.asyncio
async def test_calculate_mesh_invalid_rgba_color_400(client):
    """POST with invalid RGBA → 400"""
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={
            "plan_file_id": "plan-123",
            "user_mask_file_id": "mask-123",
            "wall_color": [256, 0, 0, 255]
        }
    )
    assert response.status_code == 400

@pytest.mark.asyncio
async def test_calculate_mesh_response_includes_glb_url(client, mock_service):
    """Response includes url field pointing to GLB"""
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={
            "plan_file_id": "plan-123",
            "user_mask_file_id": "mask-123",
            "wall_color": "#FF5733"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert "url" in data
    assert data["url"].endswith(".glb")
```

## Verification

- [ ] `python -m pytest backend/tests/processing/test_color_utils.py -v` passes (10 tests)
- [ ] `python -m pytest backend/tests/services/test_reconstruction_service_color.py -v` passes (5 tests)
- [ ] `python -m pytest backend/tests/api/test_reconstruction_api_color.py -v` passes (6 tests)
- [ ] `python -m pytest backend/tests/ -v` passes (all tests, including existing)
- [ ] No regressions in existing tests
- [ ] Coverage for all new code paths
- [ ] All 19 tests passing
