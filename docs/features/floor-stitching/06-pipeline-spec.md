# Pipeline Spec: Floor Stitching

> The geometry and maths. Defines every coordinate space, the exact uniform-
> similarity solver, the warp, and the mask assembly. This is the contract the
> pure `processing.registration` and `processing.floor_assembly` modules must
> satisfy. Behaviour/sequencing is in [02-behavior.md](02-behavior.md).

## 1. Coordinate spaces

Five frames are involved. Getting the conversions right is what guarantees no
cabinet shift (see §6).

```mermaid
flowchart LR
  A["Section-local<br/>[0,1]²<br/>(reconstruction.control_points)"]
  B["Section-pixel<br/>(Wₛ × Hₛ)"]
  C["Master-pixel<br/>(Wₘ × Hₘ)<br/>= the floor canvas"]
  D["Master-norm<br/>[0,1]²<br/>(section.control_points, geometry, connectors)"]
  E["Floor metres<br/>(3D mesh)"]
  A -->|×(Wₛ,Hₛ)| B
  B -->|"uniform similarity (s,tx,ty)"| C
  D -->|×(Wₘ,Hₘ)| C
  C -->|"build_mesh_from_mask ÷ ppm_floor"| E
```

| Frame | Range | Stored on | Notes |
|-------|-------|-----------|-------|
| Section-local | `[0,1]²` | `reconstruction.control_points` | normalised over the **cropped** section plan image |
| Section-pixel | `[0,Wₛ]×[0,Hₛ]` | derived | `Wₛ,Hₛ = the loaded wall mask's actual shape` (== `image_size_cropped`) |
| Master-pixel | `[0,Wₘ]×[0,Hₘ]` | derived (the canvas) | `Wₘ,Hₘ` from the master schema image, after `schema_crop_bbox` |
| Master-norm | `[0,1]²` | `section.control_points`, `section.geometry`, `floor_connectors.points`, `floor.wall_polygons` | normalised over the cropped master schema |
| Floor metres | ℝ² | the GLB | `build_mesh_from_mask` divides pixels by `ppm_floor` |

**Why `Wₛ,Hₛ` is authoritative for the section — and the bug to avoid.** The warp
acts on the section **wall mask**, so the control points MUST be de-normalised into
*that mask's* pixel frame. Therefore de-normalise using the **loaded mask's actual
`(H,W)`** (`mask.shape`), not a stored number. By construction the mask is the
cropped plan raster, so `mask.shape` equals `VectorizationResult.image_size_cropped`;
the service **asserts they match** (same aspect within tolerance) and surfaces a data
error if not, rather than silently warping with a stale/mismatched size. Because the
points are normalised `[0,1]`, de-normalising by the mask's true dims is correct at
*any* mask resolution — this is what keeps the warp self-consistent with the pixels
being moved (and is the subtle place a coordinate shift could otherwise sneak in).

**Why master dims come from the schema image.** The master canvas *is* the cropped
master schema raster. We read `Wₘ,Hₘ` from the schema image file (apply
`schema_crop_bbox.width/height` if present, else the full image dims). All
master-norm coordinates multiply by these dims to become canvas pixels.

## 2. The solver — uniform (isotropic) similarity, in pixel space

`processing.registration.solve_similarity` (pure).

### 2.1 Signature

```python
def solve_similarity(
    src: np.ndarray,   # (N,2) float64, section-pixel coords, N>=3
    dst: np.ndarray,   # (N,2) float64, master-pixel coords, paired by index
) -> SimilarityResult:  # plain dataclass / NamedTuple, NOT a Pydantic/DB type
    ...
```

`src[i]` and `dst[i]` are the SAME control-point ID (the service matched them by
ID and de-normalised before calling — the pure function knows nothing about IDs
or normalisation).

### 2.2 Model

We fit a **single isotropic scale `s` + translation `(tx,ty)`**, no rotation, no
shear, no per-axis scale:

```
X = s·x + tx
Y = s·y + ty
```

(3 DOF.) Rotation is deliberately excluded because the user's source schemas are
already rotated to the correct orientation; re-introducing rotation here could
fight that and is unnecessary for "scale + shift".

### 2.3 Closed-form least squares

Centre both point sets:

```
p̄ = mean(src),  q̄ = mean(dst)
p'ᵢ = srcᵢ − p̄,  q'ᵢ = dstᵢ − q̄
```

The shift-free isotropic scale that minimises Σ‖q'ᵢ − s·p'ᵢ‖² is

```
s  = Σᵢ (p'ᵢ · q'ᵢ) / Σᵢ (p'ᵢ · p'ᵢ)        # dot products, both axes summed
tx = q̄ₓ − s·p̄ₓ
ty = q̄ᵧ − s·p̄ᵧ
```

`Σ(p'·p')` is the total centred variance of the source points; it is the
denominator that the degeneracy guard (§3) protects from being ~0.

### 2.4 Residual

