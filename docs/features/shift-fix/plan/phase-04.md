# Phase 4: Pass consistent payloads from API

phase: 4
layer: api
depends_on: [phase-03]
design: ../README.md

## Goal
Keep the HTTP layer thin while ensuring request and response payloads preserve the geometry contract without adding extra transforms.

## Context
The service layer now preserves the same geometry frame. This phase updates the routers and API helpers so they forward crop/rotation/vectorization payloads unchanged and expose aligned models to the frontend.

## Files to Modify

### `backend/app/api/reconstruction.py`
**What changes:**
- Forward crop/rotation and vectorization payloads directly to services.
- Return the same geometry-related response shapes the frontend expects.
**Lines affected:** approximate range around mask preview, reconstruction, vectors, rooms, and nav graph endpoints.

### `backend/app/api/upload.py`
**What changes:**
- Keep upload records aligned with the plan/mask flow and avoid any geometry reinterpretation in the router.
**Lines affected:** approximate range around file upload endpoints.

### `backend/app/api/navigation.py`
**What changes:**
- Keep the navigation router from applying placeholder geometry behavior to alignment-sensitive flows.
**Lines affected:** approximate range around route/graph endpoints.

### `backend/app/api/deps.py`
**What changes:**
- Keep dependency injection aligned with the same service/repository instances used by the fixed geometry flow.
**Lines affected:** approximate range around service/repository providers.

## Files to Create

### `backend/tests/api/test_shift_fix_api.py`
**Tests from 04-testing.md to implement here:**
- `test_mask_preview_valid_request_200`
- `test_mask_preview_invalid_request_400`
- `test_initial_masks_valid_request_200`
- `test_update_vectors_valid_request_200`
- `test_build_reconstruction_valid_request_200`
- `test_build_nav_graph_valid_request_200`
- `test_find_route_valid_request_200`

## Verification
- [ ] Routers remain thin and do not introduce new coordinate transforms.
- [ ] API payloads preserve the same crop/rotation/vectorization contract.
- [ ] Frontend-visible response shapes still match the existing client expectations.
