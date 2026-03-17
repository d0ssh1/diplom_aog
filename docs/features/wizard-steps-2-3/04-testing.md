# Testing Strategy: Wizard Steps 2-3

## Notes

This feature is purely frontend. No new backend endpoints are added — it uses existing
`POST /reconstruction/initial-masks` and `POST /upload/user-mask`. Backend tests are
not required for this feature.

Frontend testing focuses on:
1. Hook logic (`useWizard` state transitions)
2. CropOverlay coordinate normalization
3. WallEditorCanvas annotation management

Fabric.js canvas rendering is not unit-tested (requires DOM + canvas mock). Visual
verification is the acceptance gate per ticket.

## Test Structure

```
frontend/src/
└── __tests__/
    ├── hooks/
    │   └── useWizard.test.ts
    └── components/
        └── CropOverlay.test.ts   (pure coordinate math only)
```

## Coverage Mapping

### useWizard Hook

| Scenario | Test Name |
|----------|-----------|
| Initial state has step=1, 6 total steps | test_useWizard_initialState_step1 |
| nextStep increments step | test_useWizard_nextStep_incrementsStep |
| prevStep decrements step | test_useWizard_prevStep_decrementsStep |
| nextStep clamps at 6 | test_useWizard_nextStep_clampsAt6 |
| prevStep clamps at 1 | test_useWizard_prevStep_clampsAt1 |
| setCropRect updates cropRect | test_useWizard_setCropRect_updatesCropRect |
| setRotation cycles 0→90→180→270→0 | test_useWizard_setRotation_cycles |
| calculateMask sets isLoading then maskFileId | test_useWizard_calculateMask_setsLoading |
| calculateMask on error sets error state | test_useWizard_calculateMask_onError_setsError |
| calculateMask on network timeout sets error | test_useWizard_calculateMask_timeout_setsError |
| saveMaskAndAnnotations sets editedMaskFileId | test_useWizard_saveMask_setsEditedMaskFileId |

### CropOverlay Coordinate Math

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| normalizeCropRect() | Pixel rect → [0,1] normalized | test_normalizeCropRect_fullImage_returns1x1 |
| normalizeCropRect() | Partial crop → correct fractions | test_normalizeCropRect_halfImage_returns0p5 |
| clampCropRect() | Rect cannot exceed image bounds | test_clampCropRect_exceedsBounds_clamped |
| clampCropRect() | Min size enforced (10% of image) | test_clampCropRect_tooSmall_enforcesMinSize |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| useWizard hook | 10 |
| CropOverlay math | 4 |
| **TOTAL** | **14** |

## Visual Verification Checklist (manual)

Run `npm run dev` and verify:

**Step 2:**
- [ ] Auto-rotate fires when portrait image uploaded
- [ ] Crop overlay appears at 90% of image on tool activation
- [ ] Drag corner resizes rect; drag interior moves rect
- [ ] Overlay outside rect is darkened (rgba 0,0,0,0.5)
- [ ] Rotate button increments rotation by 90° each click
- [ ] "Далее" shows spinner while calculateMask is in flight
- [ ] Error message shown if calculateMask fails

**Step 3:**
- [ ] Mask image loads as Fabric.js canvas background
- [ ] Wall tool: click-click draws white line
- [ ] Shift+click snaps to horizontal/vertical
- [ ] Eraser: free draw removes white pixels
- [ ] Brush size slider updates line/eraser width
- [ ] Кабинет: drag rect → popup → label on canvas
- [ ] Delete key removes selected room rect
- [ ] Лестница/Лифт/Коридор: drag rect → colored overlay, no popup
- [ ] Дверь: click-click draws green line
- [ ] "Далее" exports canvas and advances to step 4
