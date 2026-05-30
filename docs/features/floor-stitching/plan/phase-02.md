# Phase 02: Pydantic contracts + constants + exceptions

phase: 02
layer: models/, core/
depends_on: none
design: ../05-api-contract.md, ../06-pipeline-spec.md §7

## Goal

Define every API request/response model, the tunable constants, and new exception
types. No logic — pure declarations the rest of the feature imports.

## Files to Create

### `backend/app/models/floor_assembly.py` (Pydantic v2)
Mirror existing model files (`models/floors.py`, `models/sections.py`) for style.
Exact JSON shapes are in [../05-api-contract.md](../05-api-contract.md).

Point/element models:
- `ControlPoint`: `id: str` (pattern `^cp-\d+$`), `x: float = Field(ge=0, le=1)`, `y: float = Field(ge=0, le=1)`.
- `MasterControlPoint`: `point_id: str` (pattern), `x`, `y` (ge=0,le=1).
- `SectionTransform`: `scale, tx, ty, residual_rms_px: float`, `n_points: int`, `solved_at: datetime` — **must be timezone-aware (UTC)** so Pydantic v2 serialises the `...+00:00`/`Z` offset the 05 contract shows; a naive `datetime` would emit no offset and break the contract test.
- `Connector`: `id: int`, `points: list[tuple[float,float]]` (each in [0,1], len≥2), `height_m: float|None`, `thickness_m: float|None`, `connects: list[int]|None`.

Request models:
- `SaveControlPointsRequest { points: list[ControlPoint] }` — validator: ids unique, len ≤ `MAX_CONTROL_POINTS`.
- `SaveMasterControlPointsRequest { points: list[MasterControlPoint] }`.
- `ReplaceConnectorsRequest { connectors: list[ConnectorInput] }` where `ConnectorInput` is `Connector` without `id`; validator: each line ≥2 points, ≤ `MAX_CONNECTORS`, ≤ `MAX_CONNECTOR_POINTS` vertices.
- `ConfirmMeshRequest { glb_file_id: str }` — add `Field(pattern=r'^floor-\d+-preview-[0-9a-f]{8}$')` so a malformed id is rejected at the contract boundary (defense in depth; the storage layer re-checks).

Response models:
- `ControlPointsResponse { reconstruction_id: int, image_size_cropped: tuple[int,int]|None, points: list[ControlPoint] }`.
- `SectionControlPointsResponse { section_id, points, section_point_ids, matched_ids, unmatched_ids }`.
- `SolveTransformsResponse { floor_id, pixels_per_meter: float|None, anchor_section_id: int|None, sections: list[SolveSectionResult] }` where `SolveSectionResult { section_id, status: Literal["ok","needs_points","degenerate"], transform: SectionTransform|None, implied_ppm: float|None, warning: str|None }`.
- `ConnectorsResponse { floor_id, connectors: list[Connector] }`.
- `BuildFloorPreviewResponse { floor_id, glb_file_id, glb_url, persisted: bool, pixels_per_meter, canvas_size_px: tuple[int,int], included_sections: list[int], excluded_sections: list[ExcludedSection], warnings: list[BuildWarning], connector_count: int }` where `ExcludedSection { section_id, reason }`, `BuildWarning { section_id, code, message }`.
- `ConfirmMeshResponse { floor_id, mesh_file_glb, glb_url, persisted: bool }`.
- `FloorAssemblyResponse { floor_id, pixels_per_meter: float|None, mesh_file_glb: str|None, master_schema: MasterSchemaInfo, sections: list[AssemblySection], connectors: list[Connector] }`.

