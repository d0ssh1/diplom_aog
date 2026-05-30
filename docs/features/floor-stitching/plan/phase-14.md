# Phase 14: Frontend tests

phase: 14
layer: frontend/src/__tests__ (vitest + Testing Library)
depends_on: 12, 13
design: ../04-testing.md §Frontend

## Goal

Cover the canvas anti-confusion guarantees and the hook state-machine logic.

## Harness reality (READ FIRST)

`vitest.config.ts` is `environment: 'node'`, `globals: false`, and the project has
**no** `@testing-library/react`, `@testing-library/dom`, `jsdom`, or `happy-dom`.
Every existing test (`useFloorViewer.test.ts`, `roomDisplay.test.ts`) tests **pure
functions** — none renders React or mounts a hook. So `renderHook`/`render` are NOT
available. **Follow the repo convention:** extract the testable logic into pure
functions and unit-test those in the node env. (Adding jsdom + Testing Library to
enable true component-render tests is possible but is a harness change out of scope
for this feature — do NOT silently introduce it.)

## Files to Create / Modify

### Extract pure helpers (so they're testable without rendering)
Pull the canvas math + id logic out of the components/hooks into pure modules, e.g.
`frontend/src/lib/controlPoints.ts`:
- `nextMonotonicId(counter): {id, counter}` — id assignment.
- `snapToTarget(point, targets, rSnapPx, displayScale)` — nearest-within-radius.
- `hitTest(point, points, rHitPx, displayScale)` — select-vs-add decision.
- `colourForId(id)` — deterministic id→colour map (same id ⇒ same colour).
- `writeActivePoint(points, activeId, x, y)` — the master-bind reducer (writes the
  active id only; re-click same id overwrites; never NN-matches).

### Pure-logic tests (vitest, `environment: 'node'`, explicit imports — no globals)
- `controlPoints.test.ts`: `test_add_control_point_assigns_next_monotonic_id`,
  `test_delete_point_does_not_reuse_id`, `test_click_near_vertex_snaps_within_radius`
  (a click 5px from a vertex, within R_SNAP, lands exactly on the vertex),
  `test_click_near_existing_point_selects_not_adds`,
  `test_same_id_same_colour` (colourForId stable across calls — the both-panels
  guarantee reduces to this), `test_master_click_writes_to_active_id_only`,
  `test_reclick_same_id_overwrites`.
- `meshDispose.test.ts`: call the MeshViewer cleanup function with **mocked**
  geometry/material objects (plain objects with a `dispose` spy) and assert `dispose`
  was called — no rendering needed; this validates the Phase-13 MeshViewer cleanup.

Follow `useFloorViewer.test.ts` for the harness style (explicit `import { describe,
it, expect } from 'vitest'`, pure-function assertions).

## Verification
- [ ] `cd frontend && npx vitest run` → all green.
- [ ] `npx tsc --noEmit` clean.
- [ ] Snap test: a click 5px from a vertex (within R_SNAP) lands exactly on the vertex.
- [ ] Anti-confusion: same id is the same colour on section and master panels.
