# Architecture: Massive Stitching / Transition Points

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — Massive Stitching / Transition Points
Person(user, "User", "Marks transition points and requests multi-plan routes")
System(system, "Diplom3D", "Plan digitizer + reconstruction + route planner")
System_Ext(storage, "File Storage", "Stores uploads, masks, and nav graph JSON")
Rel(user, system, "Uses via browser")
Rel(system, storage, "Reads/writes files")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — Massive Stitching / Transition Points
Container(frontend, "React App", "TypeScript + Three.js", "UI, transition editor, route visualization")
Container(backend, "FastAPI", "Python 3.12", "REST API, services, routing")
ContainerDb(db, "SQLite/PostgreSQL", "Database", "Reconstruction, transition, user data")
Container(storage, "File Storage", "Disk/S3", "Uploads and nav graph JSON")
Rel(frontend, backend, "HTTP/REST")
Rel(backend, db, "SQLAlchemy")
Rel(backend, storage, "File I/O")
```

## C4 Level 3 — Component

### 3.1 Backend Components

```mermaid
C4Component
title Massive Stitching / Transition Points — Backend Components
Component(router, "API Routers", "FastAPI", "Validate input, call services, return responses")
Component(service, "Transition / Navigation Services", "Python", "CRUD, graph assembly, multi-plan routing")
Component(processing, "Processing", "NetworkX + pure helpers", "Load graphs, combine graphs, route search")
Component(repo, "Repositories", "SQLAlchemy", "Persist transitions and reconstructions")
Component(models, "Models", "Pydantic", "API contracts and domain shapes")
Rel(router, service, "Calls")
Rel(service, processing, "Calls")
Rel(service, repo, "Reads/writes")
Rel(router, models, "Validates input/output")
```

### 3.2 Frontend Components

```mermaid
C4Component
title Massive Stitching / Transition Points — Frontend Components
Component(page, "TransitionsPage", "React", "Page shell for floor tree, canvas, and details panel")
Component(hook, "useTransitions", "React hook", "State + API orchestration")
Component(canvas, "TransitionCanvas", "Canvas/SVG", "Render plans and transition markers")
Component(panel, "GroupPanel", "React", "Edit selected point/group")
Component(routePanel, "MultiPlanRoutePanel", "React", "Show route segments and total distance")
Rel(page, hook, "Uses")
Rel(page, canvas, "Renders")
Rel(page, panel, "Renders")
Rel(page, routePanel, "Renders")
Rel(hook, backend, "HTTP API")
```

## Module Dependency Graph

```mermaid
flowchart BT
api[api/] --> service[services/]
service --> repo[db/repositories/]
service --> processing[processing/]
processing -.->|NEVER| api
processing -.->|NEVER| db[(db/)]
frontend_pages[pages/] --> frontend_hooks[hooks/]
frontend_hooks --> frontend_api[api/]
frontend_components[components/] --> frontend_hooks
```

**Rule:** Dependencies flow inward. `processing/` stays free of FastAPI and database imports.

## Current Reality vs Project Standards
- Current backend reality already keeps route composition in `api/` and persistence in repositories for reconstruction and stitching flows (`backend/app/api/reconstruction.py:41-260`, `backend/app/db/repositories/reconstruction_repo.py:18-191`).
- Current navigation routing is split between API stubs and processing helpers (`backend/app/api/navigation.py:12-76`, `backend/app/processing/nav_graph.py:392-519`).
- Current frontend reality uses page-level orchestration and hook-based state management for stitching and mesh viewing (`frontend/src/pages/StitchingPage.tsx:10-148`, `frontend/src/hooks/useStitching.ts:21-219`, `frontend/src/hooks/useMeshViewer.ts:11-47`).
- The new transition feature should follow those existing patterns rather than introducing a different architecture.
