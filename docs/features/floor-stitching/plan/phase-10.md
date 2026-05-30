# Phase 10: Backend tests (service + API)

phase: 10
layer: tests/
depends_on: 06, 07, 08, 09
design: ../04-testing.md §Service, §API, §Non-displacement

## Goal

Cover the service logic and the router contract. (Pure `processing/` tests were
written in Phases 03–04.)

## Files to Create

### `backend/tests/services/test_floor_assembly_service.py`
(Create `backend/tests/services/__init__.py` if the dir is new.)
Rows from [../04-testing.md](../04-testing.md) §Service:
`test_save_master_points_rejects_unknown_point_id`,
`test_save_master_points_reports_matched_and_unmatched`,
`test_solve_skips_section_with_fewer_than_three_matched_points`,
`test_solve_marks_degenerate_section`,
`test_solve_persists_transform_for_valid_section`,
`test_solve_no_bound_sections_raises_conflict`,
`test_solve_response_carries_ppm_spread_warning_on_ok_section` (AC3/UC3 §3 —
section solves `ok` but ppm differs from the floor anchor by > `PPM_WARN_RATIO`;
assert the `SolveSectionResult.status=="ok"` AND `.warning` carries the ppm-spread
string — i.e. the warning surfaces through the response, not just the pure helper),
`test_solve_high_residual_section_is_ok_with_warning` (AC3 — `residual_rms_px /
ppm_floor` above `RESIDUAL_WARN_M` but solvable; `status=="ok"` + non-fatal residual
warning string in `.warning`; distinct from the degenerate path),
`test_build_includes_only_ok_sections`,
`test_build_skips_missing_mask_file_continues`,
`test_build_no_transformed_sections_raises_conflict`,
`test_build_emits_low_detail_warning_for_small_scale_section` (AC6/ADR-18 — fake a
section `transform.scale = 0.42 < DETAIL_WARN_SCALE`; assert a `low_detail`
BuildWarning is returned and the build still produces a preview; the comparison is
against the **un-scaled** `transform.scale`, not `scale*k`),
`test_canvas_capped_at_max_px_scales_transforms_by_k` (AC6/ADR-18 — master long side
> `MAX_FLOOR_CANVAS_PX`; assert the service derives `k`, the resulting
`canvas_size_px` long side ≤ 4000, and the same `k` reaches transforms + ppm +
connector px so geometry is preserved — this is the cap logic moved out of Phase 04),
`test_build_mesh_returns_preview_without_persisting` (also assert
`canvas_size_px == master crop dims` (or capped dims) and
`connector_count == len(connectors)` — these contract fields were previously
unasserted),
`test_confirm_mesh_promotes_preview_to_floor`,
`test_confirm_mesh_unknown_glb_id_raises_422`,
`test_replace_connectors_is_atomic`,
`test_replace_connectors_empty_clears_all`,
`test_replace_connectors_line_one_point_returns_422`.
Plus ppm helper tests (§ppm derivation) and the **non-displacement service test**:
`test_vectorization_data_never_written_during_assembly` — spy/patch
`reconstruction_repo.update_vectorization_data`, assert **0 calls** across
solve + build + confirm.
`test_reconstruction_control_points_roundtrip_unchanged`.

Use `fake_storage` (FileStorage double returning in-memory `tiny_mask`s + a temp
schema) and the existing SQLite session fixture (see `backend/tests/conftest.py`).

### `backend/tests/api/test_floor_assembly_api.py`
Rows from §API (FastAPI `TestClient`): one happy path per endpoint + the error
table — `test_put_master_points_unknown_id_returns_422`,
`test_solve_transforms_floor_not_found_returns_404`,
`test_solve_transforms_no_sections_returns_409`,
`test_build_mesh_no_transform_returns_409`,
`test_build_mesh_empty_mask_returns_422`,
`test_confirm_mesh_unknown_preview_returns_422`,
`test_connectors_line_too_few_points_returns_422`,
`test_get_connectors_returns_connectors_response_shape` (UC4 GET — the GET-200
`ConnectorsResponse` shape; PUT was the only connector path covered before),
`test_assembly_returns_full_payload_shape`.
Pin the exact `excluded_sections[].reason` enum strings round-trip through the API
response in `test_build_*` assertions: `"needs_points"`, `"degenerate"`,
`"mask_missing"` (not just "section is excluded").

### `backend/tests/api/test_reconstruction.py` (extend)
`test_put_section_control_points_duplicate_id_returns_422`,
`test_put_section_control_points_out_of_range_returns_422`,
`test_get_reconstruction_control_points_echoes_nullable_image_size` (the GET exists
to echo `image_size_cropped: tuple|null`; assert that nullable field round-trips —
both the populated and the null case),
plus a GET/PUT happy path.

## Verification
- [ ] `cd backend && pytest -q` → all green (new + existing).
- [ ] `test_vectorization_data_never_written_during_assembly` passes (the hard constraint).
- [ ] Coverage: every AC1–AC8 row in [../04-testing.md](../04-testing.md) coverage matrix has a passing test.
- [ ] `flake8 backend/app backend/tests` clean.
