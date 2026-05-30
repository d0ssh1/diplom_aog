# Phase 08: Build → confirm → assembly read (UC5 + GET assembly)

phase: 08
layer: services/, services/file_storage.py
depends_on: 04, 07
design: ../06-pipeline-spec.md §5–6; ../05-api-contract.md §UC5 + "Assembly read"; ../02-behavior.md §UC5; ADR-17/18

## Goal

Assemble the combined mask → floor GLB as a **preview** (no persist), then promote
on confirm. Plus the single `GET assembly` read that drives the whole Floor Editor.

## Files to Modify

### `backend/app/services/file_storage.py`
Add (mirror `save_mesh_files`; preview→confirm is stateless/disk-based, no DB
registry):
```python
async def save_floor_preview_mesh(self, floor_id: int, mesh) -> tuple[str, str]:
    # token = uuid4().hex[:8]; glb_file_id = f"floor-{floor_id}-preview-{token}"
    # path = models/floor_{floor_id}_preview_{token}.glb
    # ATOMIC export: mesh.export(path + ".tmp"); os.replace(path + ".tmp", path)
    # return glb_file_id, glb_url
def floor_preview_path(self, floor_id: int, glb_file_id: str) -> str:
    # re.fullmatch(r'floor-(\d+)-preview-([0-9a-f]{8})\Z', glb_file_id) — reject None
    # assert int(group1) == floor_id  → else raise FileStorageError (cross-floor / traversal)
    # → models/floor_{id}_preview_{token}.glb
async def promote_floor_preview(self, floor_id: int, glb_file_id: str) -> tuple[str, str]:
    # parse+validate via floor_preview_path(floor_id, glb_file_id)
    # validate preview file exists (else raise FileStorageError → PreviewNotFoundError)
    # ATOMIC promote: copy preview → models/floor_{floor_id}.glb.tmp; os.replace(.tmp, final)
    # return (rel_path, url)
```
Validate `glb_file_id` strictly with **`re.fullmatch`** and **`\Z`** (NOT `$` — `$`
matches before a trailing `\n`, allowing `floor-3-preview-deadbeef\n` to slip into
`os.path.join`). The id's `floor_id` segment MUST equal the `floor_id` path arg in
BOTH `floor_preview_path` and `promote_floor_preview` (so a caller can't confirm
`floor-7-preview-…` against `/floors/3/confirm-mesh` and promote floor 7's preview
into `floor_3.glb`). Pydantic also pattern-checks `ConfirmMeshRequest.glb_file_id`
(Phase 02) — defense in depth. Export/promote write to `*.tmp` then `os.replace`
(atomic on same FS) so a concurrent reader never sees a half-written GLB.

## Files to Modify — `floor_assembly_service.py`

**`build_floor_mesh(floor_id) -> BuildFloorPreviewResponse`** (UC5 preview)
- floor 404; master schema image missing → 422.
- `list_by_floor`; ok-sections = those with a persisted `transform`; none → 409 (`Run solve-transforms first`).
- Master dims `(Wm,Hm)` from schema image + `schema_crop_bbox`. Compute memory-guard `k` (06 §5.2): if `max(Wm,Hm) > MAX_FLOOR_CANVAS_PX` → `k = MAX_FLOOR_CANVAS_PX/max(Wm,Hm)`, else 1.0. Canvas = `(round(Wm*k), round(Hm*k))`.
- For each ok-section: load mask (`storage.load_mask`); missing file → add to `excluded_sections` reason `mask_missing`, continue. **Normalise the loaded mask to binary `{0,255}`** (e.g. `mask = np.where(mask > 127, 255, 0).astype(np.uint8)` on a `.copy()`) before warping — `load_mask` may return `{0,1}` or grayscale, and `build_mesh_from_mask` thresholds at >127, so an un-normalised `{0,1}` mask would silently drop all walls. Build `SectionWarpInput` with transform pre-multiplied by `k`: `scale*k, tx*k, ty*k`. If `transform.scale < DETAIL_WARN_SCALE` → append `low_detail` warning. (A wildly-oversized `scale` — section ≫ master, usually bad control points — is bounded by the fixed canvas + INTER_NEAREST, but the Phase-07 `PPM_WARN_RATIO` cross-check already surfaces it as a warning; rely on that rather than silently saturating.)
- Connector defaults (derive ONCE, before the loop):
  `CONNECTOR_WALL_THICKNESS_PX = DEFAULT_CONNECTOR_THICKNESS_M * ppm_floor` (master-pixel
  scale; `DEFAULT_CONNECTOR_THICKNESS_M` from Phase 02 constants), then
  `default_thickness_px = max(1, round(CONNECTOR_WALL_THICKNESS_PX * k))` — this is the
  exact value passed as `assemble_floor_mask(..., default_wall_thickness_px=default_thickness_px)`.
