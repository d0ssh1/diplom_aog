# Code Plan: Massive Stitching / Transition Points

date: 2026-04-16
design: ../README.md
status: draft

## Phase Strategy
Vertical slice — the feature crosses persistence, routing, API, and frontend, but each user-visible capability is an independent slice. This keeps transition CRUD and multi-plan route wiring aligned and allows validation at each API boundary before the UI lands.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Domain and persistence | models/db | — | ☐ |
| 2 | Transition processing and routing | processing/service | Phase 1 | ☐ |
| 3 | Transition APIs | api | Phase 2 | ☐ |
| 4 | Frontend transition editor | frontend | Phase 3 | ☐ |
| 5 | Route visualization integration | frontend | Phase 3 | ☐ |

## File Map

### New Files
- `backend/app/db/models/transition.py` — ORM models for groups and points
- `backend/app/models/transition.py` — Pydantic request/response contracts
- `backend/app/db/repositories/transition_repo.py` — async persistence layer
- `backend/app/processing/multi_plan_graph.py` — super-graph assembly and route search helpers
- `backend/app/services/transition_service.py` — CRUD and validation orchestration
- `backend/app/api/transitions.py` — transition CRUD endpoints
- `frontend/src/types/transitions.ts` — typed API contracts
- `frontend/src/api/transitionsApi.ts` — transition API client
- `frontend/src/hooks/useTransitions.ts` — state and API orchestration
- `frontend/src/pages/TransitionsPage.tsx` — editor page shell
- `frontend/src/components/Transitions/*` — canvas, tree, panels, dialogs
- `frontend/src/components/MeshViewer/MultiPlanRoutePanel.tsx` — segmented route summary
- `frontend/src/pages/RouteTestPage.tsx` — route test page for multi-plan querying

### Modified Files
- `backend/app/db/models/reconstruction.py` — add `floor_id` relationship support if required by route scoping
- `backend/app/db/models/building.py` — remove stale floor-to-reconstruction coupling if the feature requires canonical floor relations
- `backend/app/services/nav_service.py` — add multi-plan route entrypoint or extend existing route service
- `backend/app/api/navigation.py` — replace stub route endpoint with real multi-plan endpoint
- `backend/app/api/__init__.py` — register the new router
- `backend/app/api/deps.py` — add repo/service dependencies
- `frontend/src/api/apiService.ts` — add or extend API calls for transitions and multi-plan routing
- `frontend/src/App.tsx` — add routes for transitions and route test pages
- `frontend/src/components/Layout/Sidebar.tsx` — add navigation entry for the transitions editor
- `frontend/src/components/MeshViewer/NavigationPath.tsx` — render segmented route output

## Success Criteria
- [ ] All phases completed and verified
- [ ] All tests passing (see ../04-testing.md for full test list)
- [ ] Build clean
- [ ] Lint clean
- [ ] API contract matches implementation (see ../05-api-contract.md)
- [ ] All acceptance criteria from ../README.md met
