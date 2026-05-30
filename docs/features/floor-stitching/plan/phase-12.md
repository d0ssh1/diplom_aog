# Phase 12: Section-local control points UI (UC1)

phase: 12
layer: frontend/src/components, frontend/src/hooks, frontend/src/pages
depends_on: 11
design: ../07-ui-reference.md; ../01-architecture.md §3.2–3.3; ../02-behavior.md §UC1

## Goal

Let the operator place named control points on a section at upload time, on the
shared canvas widget. This is the per-section pass of the "Редактор точек" screen.

## Files to Create

### `frontend/src/components/ControlPointCanvas.tsx` (+ `.module.css`)
The single shared canvas widget (reused by section + master passes, AC1/AC2).
Props (typed, no `any`):
```ts
interface ControlPointCanvasProps {
  imageUrl: string;                 // backdrop (photo / mask / inverted)
  points: { id: string; x: number; y: number }[];   // normalised [0,1]
  activeId: string | null;
  snapTargets?: [number, number][]; // wall vertices (normalised) for R_SNAP
  opacity?: number;                 // overlay cross-fade (0..1)
  onPlace(id: string, x: number, y: number): void;   // click → place/move active
  onSelect(id: string): void;       // click within R_HIT selects
}
```
Behaviour (06 §7 radii): devicePixelRatio-aware; orange crosshair markers with ID
labels; click within `R_HIT_PX` (display px → image px via display scale) selects
instead of adds; snap to nearest `snapTargets` within `R_SNAP_PX`. Canvas-interaction
core (coord mapping, snap, hit-test) is the shared module reused in Phase 13.

## Files to Modify

### `frontend/src/types/wizard.ts` (MUST edit — not just the hook)
- Widen `WizardStep = 1|2|3|4|5` → `1|2|3|4|5|6` (inserting one step).
- Add to `WizardState`: `controlPoints: ControlPoint[]` and `nextControlPointId: number`.

### `frontend/src/hooks/useWizard.ts`
Add control-point state + actions, AND fix the hardcoded step numbers (the new step
shifts everything after it by one):
- `initialState`: add `controlPoints: []`, `nextControlPointId: 1`.
- `addControlPoint(x,y)` → id `cp-{nextControlPointId}`, then increment the counter
  (monotonic, **never** recycles after delete — counter, not `length`).
- `moveControlPoint(id,x,y)`, `deleteControlPoint(id)` (id not reissued).
- **Renumber the magic step constants** (the new CP step is the new `3`, so
  WallEditor→4, NavGraph→5, View3D→6): `nextStep` clamp `Math.min(s.step+1, 5)` →
  `6`; `buildNavGraph` sets `step: 4` → `step: 5`; `buildMesh` sets `step: 5` →
  `step: 6`.
- **Deferred persistence (resolves the id-ordering problem):** there is NO
  `reconstructionId` until `buildMesh` runs (it's `null` in `initialState`, set only
  inside `buildMesh`). So control points placed at the new step CANNOT be saved
  immediately. Hold them in `state.controlPoints` (mirrors how `rooms`/`doors` are
  held and flushed at build), and persist them via
  `floorAssemblyApi.saveReconstructionControlPoints(reconstructionId, controlPoints)`
  **right after `buildMesh` obtains the `reconstructionId`** (read the current
  `controlPoints` inside that flow). Do NOT add a `saveControlPoints()` that fires at
  the CP step, and do NOT "load existing on enter" — the upload wizard is a
  fresh-creation flow with no pre-existing reconstruction to load from. (Editing an
  existing reconstruction's section-local points is out of scope for this wizard.)

### `frontend/src/components/Wizard/StepControlPoints.tsx` (+ css)
New wizard step inserted between `StepPreprocess` (the binarization step, `case 2`)
and `StepWallEditor` (`case 3`) in `WizardPage`'s numeric `switch` — mirror
`StepWallEditor.tsx`. Hosts
`ControlPointCanvas` + view toggle (Фото / Маска / Инвертированная маска) + opacity
slider + status counter "Опорные точки: N/10" (gate ≥3, cap 20; the `/10` is a soft
display target — see 07-ui-reference §2.5). "Далее" enabled at ≥3.

### `frontend/src/pages/WizardPage.tsx`
The mask is binarized by `calculateMask()` on the step-2→3 transition, so it exists
when the new step renders. Insert `StepControlPoints` as the new `case 3` and shift
the rest. **Every spot that hardcodes a step number must change** (the switch is not
the only place):
- `renderStep` switch: new `case 3` → `StepControlPoints`; old `case 3` WallEditor →
  `4`, `case 4` NavGraph → `5`, `case 5` View3D → `6`.
- `handleNext` branches (currently keyed `state.step === 1..5`): `1` upload→next;
  `2` `calculateMask`+next; **new `3`** → just `nextStep()` (gated ≥3, see below);
  `4` (was 3) `saveMaskAndAnnotations`+`buildNavGraph`; `5` (was 4) `buildMesh`;
  `6` (was 5) `save`.
- `nextLabel`: `'> ПОСТРОИТЬ ГРАФ'` moves to `step===4`, `'> ПОСТРОИТЬ 3D'` to
  `step===5`, `'СОХРАНИТЬ И ВЫЙТИ'` to `step===6`.
- `handlePrev`: the "вернуться на шаг 2 / потеряете стены" confirm moves to
  `step===4` (the WallEditor step).
- `isNextDisabled`: add `(state.step === 3 && state.controlPoints.length < 3)`.
- `WizardShell`: `totalSteps={5}` → `6`; `hideFooter={state.step === 5}` → `6`.

> **Do NOT renumber `EditPlanPage.tsx`.** It is a *separate* wizard with its own local
> `step` state and `step === 1/2/3` logic; it imports only `RoomAnnotation` /
> `DoorAnnotation` / `CropRect` from `types/wizard.ts`, NOT `WizardStep`. Widening
> `WizardStep` to `…|6` cannot break it. Leave it untouched — "helpfully" renumbering
> it would introduce a regression.

## Business rules
- Ids monotonic, never reused (AC1).
- Coords stored normalised [0,1].
- No `any`; presentational component, logic in the hook.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` clean.
- [ ] Manual (dev server): place 3 points on a section, snap to a wall corner;
      delete cp-2, add new → gets cp-4 (no reuse, monotonic counter).
- [ ] "Далее" disabled at <3 points, enabled at 3.
- [ ] After completing the wizard (build creates the reconstruction), the points are
      persisted: `GET /reconstruction/reconstructions/{id}/control-points` returns the
      3 points in section-local [0,1] — confirming deferred-save fired post-build.
