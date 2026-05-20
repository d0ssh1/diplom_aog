# Phase 3: Restore and save canonical geometry in frontend

phase: 3
layer: frontend
depends_on: [phase-02]
design: ../README.md

## Goal
Stop the edit-plan page from flattening room geometry on load/save and make the canvas restore flow use the canonical room payload consistently.

## Context
The backend now preserves typed vector payloads. The frontend must stop turning loaded geometry into new synthetic rectangles when it builds the save payload.

## Files to Modify

### `frontend/src/pages/EditPlanPage.tsx`
**What changes:**
- Replace `unknown` vector parsing with the new typed vector interfaces.
- Preserve loaded room geometry instead of rebuilding polygons from bounding boxes on save.
- Keep `currentRooms` aligned with the restored canonical model.
- Keep door round-trip behavior unchanged except for typed payloads.

### `frontend/src/components/Editor/WallEditorCanvas.tsx`
**What changes:**
- Keep restored annotations consistent with the canonical room annotation model.
- If the current UI remains rectangle-based, ensure that the data model used for saving still preserves loaded geometry.
- Do not regenerate polygon geometry inside the canvas restore path.

### `frontend/src/api/apiService.ts`
**What changes:**
- Use typed vector helpers for read/write calls.

### `frontend/src/types/wizard.ts`
**What changes:**
- Only if the room annotation contract needs to be extended or clarified for the restore/save flow.

## Verification
- [ ] Opening edit-plan with existing rooms displays the restored rooms without shape loss in the saved payload
- [ ] Saving without edits does not overwrite polygons with synthetic rectangles
- [ ] Frontend type checks pass with no `any`
- [ ] UI behavior remains stable when vector JSON is missing or incomplete
