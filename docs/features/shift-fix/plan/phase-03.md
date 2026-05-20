# Phase 3: Preserve transform in services

phase: 3
layer: service
depends_on: [phase-02]
design: ../README.md

## Goal
Make preview, reconstruction, and nav services read and write the same geometry frame so saved data cannot drift from editor state.

## Context
Phase 2 centralizes the underlying transforms. This phase makes the service layer persist and reuse those transforms consistently across mask generation, reconstruction, and nav graph building.

## Files to Modify

### `backend/app/services/mask_service.py`
**What changes:**
- Use the same crop/rotation transform path in preview and saved mask generation.
- Keep preview output and saved output aligned.
**Lines affected:** approximate range around `preview_mask(...)` and `calculate_mask(...)`.

### `backend/app/services/reconstruction_service.py`
**What changes:**
- Read geometry metadata back from saved reconstruction data without reinterpreting the origin.
- Store vectorization data in a way that preserves the same frame used by the editor and mask preview.
**Lines affected:** approximate range around `build_mesh(...)`, `get_vectorization_data(...)`, and `update_vectorization_data(...)`.

### `backend/app/services/nav_service.py`
**What changes:**
- Consume the same normalized geometry frame produced by reconstruction.
- Prevent a second implicit transform before graph/route output.
**Lines affected:** approximate range around `build_graph(...)` and `find_route(...)`.

## Files to Create

### `backend/tests/services/test_shift_fix_service.py`
**Tests from 04-testing.md to implement here:**
- `test_preview_mask_uses_same_crop_and_rotation_as_saved_mask`
- `test_calculate_mask_matches_preview_transform`
- `test_build_mesh_uses_saved_vectorization_frame`
- `test_update_vectorization_data_preserves_geometry_frame`
- `test_build_graph_uses_normalized_coordinates`

## Verification
- [ ] Preview and saved mask use the same transform inputs.
- [ ] Reconstruction round-trips geometry metadata without drift.
- [ ] Nav graph uses the same normalized coordinates as reconstruction.
