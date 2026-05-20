# Phase 6: Service — Stitching

phase: 6
layer: service
depends_on: [phase-01, phase-02, phase-03, phase-04, phase-05]
design: ../README.md

## Goal

Implement service layer that orchestrates the stitching pipeline: load models from DB → transform → clip → merge → normalize → save.

## Context

**Depends on all processing phases (1-4) and models (5).**

**Pattern:** Follow `backend/app/services/reconstruction_service.py` structure.

## Files to Create

### `backend/app/services/stitching_service.py`

**Purpose:** Orchestrate stitching pipeline.

**Implementation details:**
- **No business logic in service** — delegate to processing functions
- **Service responsibilities:** Load from DB, call processing, save to DB, error handling
- **Dependency injection:** ReconstructionRepository via Depends()

**Key class:**

```python
from typing import List, Optional
from app.models.stitching import StitchingRequest, StitchingResponse
from app.models.domain import VectorizationResult
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.processing.stitching import (
    build_affine_matrix,
    apply_affine_to_polygon,
    clip_walls,
    clip_rooms,
    clip_doors,
    merge_models,
    normalize_to_bounding_box,
    check_duplicate_rooms,
)
import json
import logging

logger = logging.getLogger(__name__)

class StitchingService:
    def __init__(self, reconstruction_repo: ReconstructionRepository):
        self.reconstruction_repo = reconstruction_repo

    async def stitch_plans(
        self,
        request: StitchingRequest,
        user_id: int,
    ) -> StitchingResponse:
        """
        Stitch multiple floor plans into one.

        Steps:
        1. Load source reconstructions from DB
        2. For each source:
           a. Deserialize vectorization_data
           b. Apply rect_crop (if any)
           c. Denormalize coords to image pixels
           d. Apply affine transform
           e. Apply clip polygons
        3. Merge all models
        4. Check for duplicate rooms
        5. Normalize to bounding box [0,1]
        6. Save new reconstruction
        7. Return response

        Args:
            request: StitchingRequest with source plans and transforms
            user_id: ID of user creating stitched reconstruction

        Returns:
            StitchingResponse with new reconstruction details

        Raises:
            ValueError: If source reconstruction not found
            ValueError: If no walls after merge
        """
        # Implementation follows sequence diagram in 02-behavior.md
        # Use logger.info() for progress tracking
        # Use logger.error() for errors
```

**Key helper methods:**

```python
    def _denormalize_coords(
        self,
        model: VectorizationResult,
        image_width: int,
        image_height: int,
    ) -> VectorizationResult:
        """Convert normalized [0,1] coords to image pixels."""
        # For each wall point: x_px = x_norm * image_width
        # For each room polygon point: same
        # For each room center: same
        # For each door position: same
        # Return new VectorizationResult with pixel coords

    def _apply_rect_crop(
        self,
        model: VectorizationResult,
        crop: dict,
        image_width: int,
        image_height: int,
    ) -> VectorizationResult:
        """Apply rectangular crop in image space."""
        # Crop rect is in pixels
        # Filter walls/rooms/doors outside crop rect
        # Adjust coordinates relative to crop origin
        # Return cropped model
```

**Reference:** 02-behavior.md "Use Case 3: Submit Stitching Request" sequence diagram

### `backend/tests/services/test_stitching_service.py`

**Tests from 04-testing.md to implement here:**
- `test_stitch_plans_two_plans_no_clip_succeeds`
- `test_stitch_plans_with_clip_polygons_succeeds`
- `test_stitch_plans_with_rect_crop_succeeds`
- `test_stitch_plans_source_not_found_raises_404`
- `test_stitch_plans_duplicate_rooms_returns_warnings`
- `test_stitch_plans_all_clipped_raises_400`
- `test_stitch_plans_saves_reconstruction_correctly`

**Example test:**
```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.stitching_service import StitchingService
from app.models.stitching import StitchingRequest, TransformInput, SourcePlanInput

@pytest.mark.asyncio
async def test_stitch_plans_two_plans_no_clip_succeeds():
    # Arrange
    mock_repo = MagicMock()
    mock_repo.get_by_id = AsyncMock(side_effect=[
        create_mock_reconstruction(id=1, rooms=["A301"]),
        create_mock_reconstruction(id=2, rooms=["A302"]),
    ])
    mock_repo.create = AsyncMock(return_value=create_mock_reconstruction(id=3))

    service = StitchingService(mock_repo)

    request = StitchingRequest(
        name="Merged",
        building_id="building-uuid",
        floor_number=3,
        source_plans=[
            SourcePlanInput(
                reconstruction_id="1",
                transform=TransformInput(translate_x=0, translate_y=0, scale_x=1.0, scale_y=1.0, rotation_deg=0),
                clip_polygons=[],
                rect_crop=None,
                image_width_px=1000,
                image_height_px=800,
                z_index=0,
            ),
            SourcePlanInput(
                reconstruction_id="2",
                transform=TransformInput(translate_x=500, translate_y=0, scale_x=1.0, scale_y=1.0, rotation_deg=0),
                clip_polygons=[],
                rect_crop=None,
                image_width_px=1000,
                image_height_px=800,
                z_index=1,
            ),
        ],
    )

    # Act
    response = await service.stitch_plans(request, user_id=1)

    # Assert
    assert response.name == "Merged"
    assert response.rooms_count == 2
    assert len(response.source_reconstruction_ids) == 2
```

**Reference:** 04-testing.md "Service Coverage"

## Files to Modify

None.

## Verification

- [ ] `python -m py_compile backend/app/services/stitching_service.py` passes
- [ ] `pytest backend/tests/services/test_stitching_service.py -v` passes (7 tests)
- [ ] All methods have type hints (args + return)
- [ ] All methods have docstrings
- [ ] Service uses logger (not print)
- [ ] Service does NOT contain business logic (delegates to processing/)
- [ ] Service handles errors gracefully (ValueError for not found, etc.)
- [ ] Mock repository in tests (no real DB access)
