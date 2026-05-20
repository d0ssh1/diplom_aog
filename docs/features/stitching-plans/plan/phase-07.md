# Phase 7: API — Router

phase: 7
layer: api
depends_on: [phase-05, phase-06]
design: ../README.md

## Goal

Create FastAPI router for stitching endpoints. Thin layer: validate → call service → return response.

## Context

**Depends on Phase 5 (models) and Phase 6 (service).**

**Pattern:** Follow `backend/app/api/reconstruction.py` structure.

## Files to Create

### `backend/app/api/stitching.py`

**Purpose:** FastAPI router for stitching endpoints.

**Implementation details:**
- **Thin router:** No business logic, only validation and service calls
- **Dependency injection:** StitchingService via Depends()
- **Error handling:** Convert service exceptions to HTTP exceptions

**Endpoints to create:**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.stitching import StitchingRequest, StitchingResponse
from app.services.stitching_service import StitchingService
from app.api.deps import get_current_user, get_stitching_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stitching", tags=["stitching"])

@router.post("/", response_model=StitchingResponse, status_code=status.HTTP_201_CREATED)
async def stitch_plans(
    request: StitchingRequest,
    service: StitchingService = Depends(get_stitching_service),
    current_user = Depends(get_current_user),
) -> StitchingResponse:
    """
    Stitch multiple floor plans into one.

    Args:
        request: StitchingRequest with source plans and transforms
        service: StitchingService (injected)
        current_user: Current authenticated user (injected)

    Returns:
        StitchingResponse with new reconstruction details

    Raises:
        400: Invalid request (validation error, no walls after merge)
        404: Source reconstruction or building not found
        500: Processing error
    """
    try:
        response = await service.stitch_plans(request, current_user.id)
        return response
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        else:
            raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Stitching failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Stitching failed: {str(e)}")
```

**Reference:** 05-api-contract.md "POST /api/v1/stitching/"

### `backend/app/api/deps.py` (modify)

**Add dependency function:**

```python
def get_stitching_service(
    db: AsyncSession = Depends(get_db),
) -> StitchingService:
    """Dependency for StitchingService."""
    from app.services.stitching_service import StitchingService
    from app.db.repositories.reconstruction_repo import ReconstructionRepository

    repo = ReconstructionRepository(db)
    return StitchingService(repo)
```

### `backend/tests/api/test_stitching_api.py`

**Tests from 04-testing.md to implement here:**
- `test_post_stitching_valid_request_returns_201`
- `test_post_stitching_invalid_transform_returns_400`
- `test_post_stitching_less_than_two_plans_returns_400`
- `test_post_stitching_source_not_found_returns_404`
- `test_post_stitching_processing_error_returns_500`

**Example test:**
```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_post_stitching_valid_request_returns_201(client: AsyncClient, auth_headers):
    # Arrange
    request = {
        "name": "Merged Floor 3",
        "building_id": "550e8400-e29b-41d4-a716-446655440000",
        "floor_number": 3,
        "source_plans": [
            {
                "reconstruction_id": "1",
                "transform": {
                    "translate_x": 0,
                    "translate_y": 0,
                    "scale_x": 1.0,
                    "scale_y": 1.0,
                    "rotation_deg": 0,
                },
                "clip_polygons": [],
                "rect_crop": None,
                "image_width_px": 1000,
                "image_height_px": 800,
                "z_index": 0,
            },
            {
                "reconstruction_id": "2",
                "transform": {
                    "translate_x": 500,
                    "translate_y": 0,
                    "scale_x": 1.0,
                    "scale_y": 1.0,
                    "rotation_deg": 0,
                },
                "clip_polygons": [],
                "rect_crop": None,
                "image_width_px": 1000,
                "image_height_px": 800,
                "z_index": 1,
            },
        ],
    }

    # Act
    response = await client.post("/api/v1/stitching/", json=request, headers=auth_headers)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Merged Floor 3"
    assert data["rooms_count"] >= 0
```

**Reference:** 04-testing.md "API Endpoint Coverage"

## Files to Modify

### `backend/app/main.py`

**Register router:**

```python
from app.api import stitching

app.include_router(stitching.router, prefix="/api/v1")
```

### `backend/app/api/__init__.py`

**Export router:**

```python
from . import stitching
```

## Verification

- [ ] `python -m py_compile backend/app/api/stitching.py` passes
- [ ] `pytest backend/tests/api/test_stitching_api.py -v` passes (5 tests)
- [ ] Router registered in main.py
- [ ] Swagger docs accessible: `http://localhost:8000/docs` shows `/api/v1/stitching/` endpoint
- [ ] Manual test: POST /api/v1/stitching/ with valid request → 201
- [ ] Manual test: POST /api/v1/stitching/ with invalid request → 400/422
- [ ] Error responses match 05-api-contract.md
