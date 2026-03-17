# Phase A4: StepPreprocess + WizardPage Wiring (Step 2)

phase: A4
layer: components/Wizard + pages
depends_on: A1, A2, A3
design: ../README.md

## Goal

Build the Step 2 screen (Preprocessing) and wire it into WizardPage. The step shows
the raw plan photo with CropOverlay and a Rotate button. "Далее" triggers `calculateMask`.

## Context

- Phase A1: `WizardStep` is now `1|2|3|4|5|6`; `useWizard` has `setCropRect`, `setRotation`, `calculateMask`
- Phase A2: `CropOverlay` component ready, accepts `imageRef`, `cropRect`, `onChange`
- Phase A3: `ToolPanelV2` ready, accepts `sections`, `activeTool`, `onToolChange`

## Files to Create

### `frontend/src/components/Wizard/StepPreprocess.tsx`

**Purpose:** Step 2 layout — raw photo on left, tool panel on right.

**Props:**
```typescript
interface StepPreprocessProps {
  planUrl: string;
  cropRect: CropRect | null;
  rotation: 0 | 90 | 180 | 270;
  onCropChange: (rect: CropRect) => void;
  onRotate: () => void;
}
```

**Implementation details:**
- Layout: `display: flex; height: 100%` (same as StepEditMask)
- Left area (~75%): `bg-zinc-200; padding: 32px; position: relative; overflow: hidden`
  - Grid background div (same as StepEditMask.module.css `.gridBg`)
  - `<img>` with `object-fit: contain; max-width: 100%; max-height: 100%` + `transform: rotate(${rotation}deg)`
  - `<CropOverlay>` rendered over image when `activeTool === 'crop'`
  - `imageRef` passed to both `<img>` and `<CropOverlay>`
- Right area: `<ToolPanelV2>` with sections:
  ```typescript
  sections={[{
    title: '// ПРЕПРОЦЕССИНГ',
    tools: [
      { id: 'crop', label: 'Кадрирование', icon: <Crop size={20} /> },
      { id: 'rotate', label: 'Повернуть 90°', icon: <RotateCw size={20} /> },
    ]
  }]}
  ```
- `activeTool` state: `'crop' | 'rotate' | null`, local to this component
- When `rotate` tool clicked: call `onRotate()` immediately (it's an action, not a mode)
- Auto-rotate on mount: `useEffect` checks `img.naturalHeight > img.naturalWidth` AND `rotation === 0` → call `onRotate()` once. Guard is critical: `naturalWidth/Height` are CSS-independent (CSS transform does not change them), so without the `rotation === 0` guard, remounting the component would rotate again.
- Show a simple state-driven notice "Изображение автоматически повёрнуто" when auto-rotate fires

### `frontend/src/components/Wizard/StepPreprocess.module.css`

**Purpose:** Layout styles for step 2. Mirror structure of `StepEditMask.module.css`.

### Files to Modify

### `frontend/src/pages/WizardPage.tsx`

**What changes:**
1. Import `StepPreprocess`
2. Add `case 2:` rendering `<StepPreprocess>` with props from `wizard.state` and `wizard.setCropRect` / `wizard.setRotation`
3. Renumber existing cases: old `case 2` (StepEditMask) → `case 3`, old `case 3` (StepBuild) → `case 4`, old `case 4` (StepView3D) → `case 5`, old `case 5` (StepSave) → `case 6`
4. Update `handleNext` for step 2: call `wizard.calculateMask()` then `wizard.nextStep()` (await, show loading)
5. Update `isNextDisabled`: step 2 disabled when `state.isLoading`
6. Update `totalSteps={5}` → `totalSteps={6}`
7. Remove `StepEditMask` import (it will be deleted in B3)

**Step 2 handleNext logic:**
```typescript
if (state.step === 2) {
  await wizard.calculateMask();
  // calculateMask sets maskFileId; nextStep called inside or after
}
```
Note: `calculateMask` in `useWizard` does NOT call `nextStep` — WizardPage calls it after.
Update `calculateMask` in `useWizard` to return a resolved promise so WizardPage can chain.

### `frontend/src/components/Wizard/StepIndicator.tsx`

**What changes:** If step count is hardcoded (check the file), update to support 6 steps.
The component already receives `totalSteps` as a prop (`WizardShell.tsx:8`), so likely no change needed — verify first.

## Verification
- [ ] `npx tsc --noEmit` passes
- [ ] Step 2 renders raw photo with grid background
- [ ] CropOverlay appears when crop tool active
- [ ] Rotate button rotates image 90° each click
- [ ] Auto-rotate fires for portrait images
- [ ] "Далее" on step 2 shows spinner, then advances to step 3
- [ ] Step indicator shows 6 dots
