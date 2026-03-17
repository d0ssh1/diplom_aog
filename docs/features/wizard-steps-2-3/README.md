# Wizard Steps 2-3: Preprocessing + Wall Editor — Design

date: 2026-03-17
status: draft
ticket: tickets/04-tooluse.md

## Business Context

The wizard currently has 5 steps. Step 2 jumps directly from file upload to a combined
mask editor (StepEditMask), which mixes two distinct user tasks: preparing the raw photo
(crop/rotate) and correcting the vectorized mask (draw walls, erase artifacts, label rooms).

Splitting these into two dedicated steps gives users a clearer mental model:
- Step 2 (Preprocessing): "Clean up the photo before AI processes it"
- Step 3 (Wall Editor): "Correct what the AI produced"

This also enables the `calculateMask` API call to happen at the right moment — between
steps 2 and 3 — with crop and rotation parameters already set.

## Acceptance Criteria

1. Wizard has 6 steps; StepIndicator shows 6 dots
2. Step 2 shows raw photo with CropOverlay (drag corners + move) and Rotate button
3. Pressing "Далее" on step 2 calls `calculateMask(planFileId, cropRect, rotation)`, shows spinner, then advances to step 3
4. Step 3 shows vectorized mask in Fabric.js canvas with Wall / Eraser tools and brush size slider
5. Step 3 has Markup section: Кабинет (with room number popup), Лестница, Лифт, Коридор, Дверь
6. Wall tool: click-click draws straight white line; Shift snaps to 0°/90°
7. Eraser tool: free-draw with black color
8. Кабинет: drag rect → popup → label rendered on canvas; data in `rooms[]`
9. Pressing "Далее" on step 3 exports canvas PNG, uploads it, passes `rooms[]` and `doors[]` to step 4
10. Old StepEditMask and ToolPanel are removed; replaced by new components
11. `npx tsc --noEmit` passes with 0 errors

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| plan/ | Code | Phase-by-phase implementation plan |
