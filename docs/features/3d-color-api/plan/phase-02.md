# Phase 2: Mesh Builder Integration

phase: 2
layer: processing
depends_on: phase-01
design: ../README.md

## Goal

Update mesh builder to accept and apply custom wall colors. Processing layer remains PURE — no validation, only application of pre-validated colors.

## Context

Phase 1 created `color_utils.py` with `parse_color()` and `validate_rgba()` functions.

This phase accepts pre-validated RGBA arrays from the service layer and applies them to wall vertices.

**CRITICAL:** Processing layer does NOT validate colors. Validation happens in Phase 3 (service layer).

## Files to Create

None in this phase (only modifications).

## Files to Modify

### `backend/app/processing/mesh_builder.py`

**What changes:**
- Update `build_mesh_from_mask()` signature to accept optional `wall_color` parameter
- Apply custom color to wall vertices instead of hardcoded `WALL_SIDE_COLOR`
- NO imports from `color_utils` — color is pre-validated by service layer

**Lines affected:** ~30-50 (function signature), ~192 (color application)

**Implementation details:**
- Function `build_mesh_from_mask(..., wall_color: list[int] | None = None) -> trimesh.Trimesh`
  - Accept optional `wall_color` parameter (pre-validated RGBA array or None)
  - If `wall_color` is None, use default `WALL_SIDE_COLOR = [74, 74, 74, 255]`
  - If `wall_color` is provided, use it directly (already validated by service)
  - Apply color at line 192: `colors = np.tile(wall_color or WALL_SIDE_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)`

**Example:**
```python
def build_mesh_from_mask(
    mask_path: str,
    scale_factor: float = 0.02,
    wall_color: list[int] | None = None,  # NEW: pre-validated RGBA array
) -> trimesh.Trimesh:
    """Build 3D mesh from binary mask with optional custom wall color."""
    # ... existing code ...

    # At line 192, replace:
    # colors = np.tile(WALL_SIDE_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)
    # With:
    color_to_use = wall_color if wall_color is not None else WALL_SIDE_COLOR
    colors = np.tile(color_to_use, (len(wall_mesh.vertices), 1)).astype(np.uint8)
```

**Reference:** 01-architecture.md for dependency flow, 02-behavior.md for color application logic

### `backend/app/processing/mesh_generator.py`

**What changes:**
- NO changes needed in this phase
- This file contains pure mesh generation functions
- Color application happens in `mesh_builder.py` (higher level)

**Note:** Function `assign_room_colors()` exists (line 294) but is NOT used in MVP. Room-based coloring is a future feature.

## Verification

- [ ] `python -m py_compile backend/app/processing/mesh_builder.py` passes
- [ ] NO imports from `color_utils`, `api/`, `db/`, `services/` in mesh_builder.py
- [ ] All functions remain pure (no validation, no side effects)
- [ ] Existing calls without `wall_color` parameter still work (backward compatible)
- [ ] Color application uses: `wall_color or WALL_SIDE_COLOR` pattern
