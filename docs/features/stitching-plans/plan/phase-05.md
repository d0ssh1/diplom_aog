# Phase 5: Models — Pydantic

phase: 5
layer: models
depends_on: none
design: ../README.md

## Goal

Create Pydantic models for stitching API request and response validation.

## Context

Independent phase. Can be implemented in parallel with processing phases.

**Pattern:** Follow existing models in `backend/app/models/reconstruction.py`.

## Files to Create

### `backend/app/models/stitching.py`

**Purpose:** Pydantic models for stitching API.

**Implementation details:**
- All models use Pydantic v2 syntax
- Field validators for constraints (scale > 0, rotation 0-360, etc.)
- Exact field names match 05-api-contract.md

**Models to create:**

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple, Literal

class TransformInput(BaseModel):
    """Affine transformation parameters."""
    translate_x: float
    translate_y: float
    scale_x: float = Field(gt=0, description="Must be > 0")
    scale_y: float = Field(gt=0, description="Must be > 0")
    rotation_deg: float = Field(ge=0, le=360)

class ClipPolygonInput(BaseModel):
    """Polygon for clipping (subtract operation)."""
    type: Literal["subtract"]
    points: List[Tuple[float, float]] = Field(min_length=3)

class RectCropInput(BaseModel):
    """Rectangular crop in image space."""
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)

class SourcePlanInput(BaseModel):
    """Single source plan with transformations."""
    reconstruction_id: str
    transform: TransformInput
    clip_polygons: List[ClipPolygonInput]
    rect_crop: Optional[RectCropInput] = None
    image_width_px: int = Field(gt=0)
    image_height_px: int = Field(gt=0)
    z_index: int = Field(ge=0)

class StitchingRequest(BaseModel):
    """Request to stitch multiple plans."""
    name: str = Field(min_length=1, max_length=255)
    building_id: str  # UUID validation can be added via validator
    floor_number: int = Field(ge=0)
    source_plans: List[SourcePlanInput] = Field(min_length=2)

class StitchingResponse(BaseModel):
    """Response after stitching."""
    id: int
    name: str
    status: int
    source_reconstruction_ids: List[int]
    building_id: str
    floor_number: int
    rooms_count: int
    walls_count: int
    warnings: Optional[List[str]] = None
```

**Reference:** 05-api-contract.md "Data Type Definitions" section

## Files to Modify

None.

## Verification

- [ ] `python -m py_compile backend/app/models/stitching.py` passes
- [ ] All models have Field validators for constraints
- [ ] Field names match exactly with 05-api-contract.md
- [ ] Import test: `python -c "from app.models.stitching import StitchingRequest, StitchingResponse"`
- [ ] Validation test: Create StitchingRequest with invalid data (scale=0) → raises ValidationError
- [ ] Validation test: Create StitchingRequest with <2 plans → raises ValidationError
