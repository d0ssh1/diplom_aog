# Testing: Floor Stitching

> Test strategy + coverage mapping for every acceptance criterion (AC1–AC8 in
> [README.md](README.md)) and every error/edge case in
> [02-behavior.md](02-behavior.md). Naming follows `prompts/testing.md`:
> `test_{what}_{condition}_{result}`, AAA structure.

## Strategy by layer

| Layer | What is tested | How | Notes |
|-------|----------------|-----|-------|
| `processing.registration` | the solver maths | pure unit tests, synthetic point sets with known `(s,tx,ty)` | **required** (CLAUDE.md: every `processing/` fn has tests); no DB/IO |
| `processing.floor_assembly` | warp + composite + connector raster | pure unit tests on tiny numpy masks | assert pixel-exact placement, binary output, no input mutation |
| `services.FloorAssemblyService` | matching, status, ppm derivation, persistence | service tests with in-memory/SQLite + fake `FileStorage` | mock masks via small arrays |
| `api` routers | status codes, validation, contract shapes | FastAPI `TestClient` | one happy + the error table per endpoint |
| frontend hooks | state transitions (ids, active picker, drafts) | vitest on `useWizard`/`useFloorAssembly` | no rendering needed |
| frontend canvas | snap/hit radius, id colours | component test (Testing Library) | the "points can't be confused" guarantees |

The cabinet-preservation guarantee (the hard constraint) gets its own dedicated
tests — see §"Non-displacement tests".

## Unit — `processing.registration.solve_similarity`

| Test | Arrange | Assert |
|------|---------|--------|
| `test_solve_identity_returns_unit_scale_zero_shift` | src == dst (3 pts) | `scale≈1, tx≈0, ty≈0, residual≈0` |
| `test_solve_pure_translation_recovers_shift` | dst = src + (10,20) | `scale≈1, tx≈10, ty≈20` |
| `test_solve_pure_scale_recovers_scale` | dst = 2·src (centred) | `scale≈2`, shift consistent |
| `test_solve_scale_and_shift_recovers_both` | dst = 1.5·src + (30,−5) | all three within 1e-6 |
| `test_solve_is_isotropic_ignores_anisotropic_target` | dst = diag(2,3)·src | returns one `scale` (best-fit ~2.5), **never** `sx,sy`; residual > 0 |
| `test_solve_three_points_is_sufficient` | exactly 3 distinct pts | solves, `n_points==3` |
| `test_solve_collinear_wellspread_is_accepted` | 3 collinear, long baseline | solves (collinear OK for pure scale) |
| `test_solve_reports_residual_rms` | noisy dst | `residual_rms` equals hand-computed RMS |
| `test_solve_isolates_single_misclick_in_residual` | 3 pts, one nudged off | residual rises noticeably (the reason for the ≥3 policy) |
| `test_solve_fewer_than_three_points_raises` | 1 or 2 pts | `DegenerateControlPointsError` (policy floor, ADR-16) |
| `test_solve_coincident_points_raises` | all pts within `R_min_baseline` | raises (denominator≈0 guarded) |
| `test_solve_does_not_mutate_inputs` | keep copies of src,dst | inputs unchanged after call |

## Unit — `processing.floor_assembly`

| Test | Arrange | Assert |
|------|---------|--------|
| `test_warp_identity_places_mask_at_origin` | 4×4 mask, `(1,0,0)`, canvas 8×8 | mask appears top-left, rest 0 |
| `test_warp_translation_places_mask_offset` | `(1, 3, 2)` | white block shifted by (3,2) px |
| `test_warp_uniform_scale_preserves_square` | square mask, `scale=2` | warped region is a square (equal w/h), not a rectangle |
| `test_assemble_composites_two_masks_via_or` | two masks into one canvas | union of both white regions; overlap stays 255 (no double / no 510 overflow) |
| `test_assemble_output_is_binary_uint8` | any input | `set(unique) ⊆ {0,255}`, dtype uint8 (INTER_NEAREST) |
| `test_assemble_does_not_mutate_input_masks` | keep copies | inputs unchanged |
| `test_connector_line_drawn_as_wall_band` | one open polyline connector | a band of pixels along the polyline set to 255; open ends, no closing segment between last and first vertex |
| `test_connector_single_segment_two_points` | 2-point connector | straight wall band between the two points |
| `test_canvas_equals_master_crop_dims` | master crop under cap | canvas dims == master-schema crop dims (fixed sizing, no section-driven upscale) |
| `test_canvas_cap_scales_transforms_uniformly` | canvas over `MAX_FLOOR_CANVAS_PX` | output dims ≤ cap; relative geometry preserved (a square stays square) |
| `test_assemble_empty_sections_returns_zero_canvas` | no sections, no connectors | all-zero canvas of requested size |

