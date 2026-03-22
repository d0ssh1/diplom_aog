# Behavior: 3D Builder Redesign

## Data Flow

```mermaid
flowchart LR
  Mask["Binary Mask\n(uint8, white=walls)"] --> Builder["build_mesh_from_mask()"]
  Builder --> Walls["Wall meshes\nWALL_SIDE_COLOR #4A4A4A"]
  Builder --> Caps["Cap meshes\nWALL_CAP_COLOR #FF4500"]
  Builder --> Floor["Floor mesh\nFLOOR_COLOR #B8B5AD"]
  Walls & Caps & Floor --> Combine["trimesh.concatenate()"]
  Combine --> Rotate["Z-up → Y-up\n(-90° X rotation)"]
  Rotate --> GLB["GLB export\n(vertex colors embedded)"]
  GLB --> Frontend["MeshViewer.tsx\nuseGLTF(url)"]
  Frontend --> Scene["Three.js Scene\nvertexColors: true\nMeshStandardMaterial"]
```

## Sequence: Mesh Build + Render

```mermaid
sequenceDiagram
  actor User
  participant API as reconstruction.py
  participant Svc as reconstruction_service.py
  participant Builder as mesh_builder.py
  participant Gen as mesh_generator.py
  participant Storage as uploads/models/

  User->>API: POST /reconstruction/reconstructions
  API->>Svc: build_mesh(plan_id, mask_id)
  Svc->>Builder: build_mesh_from_mask(mask, floor_height, ppm)
  Builder->>Gen: extrude_wall(poly, height) × N
  Gen-->>Builder: wall_mesh (trimesh.Trimesh)
  Note over Builder: assign WALL_SIDE_COLOR to wall vertices
  Builder->>Builder: _create_wall_cap(poly, height) × N
  Note over Builder: assign WALL_CAP_COLOR to cap vertices
  Builder->>Builder: _create_floor(w_m, h_m)
  Note over Builder: assign FLOOR_COLOR to floor vertices
  Builder->>Builder: concatenate(walls + caps + floor)
  Builder->>Builder: apply_transform(-90° X)
  Builder-->>Svc: combined trimesh.Trimesh
  Svc->>Storage: mesh.export(glb_path)
  Svc-->>API: reconstruction record
  API-->>User: { url: "/api/v1/uploads/models/{id}.glb" }

  User->>Frontend: открывает ViewMeshPage / StepView3D
  Frontend->>Storage: useGLTF(url) — загружает GLB
  Storage-->>Frontend: scene (THREE.Object3D с vertex colors)
  Note over Frontend: applyMapMaterials() — НЕ удаляет vertex colors,\nустанавливает vertexColors: true
  Frontend->>Frontend: рендер с новым освещением
```

## Vertex Colors: как данные проходят через систему

| Этап | Что происходит |
|------|---------------|
| `mesh_generator.py:43` | Определены константы `WALL_SIDE_COLOR`, `WALL_CAP_COLOR`, `FLOOR_COLOR` |
| `mesh_builder.py` (новый цикл) | Каждому мешу присваиваются vertex colors через `visual.vertex_colors` |
| `trimesh.export(glb_path)` | GLB сохраняет vertex colors как атрибут `COLOR_0` в GLTF |
| `useGLTF(url)` | Three.js/GLTFLoader читает `COLOR_0`, создаёт `vertexColors: true` |
| `applyMapMaterials()` (обновлённый) | Устанавливает `vertexColors: true` на материале, НЕ удаляет атрибут |

## Изменения в FloorPlane

Текущий `FloorPlane` (MeshViewer.tsx:55) — отдельный React-компонент, создающий бежевый пол
в Three.js сцене поверх GLB модели. После редизайна пол будет частью GLB меша.

**Решение:** `FloorPlane` компонент остаётся как fallback для OBJ формата, но для GLB
он не нужен (пол уже в меше). Убирать `FloorPlane` из GLB-пути — см. 03-decisions.md.

## Error Cases

| Условие | Поведение |
|---------|-----------|
| `_create_floor()` получает w_m=0 или h_m=0 | Возвращает `None`, floor не добавляется в список |
| `_create_wall_cap()` — невалидный полигон | Возвращает `None`, cap пропускается (как `extrude_wall`) |
| GLB не содержит vertex colors (старые файлы) | `applyMapMaterials` применяет fallback цвет `COLORS.wall` |
| trimesh не установлен | `ImageProcessingError("build_mesh_from_mask", "trimesh not installed")` |
