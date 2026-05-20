# Phase 5: Sync editor and preprocess UI

phase: 5
layer: frontend
depends_on: [phase-04]
design: ../README.md

## Goal
Make the browser UI send and render the same crop, rotation, and canvas-origin information that the backend uses for previews and reconstruction.

## Context
The backend now preserves the geometry frame. This phase ensures the preprocess step, the manual editor, and the wizard hook pass the same transform payloads and render against the same origin.

## Files to Modify

### `frontend/src/components/Editor/CropOverlay.tsx`
**What changes:**
- Keep crop rectangle normalization consistent with the backend contract.
**Lines affected:** approximate range around crop rect helpers and overlay rendering.

### `frontend/src/components/Editor/WallEditorCanvas.tsx`
**What changes:**
- Preserve the same canvas origin when saving, restoring, and redrawing annotations.
**Lines affected:** approximate range around canvas setup, annotation restoration, and export methods.

### `frontend/src/components/Wizard/StepPreprocess.tsx`
**What changes:**
- Pass the same crop/rotation payload that the preview and saved mask flows use.
**Lines affected:** approximate range around crop and rotation controls.

### `frontend/src/components/Wizard/StepWallEditor.tsx`
**What changes:**
- Forward transform metadata with preview updates and annotation changes.
**Lines affected:** approximate range around preview refresh and editor wiring.

### `frontend/src/hooks/useWizard.ts`
**What changes:**
- Keep crop/rotation as the single source of truth for preview, save, reconstruction, and nav graph requests.
**Lines affected:** approximate range around upload, preprocess, mask preview, mesh build, and save actions.

### `frontend/src/api/apiService.ts`
**What changes:**
- Keep request payloads and response parsing aligned with the corrected geometry contract.
**Lines affected:** approximate range around reconstruction and navigation client calls.

## Files to Create

### `frontend/src/__tests__/shift-fix.test.tsx`
**Tests from 04-testing.md to implement here:**
- `test_step_preprocess_produces_expected_crop_payload`
- `test_wall_editor_canvas_preserves_annotation_origin`
- `test_use_wizard_passes_consistent_transform_params`

## Verification
- [ ] Preprocess, editor, and wizard all send the same transform parameters.
- [ ] Canvas annotations are rendered and exported in the same origin frame.
- [ ] Frontend requests still match the backend API shapes.
