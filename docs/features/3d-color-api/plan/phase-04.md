# Phase 4: API Request Model

phase: 4
layer: models
depends_on: none
design: ../README.md

## Goal

Add `wall_color` field to `CalculateMeshRequest` Pydantic model with proper validation and documentation.

## Context

This phase is independent. It prepares the API contract for Phase 5.

## Files to Create

None in this phase (only modifications).

## Files to Modify

### `backend/app/models/reconstruction.py`

**What changes:**
- Add `wall_color` field to `CalculateMeshRequest` class
- Field is optional, accepts string or list
- Add docstring explaining format

**Lines affected:** ~98-102 (CalculateMeshRequest class)

**Implementation details:**
- Add field: `wall_color: str | list[int] | None = None`
- Add Field description: `"Wall color as hex (#RRGGBB or #RRGGBBAA) or RGBA array [R, G, B, A]. Defaults to #4A4A4A if omitted."`
- Use Pydantic `Field()` with description for API docs

**Example:**
```python
class CalculateMeshRequest(BaseModel):
    """Запрос на построение 3D модели"""
    plan_file_id: str
    user_mask_file_id: str
    wall_color: str | list[int] | None = Field(
        default=None,
        description="Wall color as hex (#RRGGBB or #RRGGBBAA) or RGBA array [R, G, B, A]. Defaults to #4A4A4A if omitted."
    )
```

**Reference:** 05-api-contract.md for exact field spec, prompts/python_style.md for Pydantic patterns

## Verification

- [ ] `python -m py_compile backend/app/models/reconstruction.py` passes
- [ ] Pydantic model validates correctly (can instantiate with/without `wall_color`)
- [ ] Field description appears in OpenAPI docs (`/docs`)