- Connectors → `ConnectorRaster`: de-normalise points ×canvas dims `(round(Wm*k), round(Hm*k))` (int32); per-connector `thickness_px = max(1, round((c.thickness_m or DEFAULT_CONNECTOR_THICKNESS_M) * ppm_floor * k))`. **The default MUST also be k-scaled** (a connector that omits `thickness_m` uses `default_thickness_px` above, NOT the un-scaled `CONNECTOR_WALL_THICKNESS_PX`; drawing the master-scale thickness onto the k-shrunk canvas makes connector walls `1/k` too thick). `max(1, …)` is mandatory: `cv2.polylines` treats `thickness=0` as a 1px hairline, silently hiding a sub-pixel wall on a heavily-downscaled canvas — round up instead.
- **Guard before building (NEW):** if `included_sections` is empty after exclusion (every section `mask_missing`) → 422 (`No section masks to assemble`) — do NOT call the builder with an all-zero canvas. If `floors.pixels_per_meter` is `None`/`≤0`/non-finite (no valid metric scale from solve, Phase 07) → 422 (`Floor has no metric scale — re-run solve/vectorization`); never pass `0`/`None` ppm to the builder (it does `1/ppm`).
- `combined = assemble_floor_mask(sections, canvas, connectors, default_thickness_px)`.
- `mesh = build_mesh_from_mask(combined, floor_height=FLOOR_HEIGHT, pixels_per_meter=floors.pixels_per_meter * k, vr=None)` — **unchanged** builder. If it still raises "No wall contours" → 422 (`Empty floor mask`).
- `glb_file_id, glb_url = storage.save_floor_preview_mesh(floor_id, mesh)`.
- **Do NOT set `floors.mesh_file_glb`.** Return `BuildFloorPreviewResponse` (`persisted=false`, included/excluded/warnings/connector_count/canvas_size_px).

**`confirm_floor_mesh(floor_id, glb_file_id) -> ConfirmMeshResponse`** (UC5 confirm)
- floor 404; `storage.promote_floor_preview` → on missing preview raise `PreviewNotFoundError` (422, `No such preview — rebuild first`).
- `floor_repo.update_mesh_glb(floor_id, rel_path)`; return `persisted=true`.

**`get_assembly(floor_id) -> FloorAssemblyResponse`** (Assembly read)
- floor 404. Build the full payload (05 "Assembly read"): master_schema info (image id/url/crop/size), each section (number, reconstruction_id, mask_file_id, image_size_cropped from vectorization_data, section_control_points, master_control_points, transform, status), connectors. `mesh_file_glb` = the **confirmed** `floors.mesh_file_glb` (null until confirm). Status derives from presence of transform / matched-count (mirror solve statuses).

## Business rules
- Preview never overwrites `floors.mesh_file_glb` (ADR-17).
- Fixed canvas = master crop dims; only the memory-guard `k` rescales, applied
  uniformly to transforms + ppm + connector px so shapes are preserved (ADR-18, 06 §6).
- **`k`-threading invariant (single source of truth):** compute `k` ONCE in
  `build_floor_mesh`, then thread the *same* `k` identically into all five consumers
  or the floor silently scales wrong: (a) `canvas = (round(Wm*k), round(Hm*k))`,
  (b) every section transform `scale*k, tx*k, ty*k`, (c) connector point de-norm
  `×(round(Wm*k), round(Hm*k))`, (d) connector thickness `*k` (including the default),
  (e) builder `pixels_per_meter * k`. The `DETAIL_WARN_SCALE` test compares the
  *un-scaled* `transform.scale` (not `scale*k`).
- `k` multiplies `pixels_per_meter` passed to the builder (so metres stay correct).
- Never mutate masks; never write `vectorization_data`.

## Verification
- [ ] Manual: solve → build-mesh returns `glb_file_id`, `persisted:false`, and `floors.mesh_file_glb` still NULL; the preview GLB exists on disk and loads in a viewer.
- [ ] confirm-mesh with that id → `floors.mesh_file_glb = models/floor_{id}.glb`; confirm with bogus id → 422.
- [ ] build with no transformed sections → 409; with empty mask → 422; missing one section mask → section in `excluded` (`mask_missing`), build still succeeds.
- [ ] GET assembly returns the full shape with `mesh_file_glb` null before confirm, set after.
- [ ] `flake8` clean.
