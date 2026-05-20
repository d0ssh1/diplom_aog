# Phase 5: Route visualization integration

phase: 5
layer: frontend
depends_on: [phase-03]
design: ../README.md

## Goal
Render multi-plan route results in the mesh viewer with segmented route visualization and route summary UI.

## Context
Phase 3 exposes the backend multi-plan route endpoint. This phase consumes that endpoint in the existing mesh-viewer flow.

## Files to Create

### `frontend/src/components/MeshViewer/MultiPlanRoutePanel.tsx`
**Purpose:** Display route segments, floor labels, and total distance.
**Implementation details:**
- Show one section per segment.
- Keep the panel presentation-only.

## Files to Modify

### `frontend/src/components/MeshViewer/NavigationPath.tsx`
**What changes:** Render multiple route segments instead of only one flattened path.

### `frontend/src/components/MeshViewer/RouteBottomBar.tsx`
**What changes:** Use the new multi-plan route request flow where appropriate.

### `frontend/src/pages/DashboardPage.tsx` or route-test page
**What changes:** Add entry point for multi-plan route testing if required by the UI flow.

## Verification
- [ ] Route visualization renders segmented paths without breaking the single-plan viewer
- [ ] Frontend cleanup remains intact for Three.js resources
- [ ] The route summary reflects the backend segment structure
