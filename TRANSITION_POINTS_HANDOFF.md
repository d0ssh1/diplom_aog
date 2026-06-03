# Massive Stitching / Transition Points — Handoff for New Session

## Purpose
This document summarizes everything implemented so far for the `massive-stitching-omg` ticket and clearly lists what is still unfinished. It is intended to be read at the start of a new session so work can continue without re-discovery.

## Current Overall Status

### Backend
- Core transition ORM models are implemented.
- Transition repository/service/API are implemented.
- Multi-plan route endpoint exists, but the actual route composition is still a scaffold, not a full super-graph route solver.
- Backend validation currently passes.

### Frontend
- Transition feature types and API client are implemented.
- Transition page shell exists and is wired to real backend data.
- The UI has a working skeleton with selectable floors, selectable groups, a link dialog, point filtering, and a basic point-creation flow.
- The page still does **not** have a full canvas editor for placing/editing points, exact coordinate picking from mouse clicks, or point/group CRUD controls in the UI.

## What Has Been Implemented

### 1) Backend data model and contracts

#### `backend/app/db/models/transition.py`
Implemented:
- `TransitionGroup`
- `TransitionPoint`

Details:
- Group rows represent logical transition containers.
- Point rows belong to exactly one group and one reconstruction.
- `building_id` on the group is nullable.
- Point coordinates are normalized to `[0,1]`.
- Relationships are defined so groups own their points with delete-orphan cascade.

#### `backend/app/models/transition.py`
Implemented Pydantic contracts for:
- transition groups
- transition points
- multi-plan route requests
- multi-plan route responses
- route segments

These include:
- `TransitionGroupCreate`
- `TransitionGroupUpdate`
- `TransitionGroupResponse`
- `TransitionPointCreate`
- `TransitionPointUpdate`
- `TransitionPointResponse`
- `MultiPlanRouteRequest`
- `MultiPlanRouteResponse`
- `RouteSegment`

#### `backend/app/db/models/__init__.py`
Exports transition ORM models.

#### `backend/app/models/__init__.py`
Exports transition Pydantic models.

---

### 2) Backend repository layer

#### `backend/app/db/repositories/transition_repo.py`
Implemented async persistence methods for:
- create/update/delete group
- create/update/delete point
- get group / get point
- list groups by building
- list points by reconstruction
- list points by building

Notes:
- Uses async commit/refresh pattern.
- Eager-loads points where needed.
- Building-scoped point lookup joins through `Reconstruction`.

---

### 3) Backend processing helpers

#### `backend/app/processing/multi_plan_graph.py`
Implemented pure helpers for multi-plan routing scaffolding:
- `snap_to_graph()`
- `build_super_graph()`
- `find_multi_plan_route()`

Plus supporting dataclasses:
- `PlanData`
- `TransitionPointData`
- `GroupData`
- `PlanMetadata`
- `RouteSegmentData`
- `MultiPlanRouteResultData`

Important:
- Module has no DB or HTTP imports.
- Node IDs are prefixed to avoid collisions.
- Route search currently returns structured results and `no_path` when appropriate.
- This is still not a fully wired production-grade multi-plan solver.

---

### 4) Backend service layer

#### `backend/app/services/transition_service.py`
Implemented service orchestration for:
- create/update/delete groups
- create/update/delete points
- list points by reconstruction/building
- route response mapping

Notes:
- Validates reconstruction existence before point creation.
- Validates group existence before point creation.
- Exposes `to_route_response()` for mapping processing output into API response shapes.
- `route_multi()` is still a scaffold and does not yet build a full end-to-end multi-plan route.

#### `backend/app/services/nav_service.py`
Extended to include a multi-plan routing entrypoint that delegates to transition service.

---

### 5) Backend API layer

#### `backend/app/api/transitions.py`
Implemented transition endpoints:
- `POST /transitions/groups`
- `GET /transitions/groups?building_id=...`
- `PATCH /transitions/groups/{group_id}`
- `DELETE /transitions/groups/{group_id}`
- `POST /transitions/points`
- `PATCH /transitions/points/{point_id}`
- `DELETE /transitions/points/{point_id}`
- `GET /transitions/reconstructions/{reconstruction_id}/points`
- `GET /transitions/buildings/{building_id}/points`
- `POST /navigation/route/multi`

#### `backend/app/api/deps.py`
Added dependency factories:
- `get_transition_repo()`
- `get_transition_service()`

#### `backend/app/api/__init__.py`
Registered the new transitions router.

#### `backend/app/api/navigation.py`
Replaced the navigation stub with a real multi-plan route endpoint while keeping the old single-plan route endpoint.

#### `backend/app/api/reconstruction.py`
Made a few supporting changes during the work:
- fixed string coercion for mock `plan_file.url` / `mask_file.url` response fields
- added `GET /reconstruction/buildings/{building_id}/reconstructions`

That building endpoint is important because the frontend transitions page now uses it to build the building-specific editor context.

---

### 6) Frontend contracts and API client

#### `frontend/src/types/transitions.ts`
Implemented frontend TypeScript contracts for:
- transition groups
- transition points
- route requests/responses
- route segments
- transition creation/update payloads

#### `frontend/src/api/transitionsApi.ts`
Implemented API methods for:
- create/list/update/delete transition groups
- create/list/update/delete transition points
- load points by reconstruction/building
- request multi-plan route

#### `frontend/src/api/apiService.ts`
Added a backend helper for building-scoped reconstruction loading:
- `getReconstructionsByBuilding(buildingId)`

This is used by the transitions page to load the real plans for a building.

---

### 7) Frontend page and UI shell