```
residual_rms = sqrt( mean_i ‖dstᵢ − (s·srcᵢ + t)‖² )   # in master pixels
```

Returned per section. The service may also divide by `ppm_floor` to report it in
metres for the operator.

### 2.5 Output

```python
SimilarityResult(scale: float, tx: float, ty: float,
                 residual_rms: float, n_points: int)
```

`scale` is one float — there is structurally no way to emit `sx≠sy`. This is the
mathematical core of "a square cabinet stays square".

## 3. Degeneracy guards (reject before persisting)

`solve_similarity` raises `DegenerateControlPointsError` (or the service checks
first — see 02-behavior UC3) when any holds:

| Guard | Condition | Why |
|-------|-----------|-----|
| too few | `N < 3` | policy floor: 3 points overdetermine `s,tx,ty` enough that a single mis-placed point shows up in the residual (see note) |
| coincident | `max pairwise src distance < R_min_baseline_px` | all points (nearly) on one spot ⇒ `Σ(p'·p')≈0` ⇒ scale explodes |
| collinear *and* short | collinearity alone is fine for a pure scale, but combined with a short baseline it is rejected by the coincident guard | uniform scale needs only spread along one direction, so collinear points are acceptable if well-spread |
| non-finite | any NaN/Inf after solve | numerical failure |

`R_min_baseline_px` is computed from the section image diagonal (e.g.
`0.02 × hypot(Wₛ,Hₛ)`), so it scales with image size rather than being a brittle
absolute pixel count.

> Note: mathematically, a **pure isotropic scale** (no rotation) needs only 2
> distinct points, and collinear points are NOT degenerate (unlike a full affine,
> which needs 3 non-collinear). We nonetheless **require ≥3** as a robustness
> policy: with 2 points the fit is barely overdetermined, so a mis-clicked point
> can pass unnoticed; with 3 the residual (§2.4) isolates a single bad point and
> collinearity is reliably surfaced. The remaining real enemy is a near-zero
> baseline, caught by the coincident guard.

## 4. Deriving the floor metric scale `ppm_floor`

The master schema carries no intrinsic metric. Each section does
(`VectorizationResult.estimated_pixels_per_meter`, master px not yet — section px).
After solving, 1 section-pixel becomes `s` master-pixels, so:

```
ppm_master_from_section_k = ppm_section_k × s_k          # master px per metre
```

- **Anchor** = the registered section with the most matched points (tie-break:
  smallest `section.number`).
- `floors.pixels_per_meter = ppm_master_from_section_anchor`.
- For every other registered section, compute `ppm_master_from_section_k` and
  compare to the anchor. If `|ratio − 1| > PPM_WARN_RATIO` (default 0.10) emit a
  **non-fatal** warning naming the section (likely a mis-placed control point) —
  the build still proceeds; the operator decides whether to re-place points.

This resolves research **Gap #7** (floor had no metric scale) without inventing a
manual scale input.

## 5. Mask assembly

`processing.floor_assembly` (pure). Two functions.

### 5.1 `assemble_floor_mask`

```python
def assemble_floor_mask(
    sections: list[SectionWarpInput],   # mask (HxW uint8) + (scale,tx,ty) + id
    canvas_size: tuple[int, int],       # (Wₘ, Hₘ) master-pixel = master-schema crop dims
    connectors: list[ConnectorRaster],  # open polyline (MASTER-PIXEL pts) + thickness_px
    default_wall_thickness_px: int,
) -> np.ndarray:                        # (Hₘ, Wₘ) uint8 binary 0/255
```

Algorithm:

