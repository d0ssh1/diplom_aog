# Architecture: edit-plan-restore

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — edit-plan-restore
Person(admin, "Administrator", "Opens an existing reconstruction and edits rooms")
System(system, "Diplom3D", "Floor plan digitizer + 3D builder")
System_Ext(browser, "Browser", "Runs the React UI")
Rel(admin, system, "Uses via browser")
Rel(browser, system, "Loads and saves edit-plan state")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — edit-plan-restore
Container(frontend, "React App", "TypeScript", "Loads reconstruction, renders edit-plan, saves annotations")
Container(backend, "FastAPI", "Python 3.12", "Serves reconstruction vectors and persists updates")
ContainerDb(db, "SQLite/PostgreSQL", "Database", "Stores reconstructions and vectorization JSON")
Rel(frontend, backend, "HTTP/REST")
Rel(backend, db, "SQLAlchemy")
```

## C4 Level 3 — Component

### 3.1 Frontend Components

```mermaid
C4Component
title edit-plan-restore — Frontend Components
Component(page, "EditPlanPage", "React", "Loads reconstruction, maps stored vector data, saves edits")
Component(canvas, "WallEditorCanvas", "Fabric.js", "Renders rooms and doors on top of the plan")
Component(shell, "WizardShell", "React", "Navigation frame for edit flow")
Component(api, "reconstructionApi", "Axios client", "Fetches and saves vectorization data")
Rel(page, api, "getReconstructionById / getReconstructionVectors / updateVectorizationData")
Rel(page, canvas, "passes initialRooms / initialDoors")
Rel(canvas, page, "returns current annotations")
Rel(page, shell, "composes step UI")
```

### 3.2 Backend Components

```mermaid
C4Component
title edit-plan-restore — Backend Components
Component(router, "Reconstruction API", "FastAPI", "Returns reconstruction records and vector JSON")
Component(service, "ReconstructionService", "Python", "Loads and stores vectorization data")
Component(repo, "ReconstructionRepository", "SQLAlchemy", "Reads and writes reconstruction rows")
Component(model, "VectorizationResult", "Pydantic", "JSON schema for stored vector data")
Rel(router, service, "calls")
Rel(service, repo, "reads/writes")
Rel(service, model, "serializes/deserializes")
```

## Module Dependency Graph

```mermaid
flowchart BT
page[frontend/pages/EditPlanPage.tsx] --> api[frontend/api/apiService.ts]
page --> canvas[frontend/components/Editor/WallEditorCanvas.tsx]
canvas --> types[frontend/types/wizard.ts]
router[backend/api/reconstruction.py] --> service[backend/services/reconstruction_service.py]
service --> repo[backend/db/repositories/reconstruction_repo.py]
service --> model[backend/models/domain.py]
```

**Dependency rule:** frontend must preserve room geometry in its local edit flow; backend must store and return the exact vector schema without flattening at the API boundary.
