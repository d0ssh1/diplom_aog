# Phase 13: Floor Editor assembly steps (UC2–UC5)

phase: 13
layer: frontend/src/components/FloorEditor, frontend/src/hooks, frontend/src/pages
depends_on: 11, 12
design: ../07-ui-reference.md; ../01-architecture.md §3.3; ../02-behavior.md §UC2–UC5; ../05-api-contract.md

## Goal

Add the four assembly steps to the Floor Editor (after `Step5BindPlans`): bind
master control points, solve + review, draw connectors, preview 3D + confirm save.

## Files to Create

### `frontend/src/hooks/useFloorAssembly.ts`
New sibling of `useFloorEditorWizard.ts` (does NOT replace it). Owns assembly state:
- loads `getFloorAssembly(floorId)` once (the single read driving all 4 steps).
- bind: `activeSectionId`, `activePointId`, `saveMasterControlPoints`; master click
  writes to the active id only (no NN match, AC2); re-click same id overwrites.
- solve: `solveTransforms`, holds per-section status/residual/warning + transforms
  for the warped overlay.
- connectors: draft polylines, `replaceConnectors` (atomic).
- preview: `buildFloorMesh` → holds `glb_file_id` + preview url; `confirmFloorMesh`.

### `frontend/src/components/FloorEditor/Step6BindControlPoints.tsx` (+ css)
Dual-panel (section thumbnail ↔ master schema) using `ControlPointCanvas` on both;
per-ID checklist (✓ placed / ○ pending); selecting an ID highlights it on **both**
panels with the same colour (AC2 anti-confusion). Active-point picker in the side panel.

### `frontend/src/components/FloorEditor/Step7SolveTransforms.tsx` (+ css)
"Solve" button → renders per-section status chips (green `ok` / amber warning / red
`needs_points` / red `degenerate`) with residual in metres; overlays each ok-section's
warped outline on the master in its ID colour.
Residual is shown in **metres** = `transform.residual_rms_px / pixels_per_meter`
(both come from the `SolveTransformsResponse`); guard `pixels_per_meter` null/0 →
show "—" rather than NaN/∞.

### `frontend/src/components/FloorEditor/Step8Connectors.tsx` (+ css)
Open-polyline draw tool on the master (click to add vertex, double-click/Enter to
finish, Esc cancel); edit existing (drag vertex, insert/remove, delete line);
rendered as thick bands. Persist via `replaceConnectors`.

### `frontend/src/components/FloorEditor/Step9FloorPreview.tsx` (+ css)
Render `<MeshViewer url={previewGlbUrl} format="glb" />` directly with the **preview**
GLB url from `buildFloorMesh`. Do **NOT** use `useMeshViewer` — that hook fetches a
*reconstruction* by integer id (`reconstructionApi.getReconstructionById`), it cannot
load an arbitrary preview GLB by url/`glb_file_id`. `MeshViewer` already accepts a
`url` + `format` prop (see `components/MeshViewer.tsx`).
shows excluded-sections notice + warnings; "Пересобрать" (rebuild → fresh preview)
and **"Сохранить этаж"** (confirm → `confirmFloorMesh`, persists `mesh_file_glb`).
Three.js objects `dispose()` on unmount.

## Files to Modify

### `frontend/src/hooks/useFloorEditorWizard.ts` (MUST edit — step union + clamp live here)
The Floor Editor caps at 5 steps; extend the hook's pieces to 9:
- `WizardStep` union `1|2|3|4|5` → `1..9`.
- `nextStep` clamp `Math.min(s+1, 5)` → `9`.
- **`resetFloor` hardcodes `setCurrentStep(4)`** (jump back to MarkSections after a
  clear). Steps 6–9 are *appended* after 5 (no insertion), so steps 1–5 keep their
  numbers and `4` stays correct — but verify you are appending, not inserting; if any
  1–5 step shifts, this `4` plus the `goToStep(1)`/`goToStep(3)` calls in
  `FloorEditorPage.tsx` and the `prevStep` guards must all be re-checked.
- Note `loadFor` defaults an already-saved floor to `overview` mode — steps 6–9 only
  apply in `wizard` mode; keep that behaviour (don't force assembly steps for a floor
  that's already built unless the operator re-enters the wizard). The wizard/overview
  gate is keyed on **`sections.length`**, NOT on `mesh_file_glb` — do NOT add a
  `mesh_file_glb`-based gate (a floor with sections but no saved mesh must still land
  in overview, not be forced through assembly).

### `frontend/src/pages/FloorEditorPage.tsx` — `TOTAL_STEPS` lives HERE (CRITICAL)
- `TOTAL_STEPS = 5` is a `const` at the TOP of `FloorEditorPage.tsx` (~line 16),
  **not** in the hook, and it drives the progress-dot loop
  `Array.from({length: TOTAL_STEPS})` (~line 49). Change it to `9` **here**. If you
  only edit the hook, the dots still render 5 and the assembly steps never mount.
- Mount Step6–Step9 as new `case`s after `Step5BindPlans` in the numeric `switch` on
  `wizard.currentStep`; wire the NEW sibling hook `useFloorAssembly` (alongside the
  existing `useFloorEditorWizard`, not replacing it). The assembly steps are only
  meaningful in `wizard` mode.

### `frontend/src/components/MeshViewer.tsx` (MUST edit — it currently leaks)
`GlbModel`/`ObjModel` clone geometry and create a `MeshStandardMaterial` per load in
a `useMemo` but **never dispose them** — `<Canvas>` disposes its own renderer, not
these cloned resources. Add a cleanup `useEffect`(`return () => { geometry.dispose();
material.dispose(); }`) keyed on the loaded object so Step9 (and every other
MeshViewer user) stops leaking GPU memory. Phase 14's dispose test targets THESE
cloned resources, not the fiber renderer.

## Business rules
- Master binding by **active id only** — never nearest-neighbour (AC2).
- Build is preview-only until "Сохранить этаж" (ADR-17); the page must reflect
  `mesh_file_glb` only after confirm.
- `dispose()` all Three.js resources on unmount; no `any`; logic in the hook.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` clean.
- [ ] Manual (dev server, with a seeded floor from Phase 15): bind 3 ids per section
      → solve shows `ok` + residual; a 2-id section shows `needs_points`.
- [ ] Draw two connector lines → they appear as wall bands in the 3D preview.
- [ ] Build → preview renders; floor list still shows no saved mesh; "Сохранить этаж"
      → reload shows the persisted floor GLB.
- [ ] Switching steps / leaving page does not leak WebGL contexts (dispose works).
