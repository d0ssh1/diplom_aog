# Phase A1: Types + useWizard Update

phase: A1
layer: types + hooks
depends_on: none
design: ../README.md

## Goal

Extend the wizard type system to support 6 steps, room/door annotations, and the new
`editedMaskFileId` field. Update `useWizard` to clamp at 6 steps and expose
`saveMaskAndAnnotations`.

## Files to Modify

### `frontend/src/types/wizard.ts`

**What changes:**
- `WizardStep` type: `1 | 2 | 3 | 4 | 5` → `1 | 2 | 3 | 4 | 5 | 6`
- Add `RoomAnnotation` interface
- Add `DoorAnnotation` interface
- Add `editedMaskFileId: string | null` to `WizardState`
- Add `rooms: RoomAnnotation[]` to `WizardState`
- Add `doors: DoorAnnotation[]` to `WizardState`

New types to add:
```typescript
export interface RoomAnnotation {
  id: string;
  name: string;
  room_type: 'room' | 'staircase' | 'elevator' | 'corridor';
  x: number;      // normalized [0,1]
  y: number;
  width: number;
  height: number;
}

export interface DoorAnnotation {
  id: string;
  x1: number; y1: number;  // normalized [0,1]
  x2: number; y2: number;
}
```

### `frontend/src/hooks/useWizard.ts`

**What changes:**
1. `initialState.step` stays 1, but clamp in `nextStep` changes from 5 → 6
2. `prevStep` clamp stays at 1 (no change)
3. Add `rooms: []` and `doors: []` and `editedMaskFileId: null` to `initialState`
4. Add `saveMaskAndAnnotations(blob: Blob, rooms: RoomAnnotation[], doors: DoorAnnotation[])` method:
   - Calls `uploadApi.uploadUserMask(file)` (same as existing `saveMask`)
   - Sets `editedMaskFileId`, `rooms`, `doors` in state
5. Update `UseWizardReturn` interface to include new method and state fields
6. The existing `saveMask` method can be removed (replaced by `saveMaskAndAnnotations`)
7. Import `RoomAnnotation`, `DoorAnnotation` from `../types/wizard`

**Key implementation note:** `nextStep` currently at line 38:
```typescript
setState((s) => ({ ...s, step: Math.min(s.step + 1, 5) as WizardState['step'] }));
```
Change `5` → `6`.

## Verification
- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] `WizardStep` type accepts value `6`
- [ ] `WizardState` has `rooms`, `doors`, `editedMaskFileId` fields
