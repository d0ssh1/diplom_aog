# Phase 4: Frontend transition editor

phase: 4
layer: frontend
depends_on: [phase-03]
design: ../README.md

## Goal
Build the dedicated transition editor page and its supporting frontend types, API client, hook, and UI components.

## Context
Phase 3 exposes the backend endpoints. This phase consumes those endpoints to manage groups and points from the browser.

## Files to Create

### `frontend/src/types/transitions.ts`
**Purpose:** Typed frontend copy of transition request/response contracts.
**Implementation details:**
- Mirror the backend API shapes exactly.
- Keep normalized coordinate types explicit.

### `frontend/src/api/transitionsApi.ts`
**Purpose:** API client for transition CRUD.
**Implementation details:**
- Use the shared axios client.
- Keep request/response types explicit.

### `frontend/src/hooks/useTransitions.ts`
**Purpose:** Page state orchestration for the transition editor.
**Implementation details:**
- Load groups and points for the selected building/floor.
- Call the transition API for CRUD operations.
- Keep component state isolated in the hook.

### `frontend/src/pages/TransitionsPage.tsx`
**Purpose:** Page shell for the transition editor.
**Implementation details:**
- Compose tree, canvas, and details panel components.
- Do not place API logic in the page component.

### `frontend/src/components/Transitions/*`
**Purpose:** Editor UI components.
**Implementation details:**
- Include the plan tree, transition canvas, detail panel, and dialogs.
- Keep each component focused on rendering and user interaction.

## Files to Modify

### `frontend/src/App.tsx`
**What changes:** Add the new route for the transition editor.

### `frontend/src/components/Layout/Sidebar.tsx`
**What changes:** Add navigation entry for the transition editor.

### `frontend/src/api/apiService.ts`
**What changes:** Add any shared navigation helper calls needed by the editor.

## Verification
- [ ] `npm run build` passes for the frontend slice touched by this phase
- [ ] `any` is not introduced in new TypeScript code
- [ ] Component props and API types are explicit
- [ ] The page works with mocked API responses in tests