## Unit — ppm derivation (service-level pure helper)

| Test | Assert |
|------|--------|
| `test_anchor_is_section_with_most_matched_points` | section with 4 matched chosen over one with 2 |
| `test_anchor_tie_breaks_on_lowest_number` | equal matches → lower `number` wins |
| `test_ppm_floor_equals_anchor_ppm_times_scale` | `ppm_floor == ppm_anchor·s_anchor` |
| `test_ppm_spread_above_ratio_emits_warning` | section 11% off → warning string, status still `ok` |
| `test_ppm_spread_within_ratio_no_warning` | 5% off → `warning is None` |

## Service — `FloorAssemblyService`

| Test | Maps to | Assert |
|------|---------|--------|
| `test_save_master_points_rejects_unknown_point_id` | AC2 / UC2 422 | raises → 422; nothing persisted |
| `test_save_master_points_reports_matched_and_unmatched` | UC2 | `matched_ids`/`unmatched_ids` correct |
| `test_solve_skips_section_with_fewer_than_three_matched_points` | UC3 `needs_points` | 0/1/2 matched → status `needs_points`, transform None |
| `test_solve_marks_degenerate_section` | UC3 `degenerate` | status `degenerate`, reason set |
| `test_solve_persists_transform_for_valid_section` | AC3 | `section.transform` saved with scale/tx/ty |
| `test_solve_no_bound_sections_raises_conflict` | UC3 409 | 409 |
| `test_build_includes_only_ok_sections` | AC6/UC5 | excluded list = needs_points+degenerate |
| `test_build_skips_missing_mask_file_continues` | UC5 200 | section in `excluded` reason `mask_missing`, build still succeeds |
| `test_build_no_transformed_sections_raises_conflict` | UC5 409 | 409 |
| `test_build_mesh_returns_preview_without_persisting` | AC7/UC5 | response has `glb_file_id`, `persisted=false`; `floor.mesh_file_glb` **unchanged** |
| `test_confirm_mesh_promotes_preview_to_floor` | AC7/UC5 | after confirm, `floor.mesh_file_glb` set to `models/floor_{id}.glb` |
| `test_confirm_mesh_unknown_glb_id_raises_422` | UC5 422 | unknown/expired `glb_file_id` rejected; floor unchanged |
| `test_replace_connectors_is_atomic` | AC5/UC4 | old rows gone, new rows present after one call |
| `test_replace_connectors_empty_clears_all` | UC4 200 | 0 rows, no error |
| `test_replace_connectors_line_one_point_returns_422` | UC4 422 | line with <2 points rejected |

## API — contract & status codes

One happy-path + the error rows from [05-api-contract.md](05-api-contract.md) per
endpoint (9 endpoints). Examples:

| Test | Assert |
|------|--------|
| `test_put_section_control_points_duplicate_id_returns_422` | 422 |
| `test_put_section_control_points_out_of_range_returns_422` | 422 |
| `test_put_master_points_unknown_id_returns_422` | 422 |
| `test_solve_transforms_floor_not_found_returns_404` | 404 |
| `test_solve_transforms_no_sections_returns_409` | 409 |
| `test_build_mesh_no_transform_returns_409` | 409 |
| `test_build_mesh_empty_mask_returns_422` | 422 |
| `test_confirm_mesh_unknown_preview_returns_422` | 422 |
| `test_connectors_line_too_few_points_returns_422` | 422 |
| `test_assembly_returns_full_payload_shape` | response matches `FloorAssemblyResponse` keys |

## Frontend