Nested models for the assembly read (declare them explicitly — do NOT leave as "see 05"):
- `MasterSchemaInfo { image_id: str, url: str, crop_bbox: CropBboxModel|None, size_px: tuple[int,int]|None }` — **reuse `models/floors.CropBboxModel`** (normalised `{x,y,width,height,rotation}`), NOT `list[int]`. **Naming:** the response key is `crop_bbox` (matches 05-api-contract §"Assembly read"); it is populated from the ORM attribute `Floor.schema_crop_bbox` — map it explicitly in the service via `CropBboxModel(**floor.schema_crop_bbox) if floor.schema_crop_bbox else None` (source attr ≠ response key on purpose). NOTE: the 05 example previously showed a pixel-valued bbox (3200×2400) — that was a typo; values are normalised `[0,1]` like every other crop bbox in the system.
- `AssemblySection { section_id: int, number: int, reconstruction_id: int|None, mask_file_id: str|None, image_size_cropped: tuple[int,int]|None, section_control_points: list[ControlPoint], master_control_points: list[MasterControlPoint], transform: SectionTransform|None, status: Literal["ok","needs_points","degenerate"] }` (status uses the SAME `Literal` as `SolveSectionResult.status` — define once and reuse).

### `backend/app/core/floor_stitching_constants.py`
From [../06-pipeline-spec.md](../06-pipeline-spec.md) §7. Single source of truth:
```python
R_SNAP_PX = 12
R_HIT_PX = 10
R_MIN_BASELINE_FRAC = 0.02
MAX_CONTROL_POINTS = 20
MAX_CONNECTORS = 50
MAX_CONNECTOR_POINTS = 64
MAX_FLOOR_CANVAS_PX = 4000
DETAIL_WARN_SCALE = 0.5
PPM_WARN_RATIO = 0.10
FLOOR_HEIGHT = 3.0
MIN_CONTROL_POINTS = 3            # ADR-16 policy floor
RESIDUAL_WARN_M = 0.5            # solve residual is "loose" above 0.5 m (metric, scale-invariant)
DEFAULT_CONNECTOR_THICKNESS_M = 0.15  # default connector wall thickness when a line omits thickness_m
```
**Derivation note (no longer "magic"):** both warning/thickness thresholds are fixed
in **metres** here (scale-invariant), and the service converts to pixels at runtime
using `ppm_floor`:
- Residual warning (Phase 07): a section stays `status:"ok"` but gets a non-fatal
  warning when `residual_rms_px / ppm_floor > RESIDUAL_WARN_M` (residual is in
  master-pixels; dividing by `ppm_floor` gives metres). Only evaluated when
  `ppm_floor` is a positive finite number.
- Connector default thickness (Phase 08): `CONNECTOR_WALL_THICKNESS_PX =
  DEFAULT_CONNECTOR_THICKNESS_M * ppm_floor` (master-pixel scale), then k-scaled and
  floored to ≥1 when handed to the assembler (see Phase 08).
There is **no** `RESIDUAL_WARN_PX` constant — the threshold is metric (`RESIDUAL_WARN_M`).

## Files to Modify

### `backend/app/core/exceptions.py`
Reuse existing patterns (look at `FloorNotFoundError`, etc.). Add only what's missing:
- `DegenerateControlPointsError(reason: str)` — raised by the solver / service (also exported from `processing.registration` per Phase 03; pick ONE home and import — recommend defining the exception in `processing.registration` so the pure layer is self-contained, and let the service catch it).
- `SectionNotBoundError(section_id)` — section has no reconstruction (UC2 409).
- `PreviewNotFoundError(glb_file_id)` — unknown/expired preview (UC5 confirm 422).
Map these to HTTP codes in the routers (Phase 06/09), not here.

## Business rules
- All coordinates validated `[0,1]` via `Field(ge=0, le=1)`.
- `Literal` for status enums (no free strings).
- No `Optional` without a default.

## Verification
- [ ] `python -c "from app.models.floor_assembly import *; print('ok')"`.
- [ ] Construct each response model with the example JSON from 05-api-contract and `.model_dump_json()` round-trips.
- [ ] Out-of-range coord raises `ValidationError`; duplicate cp ids raise; >MAX caps raise.
- [ ] `flake8` clean.
