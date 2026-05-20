# Architecture: shift-fix

## C4 Level 1 — System Context
The user uploads a plan image, adjusts crop/rotation, edits the vector mask and room positions, and then builds the reconstruction and navigation outputs. The bug affects how the same plan geometry is positioned across these steps.

```mermaid
C4Context
title System Context — shift-fix
Person(user, "User", "Uploads floor plans, edits rooms, checks emergency-plan output")
System(system, "Diplom3D", "Floor plan digitizer + 3D builder")
System_Ext(storage, "File Storage", "Stores uploaded images, masks, models, and graphs")
Rel(user, system, "Uses via browser")
Rel(system, storage, "Reads/writes files")
```

## C4 Level 2 — Container
The frontend captures crop/rotation and editor actions; the backend processes the image, stores intermediate artifacts, and returns reconstruction/nav data.

```mermaid
C4Container
title Container Diagram — shift-fix
Container(frontend, "React App", "TypeScript + Fabric.js + Three.js", "UI for upload, crop, mask editor, 3D viewer")
Container(backend, "FastAPI", "Python 3.12", "REST API + reconstruction pipeline")
ContainerDb(db, "SQLite/PostgreSQL", "Database")
Container(storage, "File Storage", "Disk/S3", "Images, masks, meshes, graphs")
Rel(frontend, backend, "HTTP/REST")
Rel(backend, db, "SQLAlchemy")
Rel(backend, storage, "File I/O")
```

## C4 Level 3 — Component

### 3.1 Backend Components

```mermaid
C4Component
title shift-fix — Backend Components
Component(upload_router, "Upload Router", "FastAPI", "Validates files and stores uploads")
Component(reconstruction_router, "Reconstruction Router", "FastAPI", "Triggers mask, reconstruction, room, graph flows")
Component(mask_service, "MaskService", "Python", "Loads image, applies crop/rotation, binarizes, removes text, saves mask")
Component(reconstruction_service, "ReconstructionService", "Python", "Loads mask, extracts contours, normalizes coordinates, saves vectorization data")
Component(nav_service, "NavService", "Python", "Builds nav graph and route output from mask")
Component(processing, "Processing Modules", "OpenCV/Numpy", "Preprocess, crop, normalize, detect rooms/doors, route transforms")
Component(repo, "Repository", "SQLAlchemy", "Reads and writes uploaded files and reconstructions")
Rel(upload_router, mask_service, "Calls through API")
Rel(reconstruction_router, reconstruction_service, "Calls through API")
Rel(reconstruction_router, nav_service, "Calls through API")
Rel(mask_service, processing, "Uses")
Rel(reconstruction_service, processing, "Uses")
Rel(nav_service, processing, "Uses")
Rel(reconstruction_service, repo, "Reads/writes")
Rel(upload_router, repo, "Stores upload records")
```

### 3.2 Frontend Components

```mermaid
C4Component
title shift-fix — Frontend Components
Component(wizard_page, "WizardPage", "React", "Assembles upload, crop, editor, nav, and 3D steps")
Component(step_preprocess, "StepPreprocess", "React", "Shows image crop and rotation controls")
Component(step_wall_editor, "StepWallEditor", "React", "Wraps the wall editor canvas and preview updates")
Component(wall_canvas, "WallEditorCanvas", "React + Fabric.js", "Edits mask and room annotations on a canvas")
Component(crop_overlay, "CropOverlay", "React", "Draws and normalizes crop rectangles")
Component(step_nav_graph, "StepNavGraph", "React", "Shows nav graph state")
Component(step_view_3d, "StepView3D", "React + Three.js", "Shows 3D result and route")
Component(use_wizard, "useWizard", "Hook", "Orchestrates upload, crop, mask, graph, mesh, save flow")
Component(api_client, "apiService", "Axios", "Calls backend endpoints")
Rel(wizard_page, use_wizard, "Uses")
Rel(step_preprocess, crop_overlay, "Uses")
Rel(step_wall_editor, wall_canvas, "Uses")
Rel(step_wall_editor, api_client, "Requests mask preview")
Rel(use_wizard, api_client, "Calls")
Rel(step_view_3d, api_client, "Reads route/mesh data")
```

## Module Dependency Graph

```mermaid
flowchart BT
api[api/] --> service[services/]
service --> processing[processing/]
service --> repo[db/repositories/]
frontend[frontend/src/] --> api
processing -.->|NEVER| api
processing -.->|NEVER| frontend
repo -.->|NEVER| processing
```

**Rule:** dependencies flow from UI/API toward service and processing layers. Coordinate transforms must be consistent between the browser canvas, crop parameters, and backend vectorization data.