1. `canvas = np.zeros((Hₘ, Wₘ), np.uint8)`.
2. For each section (never mutate the input mask — `.copy()` semantics; warp
   writes to a fresh array):
   - `M = np.array([[s, 0, tx], [0, s, ty]], dtype=np.float64)` (2×3).
   - `warped = cv2.warpAffine(mask, M, (Wₘ, Hₘ), flags=cv2.INTER_NEAREST, borderValue=0)`.
   - `canvas = cv2.max(canvas, warped)`  *(pixel-wise OR for binary; unions walls
     at overlaps so seams don't double).*
3. For each connector line (open polyline, already in master-pixel int coords):
   draw it with `cv2.polylines(canvas, [pts], isClosed=False,
   thickness=thickness_px or default_wall_thickness_px, color=255)` so it extrudes
   as a wall band. **No fill** — the floor mesh is walls-only, so the line *is* the
   wall; the open ends (corridor mouths) stay passable. A corridor is normally two
   such lines (its two sides).
4. Return `canvas`.

`SectionWarpInput`, `ConnectorRaster`, `SimilarityResult` etc. are plain dataclasses
in `processing/` — **no Pydantic, no ORM** (keeps the layer pure).

### 5.2 Canvas sizing — fixed to the master-schema crop

The canvas is **fixed** to the master-schema crop dims `(Wₘ,Hₘ)` — no
section-driven upscaling or "stretching". The master schema *is* the floor's
reference frame, so it also defines the floor's pixel resolution; if the operator
needs sharper sections in the assembled mask, they upload a higher-resolution
master schema. This keeps the model simple and predictable: `floors.pixels_per_meter
= ppm_floor` straight from §4, with no resolution factor folded in.

The only adjustment is a **memory guard**: if `max(Wₘ,Hₘ) > MAX_FLOOR_CANVAS_PX`
(default 4000) the canvas is downscaled by `k = MAX_FLOOR_CANVAS_PX / max(Wₘ,Hₘ)`,
pre-multiplying every transform (`s,tx,ty`), `ppm_floor` and connector pixel
together. Because `k` is a single scalar applied uniformly to everything, shapes
are unaffected (same argument as §6). This guard is a no-op for normally-sized
masters.

**Detail warning (low-res master).** The master schema is typically a phone photo,
so a large section can land on the canvas at `scaleₖ < 1` (i.e. fewer master px than
the section's own mask) and its walls are downsampled. This is **not** corrected
(fixed canvas, ADR-18) — instead the service emits a **non-fatal** warning per
section whose solved `scaleₖ < DETAIL_WARN_SCALE` (default 0.5), naming it so the
operator can decide to re-shoot the master at higher resolution. The build always
proceeds.

### 5.3 Extrusion

```python
mesh = build_mesh_from_mask(
    combined_mask,
    floor_height=FLOOR_HEIGHT,
    pixels_per_meter=floors.pixels_per_meter,
    vr=None,
)
```

Called **unmodified** (`mesh_builder.py`). It runs `cv2.findContours`, builds
Shapely polygons, extrudes walls, converts Z-up→Y-up. This is literally "raise the
walls like a normal single plan", now on the stitched canvas → one floor GLB.

## 6. Why no element shifts or distorts (the hard constraint)

Three independent reasons, each sufficient:

1. **Single isotropic scale (§2.5).** The warp is `X=s·x+tx, Y=s·y+ty` with the
   *same* `s` on both axes. A linear map with equal axis scale and zero off-
   diagonal is a similarity: it preserves angles and all length ratios. A square
   maps to a square; a cabinet keeps its shape. Every point of a section shares
   one `(s,tx,ty)`, so nothing moves *relative to its own section* — only the
   section as a whole is repositioned/resized.

2. **Pixel-space solve (§1, §2.2).** We undo `[0,1]` normalisation with each
   image's own `(W,H)` before solving. If we instead solved in normalised space,
   the effective map would be `U=(s·Wₘ/Wₛ)·u+…`, `V=(s·Hₘ/Hₛ)·v+…`: unequal axis
   factors whenever section/master aspect ratios differ → a hidden stretch that
   *would* deform cabinets. Pixel space removes that trap entirely.

3. **Read-only `vectorization_data` (03-decisions ADR-9).** No code path in this
   feature writes `reconstruction.vectorization_data`. The cabinets/doors/stairs/
   lifts stored by the per-section editor's coord-preserving merge
   (`reconstruction_service.py:301-311`) are never re-detected, re-fitted or
   re-normalised. Their stored coordinates remain byte-for-byte identical; the
   transform only ever touches **copies** composited into the floor artifact.

`INTER_NEAREST` (§5.1) keeps the warped mask strictly binary, so even at the
raster level no edge bleed reshapes a wall.

## 7. Tunable constants (one place)

| Constant | Default | Meaning | Frame |
|----------|---------|---------|-------|
| `R_SNAP_PX` | 12 | snap a new control point to the nearest wall vertex within this radius | display px |
| `R_HIT_PX` | 10 | click within this radius selects an existing point instead of adding | display px |
| `R_MIN_BASELINE_FRAC` | 0.02 | min control-point spread as a fraction of the section image diagonal | section px |
| `MAX_CONTROL_POINTS` | 20 | per-section cap | — |
| `MAX_CONNECTORS` | 50 | per-floor cap | — |
| `MAX_CONNECTOR_POINTS` | 64 | max vertices per connector line | — |
| `MAX_FLOOR_CANVAS_PX` | 4000 | long-side cap for the assembled canvas (memory guard) | master px |
| `DETAIL_WARN_SCALE` | 0.5 | warn (non-fatal) when a section's solved scale falls below this — it is downsampled on the low-res master | — |
| `PPM_WARN_RATIO` | 0.10 | cross-section ppm disagreement that raises a warning | — |
| `RESIDUAL_WARN_PX` | derived | residual_rms above this flags the section | master px |
| `FLOOR_HEIGHT` | 3.0 | extrusion height passed to `build_mesh_from_mask` | metres |
| `CONNECTOR_WALL_THICKNESS_PX` | derived from `ppm_floor` | default connector line (wall band) thickness | master px |

Display-px radii are converted to image-px on the client using the canvas display
scale, so behaviour is consistent regardless of zoom.
