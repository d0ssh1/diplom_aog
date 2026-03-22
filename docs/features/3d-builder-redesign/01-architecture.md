# Architecture: 3D Builder Redesign

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — 3D Builder Redesign
Container(frontend, "React App", "TypeScript + Three.js / R3F", "3D viewer")
Container(backend, "FastAPI", "Python 3.12 + trimesh", "Mesh generation")
Container(storage, "File Storage", "uploads/models/", "GLB / OBJ files")
Rel(frontend, backend, "GET /api/v1/uploads/models/{id}.glb")
Rel(backend, storage, "mesh.export(glb_path)")
Rel(frontend, storage, "useGLTF(url) — loads GLB directly")
```

## C4 Level 3 — Backend Components

```mermaid
C4Component
title 3D Builder Redesign — Backend Components
Component(builder, "mesh_builder.py", "processing/", "build_mesh_from_mask() — orchestrates geometry")
Component(generator, "mesh_generator.py", "processing/", "Pure functions: extrude_wall(), color constants")
Component(service, "reconstruction_service.py", "services/", "Calls builder, exports GLB")
Rel(builder, generator, "imports extrude_wall, WALL_COLOR")
Rel(service, builder, "calls build_mesh_from_mask()")
```

**Changes in this feature:**
- `mesh_generator.py` — добавить 3 новые цветовые константы: `WALL_SIDE_COLOR`, `WALL_CAP_COLOR`, `FLOOR_COLOR`
- `mesh_builder.py` — добавить `_create_floor()`, `_create_wall_cap()`, обновить цикл экструзии

## C4 Level 3 — Frontend Components

```mermaid
C4Component
title 3D Builder Redesign — Frontend Components
Component(viewer, "MeshViewer.tsx", "components/", "Canvas + lights + model loaders")
Component(glb, "GlbModel (internal)", "MeshViewer.tsx:125", "useGLTF loader")
Component(obj, "ObjModel (internal)", "MeshViewer.tsx:105", "OBJLoader")
Component(apply, "applyMapMaterials() (internal)", "MeshViewer.tsx:82", "Applies material to meshes")
Component(floor, "FloorPlane (internal)", "MeshViewer.tsx:55", "Beige floor plane in scene")
Rel(viewer, glb, "renders if format=glb")
Rel(viewer, obj, "renders if format=obj")
Rel(glb, apply, "calls on load")
Rel(obj, apply, "calls on load")
```

**Changes in this feature:**
- `applyMapMaterials()` — убрать `deleteAttribute('color')`, использовать `vertexColors: true`
- `COLORS` константы — обновить под новую палитру
- Lighting — снизить ambient, скорректировать directional
- `FloorPlane` — убрать (пол теперь часть GLB меша)

## Module Dependency Graph

```mermaid
flowchart BT
  MeshViewer["MeshViewer.tsx"] -->|"useGLTF(url)"| GLB["GLB file (storage)"]
  service["reconstruction_service.py"] -->|"build_mesh_from_mask()"| builder["mesh_builder.py"]
  builder -->|"extrude_wall(), constants"| generator["mesh_generator.py"]
  builder -->|"mesh.export()"| GLB
```

**Правило:** `mesh_generator.py` — чистые функции, нет импортов из `api/` или `db/`.
`mesh_builder.py` — оркестрирует геометрию, импортирует только из `mesh_generator` и stdlib.
