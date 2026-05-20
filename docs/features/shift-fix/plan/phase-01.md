# Phase 1: Align geometry contract

phase: 1
layer: models
depends_on: none
design: ../README.md

## Goal
Define the shared geometry contract so crop, rotation, and normalized coordinates refer to the same plan frame in every layer.

## Context
The current implementation already passes crop/rotation through mask preview and reconstruction flows, and `VectorizationResult` already carries crop metadata in the research snapshot. This phase makes that contract explicit in the domain/model layer so later phases can rely on one shape.

## Files to Modify

### `backend/app/models/domain.py`
**What changes:**
- Ensure the domain vectorization object can carry crop/rotation metadata explicitly.
- Keep the object as the canonical in-memory representation for geometry round-tripping.
**Lines affected:** approximate range around `VectorizationResult`.

### `backend/app/models/reconstruction.py`
**What changes:**
- Remove the duplicate `MaskPreviewRequest` definition.
- Keep request/response shapes aligned with the transform payload used by preview and reconstruction.
**Lines affected:** approximate range around the crop/mask request models.

## Files to Create

### `backend/tests/processing/test_shift_fix.py`
**Tests from 04-testing.md to implement here:**
- `test_normalize_coords_returns_normalized_points`
- `test_preprocess_image_does_not_mutate_input`

## Verification
- [ ] Domain model shape is explicit for crop/rotation metadata.
- [ ] Duplicate request model is removed.
- [ ] Processing tests describe the shared geometry contract.
