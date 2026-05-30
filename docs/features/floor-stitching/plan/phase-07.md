# Phase 07: FloorAssemblyService core (UC2 bind, UC3 solve, UC4 connectors)

phase: 07
layer: services/
depends_on: 02, 03, 05
design: ../06-pipeline-spec.md §1–4; ../05-api-contract.md §UC2–UC4; ../02-behavior.md §UC2–UC3

## Goal

The registration brain (no mesh yet): save master control points, solve every
section's transform by matching IDs, derive `ppm_floor`, and CRUD connectors.

## Files to Create

### `backend/app/services/floor_assembly_service.py`
DI: `floor_repo`, `section_repo`, `reconstruction_repo`, `connector_repo`,
`storage` (FileStorage — needed in Phase 08). Constructor mirrors `SectionService`.

Methods this phase:

**`save_section_control_points(floor_id, section_id, points) -> SectionControlPointsResponse`** (UC2)
- `section_repo.get_by_id` → 404; section.reconstruction None → `SectionNotBoundError` (409).
- Section point ids = `reconstruction.control_points` ids.
- Every `point_id` MUST be in that set, else 422 (`point_id cp-9 is not a control point of the section`).
- `section_repo.update_master_control_points(...)`.
- Return matched/unmatched id lists.

**`solve_transforms(floor_id) -> SolveTransformsResponse`** (UC3)
- `section_repo.list_by_floor`; keep sections with a bound reconstruction; none → 409 (`No sections bound to plans`).
- For each section:
  - Match ids: pairs where a master point_id has a matching section-local id.
  - `< 3` matched → status `needs_points`, transform None, warning.
  - Load the section wall mask via `storage.load_mask(reconstruction.mask_file_id)` to get `(Hs,Ws)` (06 §1: de-normalise by the loaded mask's true dims; assert aspect ≈ `vectorization_data.image_size_cropped`, surface data error if grossly off). De-normalise section-local pts ×(Ws,Hs); master pts ×(Wm,Hm) (master dims from schema image + `schema_crop_bbox`).
  - `min_baseline_px = R_MIN_BASELINE_FRAC * hypot(Ws,Hs)`.
  - `solve_similarity(src_px, dst_px, min_baseline_px)`; on `DegenerateControlPointsError` → status `degenerate`, transform None, warning = reason.
  - On success → build `SectionTransform` (scale,tx,ty,residual_rms_px,n_points,
    `solved_at=datetime.now(timezone.utc)` — timezone-aware, NOT naive `utcnow()`),
    persist via `section_repo.update_transform`, status `ok`.
- Derive `ppm_floor` (06 §4): anchor = ok-section with most matched points (tie → lowest `section.number`); `floors.pixels_per_meter = ppm_section_anchor * s_anchor` where `ppm_section_k = reconstruction.vectorization_data.estimated_pixels_per_meter`.
  - **Guard (NEW):** when selecting the anchor, only consider ok-sections whose `estimated_pixels_per_meter` is present, `> 0`, and finite. `vectorization_data` is nullable JSON, so the field may be missing/`0`/`None`. If NO ok-section has a valid scale → set `ppm_floor = None` (do not raise here); build-mesh will surface a clean 422 (Phase 08). This prevents a `0`/`None` ppm reaching `build_mesh_from_mask` (which does `1/ppm` → 500).
  - Persist via `floor_repo.update_pixels_per_meter`.
- Per ok-section: only if `ppm_floor` is a positive finite number, compute `implied_ppm = ppm_section_k * s_k` and the ratio `implied_ppm/ppm_floor` (guard the divisor); if `|ratio - 1| > PPM_WARN_RATIO` → non-fatal warning string (status stays `ok`, e.g. `"ppm differs from floor anchor by 11% — check control points"`). If `ppm_floor` is None, skip the cross-check.
- **Residual warning (per ok-section, same post-ppm pass):** when `ppm_floor` is a positive finite number, convert the section's residual to metres `residual_rms_m = transform.residual_rms_px / ppm_floor`; if `residual_rms_m > RESIDUAL_WARN_M` → non-fatal warning (status stays `ok`), e.g. `f"control-point fit is loose ({residual_rms_m:.2f} m RMS) — points may be misplaced"`. A section can carry BOTH the ppm-spread and the residual warning; `SolveSectionResult.warning` is a single string, so join them (`"; "`) if both fire. If `ppm_floor` is None, skip (can't express residual in metres).
- Sections that failed to solve get transform cleared (`update_transform(None)`) so a stale transform never lingers.
- **Atomicity (NEW):** do ALL computation first — load every mask, run every `solve_similarity`, choose the anchor, compute `ppm_floor` — into an in-memory results list (expected per-section failures are recorded as `needs_points`/`degenerate` statuses, NOT exceptions). Only AFTER the full pass succeeds, persist (transforms + ppm + cleared transforms). An UNEXPECTED error (e.g. `load_mask` IO failure) must abort BEFORE any write, so the floor is never left half-solved.

**ppm helper** — extract a pure helper for anchor selection + ppm so it can be unit-tested (04-testing §ppm derivation): `test_anchor_is_section_with_most_matched_points`, `test_anchor_tie_breaks_on_lowest_number`, `test_ppm_floor_equals_anchor_ppm_times_scale`, `test_ppm_spread_*`.

**`get_connectors(floor_id) -> ConnectorsResponse`** / **`replace_connectors(floor_id, items) -> ConnectorsResponse`** (UC4)
- floor 404; line <2 points → 422 (also enforced by Pydantic Phase 02); >MAX → 422.
- `connector_repo.replace_all_for_floor` (atomic). Empty list clears (200).

## Business rules
- NEVER write `vectorization_data` (read-only access only, for ppm + image size).
- Service does ALL IO; calls the pure solver with plain arrays.
- `.copy()` masks if any pre-processing; never mutate loaded arrays.
- `logging` not `print`.

## Verification
- [ ] Service unit tests (Phase 10) cover UC2/UC3/UC4 — but smoke-check here:
- [ ] Manual: bind 3 matched master points → `solve_transforms` returns status `ok` + a transform; 2 matched → `needs_points`; coincident → `degenerate`.
- [ ] `floors.pixels_per_meter` set after solve.
- [ ] `replace_connectors` then `get_connectors` round-trips; empty clears.
- [ ] `flake8` clean.
