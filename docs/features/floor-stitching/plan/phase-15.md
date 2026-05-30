# Phase 15: End-to-end synthetic fixture + self-verification

phase: 15
layer: scripts/, backend/tests/integration
depends_on: 09
design: ../04-testing.md §"End-to-end fixture"

## Goal

A standalone, reproducible script that builds a fully synthetic
**building → floor → 2–3 sections** (generated wall masks + a master schema),
places control points so the solve is exact, then runs
solve → build → confirm and asserts a non-empty floor GLB. This is the self-test
the user asked for: no operator data, runnable in CI, and the GLB is loadable in
the 3D viewer for manual eyeballing.

## Files to Create

### `scripts/seed_demo_floor.py`
(Mirror `scripts/create_superuser.py` style for DB/session bootstrap.) Steps:
1. Generate N=2–3 synthetic section wall masks (`np.zeros` + `cv2.rectangle`
   rooms/corridors), save as PNG into `uploads/masks/{uuid}.png`; create matching
   `UploadedFile` (file_type=2) + `Reconstruction` rows with a minimal
   `vectorization_data` JSON carrying `image_size_cropped` + `estimated_pixels_per_meter`.
2. Generate a master schema image (place each section's footprint at a known
   offset/scale), save into `uploads/schemas/{uuid}.png`; create the `Building` +
   `Floor` (schema_image_id, schema_crop_bbox) + `Section` rows (geometry,
   reconstruction_id) bound to the reconstructions.
3. Set **section-local** control points (3 well-spread, non-collinear corners) on
   each reconstruction, and the **master** control points at the exact known mapped
   locations (so residual ≈ 0).
4. Call the service layer (or hit the API via `TestClient`):
   `solve_transforms` → assert all `ok`; `build_mesh` → assert `persisted=false` +
   a `glb_file_id`; `confirm_mesh` → assert `floors.mesh_file_glb` set.
5. Load the produced GLB with trimesh → assert non-empty (vertices > 0, faces > 0).
6. Print the floor_id + GLB path so the operator can open it in the viewer.

Make it idempotent / `--reset` friendly (or write to a throwaway DB) so it can run
repeatedly. Use `logging`, not `print`, for diagnostics (final summary line ok).

### `backend/tests/integration/test_floor_stitching_e2e.py`
Wrap the same flow as an automated smoke test against a temp SQLite DB + temp
upload dir (reuse the fixtures from Phase 10): seed → solve → build → confirm →
assert non-empty GLB. Marks AC1–AC7 working end to end.

## Verification
- [ ] `cd backend && python ../scripts/seed_demo_floor.py` runs clean and prints a floor_id + GLB path.
- [ ] The printed GLB opens in the 3D viewer (manual) and shows the stitched walls + connector bands.
- [ ] `pytest tests/integration/test_floor_stitching_e2e.py -q` green.
- [ ] Re-running the script is reproducible (no leftover-state failures).

## Note on running it myself
During implementation I (the assistant) will run this script + the integration
test directly to self-verify the pipeline produces a valid GLB, per the user's
request that the feature "works as intended". UI feature-correctness (the 4 Floor
Editor steps) will be checked on the dev server; if a browser check is not
possible I will say so explicitly rather than claim success.
