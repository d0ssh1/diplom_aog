# Phase 04: processing.floor_assembly (warp/composite/connectors) + tests

phase: 04
layer: processing/ (PURE)
depends_on: 02, 03
design: ../06-pipeline-spec.md §5–6; tests ../04-testing.md §"Unit — floor_assembly"

## Goal

Pure mask assembly: warp each section mask by its `(s,tx,ty)`, OR-composite into
the master-pixel canvas, rasterise connectors as open-polyline wall bands. Returns
a binary mask ready for the unchanged `build_mesh_from_mask`. NO DB/IO.

## Files to Create

### `backend/app/processing/floor_assembly.py`
```python
from dataclasses import dataclass
import cv2
import numpy as np

@dataclass(frozen=True)
class SectionWarpInput:
    section_id: int
    mask: np.ndarray        # (Hs,Ws) uint8 binary
    scale: float
    tx: float
    ty: float

@dataclass(frozen=True)
class ConnectorRaster:
    points_px: np.ndarray   # (M,2) int32, master-pixel, open polyline
    thickness_px: int       # MUST be >= 1 (caller rounds up; 0 ⇒ cv2 hairline, never 0)

def assemble_floor_mask(
    sections: list[SectionWarpInput],
    canvas_size: tuple[int, int],         # (Wm, Hm)
    connectors: list[ConnectorRaster],
    default_wall_thickness_px: int,
) -> np.ndarray:                          # (Hm, Wm) uint8 0/255
    ...
```

Algorithm (06 §5.1, exact):
1. `Wm, Hm = canvas_size`; `canvas = np.zeros((Hm, Wm), np.uint8)`.
2. For each section (never mutate `mask`):
   - `M = np.array([[s,0,tx],[0,s,ty]], np.float64)`.
   - `warped = cv2.warpAffine(sec.mask, M, (Wm,Hm), flags=cv2.INTER_NEAREST, borderValue=0)`.
   - `canvas = cv2.max(canvas, warped)`  (binary OR; overlaps stay 255).
3. For each connector: `cv2.polylines(canvas, [c.points_px], isClosed=False, color=255, thickness=max(1, c.thickness_px or default_wall_thickness_px))`. **No fill, no closing segment.** Guard `max(1, …)` so a rounded-down `0` never degrades to a 1px hairline silently — but the caller (Phase 08) should already pass `>= 1`; both `c.thickness_px` and `default_wall_thickness_px` are expected `>= 1`.
4. Return `canvas`.

> Canvas sizing + the memory-guard downscale (06 §5.2) is decided by the SERVICE
> (it knows master dims + `MAX_FLOOR_CANVAS_PX`) and passed in as `canvas_size`
> with transforms pre-multiplied by `k`. This pure fn just honours `canvas_size`.
> The `low_detail` warning (scale < `DETAIL_WARN_SCALE`) is also a service concern.

## Files to Create — tests

### `backend/tests/processing/test_floor_assembly.py`
Every row from [../04-testing.md](../04-testing.md) §Unit floor_assembly:
`test_warp_identity_places_mask_at_origin`,
`test_warp_translation_places_mask_offset`,
`test_warp_uniform_scale_preserves_square`,
`test_assemble_composites_two_masks_via_or` (overlap stays 255, no 510 overflow),
`test_assemble_output_is_binary_uint8`,
`test_assemble_does_not_mutate_input_masks`,
`test_connector_line_drawn_as_wall_band`,
`test_connector_single_segment_two_points`,
`test_canvas_equals_master_crop_dims` (pure fn honours the `canvas_size` it's handed),
`test_warp_fully_outside_canvas_contributes_nothing` (a valid section whose warped
pixels all clip past the border → zero contribution, canvas stays all-zero where it
should; guards a future `borderValue` regression),
`test_assemble_empty_sections_returns_zero_canvas`.
> NOTE: `test_canvas_cap_scales_transforms_uniformly` is **NOT** a pure-layer test —
> the cap/`k`-derivation lives in the SERVICE (Phase 08), and this pure fn never sees
> `k`. That assertion belongs in Phase 10's `test_canvas_capped_at_max_px_scales_transforms_by_k`.
Plus non-displacement (04-testing §Non-displacement):
`test_uniform_warp_preserves_relative_positions`,
`test_solve_pixel_space_not_normalized_no_aspect_skew` (compose solve→warp with
mismatched aspect ratios; assert a square stays square).
Use the `tiny_mask(shape, rects)` fixture.

## Business rules
- Output strictly binary `{0,255}` uint8 (INTER_NEAREST guarantees this).
- Input masks never mutated (assert with kept copies).
- Connectors are OPEN — assert no pixel band closes last→first vertex.

## Verification
- [ ] `cd backend && pytest tests/processing/test_floor_assembly.py -q` all pass.
- [ ] `flake8` clean; only numpy/cv2 imports (no DB/service/Pydantic).
