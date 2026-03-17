# Code Plan: Wizard Steps 2-3 (Preprocessing + Wall Editor)

date: 2026-03-17
design: ../README.md
status: draft

## Phase Strategy

**Vertical slice** — Phase A builds Step 2 end-to-end, Phase B builds Step 3 end-to-end.
Each phase is independently testable and visually verifiable before the next begins.

Rationale: The two steps are largely independent (different components, different tools).
Building bottom-up (types → hooks → components) would delay visual feedback. Vertical
slices let us verify Step 2 works before touching Step 3.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| A1 | Types + useWizard update | types + hooks | — | ☐ |
| A2 | CropOverlay component | components/Editor | A1 | ☐ |
| A3 | ToolPanelV2 component | components/Editor | — | ☐ |
| A4 | StepPreprocess + WizardPage wiring | components/Wizard + pages | A1, A2, A3 | ☐ |
| B1 | WallEditorCanvas (Fabric.js) | components/Editor | A1 | ☐ |
| B2 | RoomPopup component | components/Editor | — | ☐ |
| B3 | StepWallEditor + WizardPage wiring | components/Wizard + pages | A1, A3, B1, B2 | ☐ |

## File Map

### New Files
- `frontend/src/components/Wizard/StepPreprocess.tsx` — Step 2 layout
- `frontend/src/components/Wizard/StepPreprocess.module.css`
- `frontend/src/components/Wizard/StepWallEditor.tsx` — Step 3 layout
- `frontend/src/components/Wizard/StepWallEditor.module.css`
- `frontend/src/components/Editor/CropOverlay.tsx` — drag-resizable crop rect
- `frontend/src/components/Editor/CropOverlay.module.css`
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — Fabric.js canvas
- `frontend/src/components/Editor/WallEditorCanvas.module.css`
- `frontend/src/components/Editor/ToolPanelV2.tsx` — new dark tool panel
- `frontend/src/components/Editor/ToolPanelV2.module.css`
- `frontend/src/components/Editor/RoomPopup.tsx` — room number input popup
- `frontend/src/components/Editor/RoomPopup.module.css`

### Modified Files
- `frontend/src/types/wizard.ts` — add WizardStep 6, RoomAnnotation, DoorAnnotation, editedMaskFileId
- `frontend/src/hooks/useWizard.ts` — 6 steps, saveMaskAndAnnotations, rooms/doors state
- `frontend/src/pages/WizardPage.tsx` — add cases 2 (StepPreprocess) and 3 (StepWallEditor), renumber old steps
- `frontend/src/components/Wizard/StepIndicator.tsx` — support 6 steps (if hardcoded)

### Deleted Files
- `frontend/src/components/Wizard/StepEditMask.tsx`
- `frontend/src/components/Wizard/StepEditMask.module.css`
- `frontend/src/components/Editor/ToolPanel.tsx`
- `frontend/src/components/Editor/ToolPanel.module.css`

## Success Criteria
- [ ] All phases completed
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] Visual checklist in 04-testing.md passes
- [ ] All acceptance criteria from ../README.md met
