# Phase 2: Centralize transform pipeline

phase: 2
layer: processing
depends_on: [phase-01]
design: ../README.md

## Goal
Make crop, rotation, and coordinate normalization use one shared processing path so preview, save, and reconstruction cannot diverge.

## Context
Phase 1 establishes the geometry contract in the models. This phase uses that contract to keep the processing layer consistent across preview masks, saved masks, and route/reconstruction conversions.

## Files to Modify

### `backend/app/processing/pipeline.py`
**What changes:**
- Keep crop, rotation, normalization, and coordinate conversion in one shared transform flow.
- Ensure the same transform path is used for preview-oriented and reconstruction-oriented geometry.
**Lines affected:** approximate range around `auto_crop_suggest(...)`, `normalize_coords(...)`, and related transform helpers.

### `backend/app/processing/nav_graph.py`
**What changes:**
- Verify the graph serialization and 2D→3D route conversion consume normalized coordinates without applying a second implicit shift.
**Lines affected:** approximate range around serialization and route conversion helpers.

## Files to Create

### `backend/tests/processing/test_shift_fix.py`
**Tests from 04-testing.md to implement here:**
- `test_auto_crop_suggest_preserves_expected_origin`
- `test_nav_graph_serialization_uses_same_coordinate_frame`

## Verification
- [ ] Transform helpers produce normalized coordinates in `[0, 1]`.
- [ ] No additional coordinate shift is applied in nav graph serialization.
- [ ] Processing remains free of API/DB imports.
