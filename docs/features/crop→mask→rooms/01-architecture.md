# Architecture: crop→mask→rooms

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — crop→mask→rooms
Person(admin, "Admin", "Crops plans, edits masks, places rooms and doors")
Person(user, "User", "Views edited floor plans and routes")
System(system, "Diplom3D", "Floor plan digitizer + editor + 3D builder")
System_Ext(storage, "File Storage", "Stores uploaded plans, masks, and mesh files")
Rel(admin, system, "Edits plans via browser")
Rel(user, system, "Consumes rendered plans and routes via browser")
Rel(system, storage, "Reads/writes images and generated files")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — crop→mask→rooms
Container(frontend, "React App", "TypeScript + Fabric.js", "Plan crop UI, mask editor, room/door editor")
Container(backend, "FastAPI", "Python 3.12", "Mask preview, vector persistence, nav graph endpoints")
ContainerDb(db, "SQLite/PostgreSQL", "SQLAlchemy", "Reconstruction and file metadata")
Container(storage, "File Storage", "Disk/S3", "Plan images, mask images, generated meshes")
Rel(frontend, backend, "HTTP/REST")
Rel(backend, db, "SQLAlchemy")
Rel(backend, storage, "File I/O")
Rel(frontend, storage, "Loads mask/plan URLs")
```

## C4 Level 3 — Component

### 3.1 Frontend Components

```mermaid
C4Component
title crop→mask→rooms — Frontend Components
Component(wizardPage, "WizardPage", "React", "Orchestrates step flow and passes crop, mask, rooms, doors")
Component(stepPreprocess, "StepPreprocess", "React", "Collects crop and rotation")
Component(stepWallEditor, "StepWallEditor", "React", "Requests preview mask and mounts editor")
Component(maskEditor, "MaskEditor", "React", "Separate mask drawing/editing surface")
Component(wallCanvas, "WallEditorCanvas", "Fabric.js", "Renders plan background, mask background, rooms, doors")
Component(editPlanPage, "EditPlanPage", "React", "Loads reconstruction data and vector annotations")
Rel(wizardPage, stepPreprocess, "Passes crop/rotation state")
Rel(wizardPage, stepWallEditor, "Passes plan/mask data")
Rel(stepWallEditor, wallCanvas, "Passes preview mask and geometry props")
Rel(editPlanPage, wallCanvas, "Passes loaded reconstruction geometry")
Rel(maskEditor, stepWallEditor, "Produces mask blob")
```

### 3.2 Backend Components

```mermaid
C4Component
title crop→mask→rooms — Backend Components
Component(reconstructionRouter, "Reconstruction Router", "FastAPI", "Mask preview, vector updates, nav graph build")
Component(reconstructionService, "Reconstruction Service", "Python", "Orchestrates mask, vectors, reconstruction state")
Component(navService, "Nav Service", "Python", "Builds graph from rooms and doors")
Component(uploadStorage, "Uploaded File Storage", "ORM + files", "Stores plan/mask file metadata")
Component(reconstructionModel, "Reconstruction Model", "SQLAlchemy", "Persists plan, mask, mesh, vectorization data")
Rel(reconstructionRouter, reconstructionService, "Calls")
Rel(reconstructionRouter, navService, "Calls")
Rel(reconstructionService, uploadStorage, "Reads/writes file references")
Rel(reconstructionService, reconstructionModel, "Persists reconstruction state")
Rel(navService, uploadStorage, "Reads mask file")
```

## Module Dependency Graph

```mermaid
flowchart BT
frontend[frontend/src/] --> api[frontend/src/api/]
frontend --> components[frontend/src/components/]
frontend --> pages[frontend/src/pages/]
router[backend/app/api/] --> service[backend/app/services/ or current service layer]
service --> processing[backend/app/processing/]
service --> db[backend/app/db/]
processing -.->|NEVER| router
processing -.->|NEVER| db
```

## Logical Boundaries

### Frontend
- `frontend/src/components/Editor/WallEditorCanvas.tsx:78-117` builds `displayPlanUrl` from `planUrl`, `planRotation`, and `planCropRect`.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:243-268` loads `maskUrl` as Fabric background and records background dimensions.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:467-493` and `623-678` normalize rooms and doors against background bounds.
- `frontend/src/components/Wizard/StepWallEditor.tsx:93-110` regenerates mask preview when crop or rotation changes.
- `frontend/src/pages/WizardPage.tsx:30-39` and `frontend/src/pages/EditPlanPage.tsx:119-153` persist annotations and call backend APIs.

### Backend
- `backend/app/api/reconstruction.py:254-347` exposes vector data and nav graph endpoints relevant to edited rooms and doors.
- `backend/app/db/models/reconstruction.py:31-57` persists the mask file id and vectorization JSON.
- `backend/app/db/models/reconstruction.py:59-71` stores room markers.

## Required Architectural Direction
The feature needs a single shared geometry basis for all three visual layers:
1. plan preview,
2. mask preview,
3. interactive annotations.

The current codebase uses separate render paths for plan and mask and then derives rooms/doors from the mask canvas bounds. The design target is to make the mask and plan consume the same transform metadata so that annotation normalization uses the same crop/rotation origin as the visible plan.