#### `frontend/src/pages/TransitionsPage.tsx`
Implemented a real page shell for transition management.

Current behavior:
- reads `buildingId` from route params
- loads reconstructions for that building
- shows floor list
- shows active reconstruction info
- shows transition groups
- shows transition points filtered by selected group
- opens the link dialog from the canvas area
- submits point creation requests using the currently selected reconstruction/group
- shows route summary panel

#### `frontend/src/pages/TransitionsPage.module.css`
Added layout/styles for the transitions page.

#### `frontend/src/components/Transitions/FloorTree.tsx`
Implemented a clickable floor list.
- Selects the active floor/reconstruction.

#### `frontend/src/components/Transitions/GroupPanel.tsx`
Implemented a clickable transition group list.
- Selects the active transition group.

#### `frontend/src/components/Transitions/TransitionCanvas.tsx`
Implemented a simple clickable canvas placeholder.
- Filters points based on selected group.
- Provides a click target that opens the point-link flow.
- Still does **not** calculate true normalized coordinates from the mouse position.

#### `frontend/src/components/Transitions/LinkPointDialog.tsx`
Implemented a simple dialog shell for linking points.
- Can open/close.
- Accepts point coordinates and label input.
- Calls back with normalized x/y + label so the page can create a transition point.

#### `frontend/src/components/Transitions/TransitionMarker.tsx`
Implemented a small point marker component.

#### `frontend/src/components/MeshViewer/MultiPlanRoutePanel.tsx`
Implemented a simple route summary panel.
- Shows status
- Shows total distance
- Lists segments
- Still displays only the summary; it is not yet a fully polished multi-segment route UI.

#### `frontend/src/components/MeshViewer/NavigationPath.tsx`
Extended to accept segmented route data.
- Still compatible with the old single-path behavior.

#### `frontend/src/components/Layout/Sidebar.tsx`
Replaced the stitching entry with a transitions entry.

#### `frontend/src/App.tsx`
Added transitions routes:
- `/admin/transitions`
- `/admin/transitions/:buildingId`

---

## What the Frontend Can Do Right Now

The transitions page currently can:
- load reconstructions for a building
- show a floor list
- select a floor/reconstruction
- select a transition group
- show points filtered by group
- open a link dialog from the canvas area
- create a transition point with manually entered x/y/label values
- show route summary placeholder data

It cannot yet:
- place points by clicking on a real canvas
- drag points
- edit geometry
- pick exact coordinates visually from the canvas
- edit existing points or delete points/groups from the UI
- build a full route-test flow

---

## What Remains To Be Implemented

### Backend gaps
1. **Real multi-plan route composition**
   - `route_multi()` still needs a full implementation that actually loads the relevant nav graphs and transition points, builds the super-graph, and runs route search end-to-end.

2. **Route segment production**
   - The route response structure exists, but the current route path generation is still not fully connected to real graph data.

3. **Better transition point validation**
   - Current create point validation only checks reconstruction existence and group existence.
   - The expected snap-to-reachable-node validation is not fully enforced yet.

4. **Potential richer backend data for frontend**
   - If the editor needs exact floor/building metadata, additional endpoints may still be needed.

### Frontend gaps
1. **Real canvas editor**
   - Replace the placeholder `TransitionCanvas` with an actual interactive canvas.
   - Add click-to-place point support using real normalized coordinates from the mouse position.
   - Add point selection/move support if needed.

2. **Point editing flow**
   - Update point coordinates and label.
   - Support deleting points.
   - Support deleting groups and cascading the UI state correctly.

3. **Route-test flow**
   - The multi-plan route UI still needs a real test flow based on chosen start/end rooms and reconstructions.

4. **Better building/floor mapping**
   - The current floor list is derived from reconstruction data in a simplified way.
   - If exact floor metadata is required, it should be wired from proper building/floor models.

5. **UI polish**
   - Current components are functional but still basic.
   - They need proper styling and interaction states.

---

## Validation Completed So Far

### Backend
- `python -m pytest -q backend/tests` passes.
- Backend test count observed: `237 passed`.
- `py_compile` checks were also run successfully on the new backend files during implementation.
- During this continuation, no backend code was modified yet.

### Frontend
- `npm --prefix frontend run build` passes.
- Multiple TypeScript build issues were fixed during implementation.
- During this continuation, the transitions page flow was extended so point creation is wired through the dialog and hook.

---

## Important Notes For The Next Session

- The feature is **partially complete**: backend scaffolding is solid, frontend shell exists, but the real editor interaction is not done yet.
- A basic point-creation flow now exists, but it still uses manual x/y inputs and a placeholder clickable area instead of a true canvas.
- The most important missing piece is **creating transition points from a real canvas interaction** and wiring the coordinates from the click position.
- The second most important missing piece is a **real multi-plan route computation** instead of the current scaffold.
- Several changes were made iteratively to keep the app building and tests passing, so the new session should start by reading this file and then continuing from the “What Remains” section.

## Suggested Next Step
Implement the real canvas coordinate flow first:
- let the user choose a group
- choose/select a reconstruction
- click on the canvas to derive normalized coordinates
- call `POST /transitions/points`
- refresh the points list

That will unlock the rest of the editor work.

## Files Changed During This Continuation
- `frontend/src/hooks/useTransitions.ts` — added `createPoint()` and reloaded data after creation
- `frontend/src/pages/TransitionsPage.tsx` — wired link dialog to point creation
- `frontend/src/components/Transitions/LinkPointDialog.tsx` — added x/y/label inputs and async confirm support
- `frontend/src/components/Transitions/TransitionCanvas.tsx` — made the canvas area clickable and connected it to the point-link flow
