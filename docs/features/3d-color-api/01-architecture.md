# Architecture: 3D Color API

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — 3D Color API
Person(user, "User", "Uploads floor plans, generates 3D models with custom colors")
System(system, "Diplom3D", "Floor plan digitizer + 3D builder")
System_Ext(storage, "File Storage", "Stores images and 3D models (GLB/OBJ)")
Rel(user, system, "Specifies wall_color parameter")
Rel(system, storage, "Reads mask, writes colored mesh")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — 3D Color API
Container(frontend, "React App", "TypeScript + Three.js", "Sends wall_color in request")
Container(backend, "FastAPI", "Python 3.12", "REST API + mesh generation")
ContainerDb(db, "SQLite/PostgreSQL", "Database", "Stores reconstruction metadata")
Container(storage, "File Storage", "Disk", "Masks + GLB models")
Rel(frontend, backend, "POST /api/v1/reconstruction/reconstructions + wall_color")
Rel(backend, db, "SQLAlchemy ORM")
Rel(backend, storage, "Read mask, write GLB")
```

## C4 Level 3 — Component

### 3.1 Backend Components

```mermaid
C4Component
title 3D Color API — Backend Components
Component(router, "API Router", "FastAPI", "reconstruction.py — extract wall_color → call service")
Component(service, "ReconstructionService", "Python", "Validates color + orchestrates mesh building")
Component(colorutil, "Color Utilities", "Python", "Parse/validate hex/RGBA colors")
Component(meshbuilder, "Mesh Builder", "Python", "Apply pre-validated color to mesh")
Component(repo, "Repository", "SQLAlchemy", "CRUD for Reconstruction records")
Component(models, "Models", "Pydantic", "CalculateMeshRequest + CalculateMeshResponse")
Rel(router, models, "Validates input/output")
Rel(router, service, "Calls build_mesh(wall_color=...)")
Rel(service, colorutil, "Parses + validates wall_color")
Rel(service, meshbuilder, "Calls build_mesh_from_mask(wall_color=validated_rgba)")
Rel(service, repo, "Saves reconstruction record")
Rel(meshbuilder, storage, "Reads mask, writes GLB")
```

**Key principle:** Service layer validates color, processing layer applies pre-validated color only.

### 3.2 Module Dependency Graph

```mermaid
flowchart BT
router["api/reconstruction.py"] --> service["services/reconstruction_service.py"]
service --> colorutil["processing/color_utils.py"]
service --> meshbuilder["processing/mesh_builder.py"]
service --> repo["db/repositories/reconstruction_repo.py"]
colorutil -.->|NEVER| router
colorutil -.->|NEVER| meshbuilder
meshbuilder -.->|NEVER| colorutil
meshbuilder -.->|NEVER| service
meshbuilder -.->|NEVER| router
```

**Rule:** Dependencies flow inward. `processing/` has ZERO external imports (no FastAPI, no DB, no service layer).

**Validation flow:**
1. API receives `wall_color` parameter
2. Service calls `parse_color()` to validate → gets RGBA array
3. Service passes validated RGBA array to mesh builder
4. Mesh builder applies color (no validation needed)

## Key Design Points

1. **Color parameter is optional** — defaults to `WALL_SIDE_COLOR` if omitted
2. **Color validation happens ONLY in service layer** — not in router, not in processing
3. **Processing layer is pure** — accepts pre-validated RGBA array, no validation, no side effects
4. **GLB export preserves colors** — vertex colors baked into geometry
5. **No DB schema changes** — color is transient (not stored), only used during mesh generation
6. **Separation of concerns:**
   - API layer: thin routing, extract parameters
   - Service layer: validation + orchestration
   - Processing layer: pure functions, apply pre-validated data