| Test | Maps to | Assert |
|------|---------|--------|
| `useWizard: test_add_control_point_assigns_next_monotonic_id` | AC1 | ids never recycle after delete |
| `useWizard: test_delete_point_does_not_reuse_id` | AC1 | deleted `cp-2` not reissued |
| `ControlPointCanvas: test_click_near_vertex_snaps_within_radius` | AC1 | placed coord == nearest vertex when within `R_SNAP` |
| `ControlPointCanvas: test_click_near_existing_point_selects_not_adds` | UC1 | no new point when within `R_HIT` |
| `useFloorAssembly: test_master_click_writes_to_active_id_only` | AC2 | coordinate stored under the active id, no NN match |
| `useFloorAssembly: test_reclick_same_id_overwrites` | UC2 | one master point per id |
| `ControlPointCanvas: test_same_id_same_colour_on_both_panels` | AC2 | colour/label identical section ↔ master |
| `useFloorAssembly: test_solve_overlay_renders_warped_outline` | UC3 | overlay uses returned transform |

## Non-displacement tests (the hard constraint — AC4, AC6)

These are first-class, called out separately because they are the whole point of
the design.

| Test | Level | Assert |
|------|-------|--------|
| `test_vectorization_data_never_written_during_assembly` | service | spy/patch `update_vectorization_data` → asserted **0 calls** across solve + build |
| `test_uniform_warp_preserves_cabinet_aspect_ratio` | processing | take a known square in section-px, apply `(s,tx,ty)`, assert warped corners form a square (w==h) for any `s` |
| `test_uniform_warp_preserves_relative_positions` | processing | two elements' centre-to-centre vector scales by exactly `s`, angle unchanged |
| `test_solve_pixel_space_not_normalized_no_aspect_skew` | processing/service | section & master with different aspect ratios; after solve+warp the square is still square (would fail if solved in [0,1]) |
| `test_reconstruction_control_points_roundtrip_unchanged` | service | save then read section-local points → byte-identical (no re-normalisation drift) |

## Coverage matrix (acceptance criteria → tests)

| AC | Covered by |
|----|-----------|
| AC1 ≥3 named CPs, unique stable id, snap | `useWizard` id tests, `ControlPointCanvas` snap test, `test_solve_skips_section_with_fewer_than_three_matched_points` |
| AC2 ID-only correspondence, dual highlight | `test_master_click_writes_to_active_id_only`, `test_same_id_same_colour_on_both_panels`, `test_save_master_points_rejects_unknown_point_id` |
| AC3 auto-match + least squares + residual + reject | all `solve_similarity` tests + `test_solve_marks_degenerate_section` |
| AC4 strictly uniform, read-only data | `test_solve_is_isotropic*`, `test_uniform_warp_preserves_cabinet_aspect_ratio`, `test_vectorization_data_never_written_during_assembly` |
| AC5 connectors CRUD, normalised | `test_replace_connectors_is_atomic`, `test_connectors_line_too_few_points_returns_422`, `test_connector_line_drawn_as_wall_band` |
| AC6 warp+composite→`build_mesh_from_mask` | `processing.floor_assembly` suite + `test_build_includes_only_ok_sections` |
| AC7 preview → confirm → persist GLB | `test_build_mesh_returns_preview_without_persisting`, `test_confirm_mesh_promotes_preview_to_floor`, MeshViewer dispose test |
| AC8 Pydantic models, normalised coords, pure fns | API contract tests + the no-mutation `processing` tests |

## Fixtures

- `make_points(n, scale, shift, noise=0)` — synthetic src/dst pairs with a known
  transform for solver tests.
- `tiny_mask(shape, rects)` — small uint8 masks with white rectangles for assembly
  tests.
- `fake_storage` — `FileStorage` double returning in-memory masks / a temp schema
  so service tests need no real files.
- SQLite session fixture (reuse the existing test DB setup) for repo/service tests.

## End-to-end fixture (self-verification — no real data needed)

A standalone seed script (e.g. `scripts/seed_demo_floor.py`) builds a fully synthetic
**building → floor → 2–3 sections**, each with a generated wall mask + a master
schema image, places known control points so the solve is exact, then runs
`solve-transforms` → `build-mesh` → `confirm-mesh` and asserts a non-empty floor GLB
is produced. This is the artifact used to **drive the full pipeline end-to-end**
(per the user's "create a synthetic fixture") — both for an automated smoke test and
for manually loading the resulting GLB in the 3D viewer. It needs no operator data
and is reproducible in CI.
