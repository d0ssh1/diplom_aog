# Architecture: 3d-builder-upgrade

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — 3d-builder-upgrade
Person(user, "User", "Загружает план эвакуации, просматривает 3D модель")
System(system, "Diplom3D", "Оцифровщик планов этажей + 3D строитель")
System_Ext(storage, "File Storage", "Хранит изображения и 3D модели (OBJ/GLB)")
Rel(user, system, "Использует через браузер")
Rel(system, storage, "Читает маски, пишет GLB/OBJ")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — 3d-builder-upgrade
Container(frontend, "React App", "TypeScript + React Three Fiber", "UI + 3D вьюер с метками комнат")
Container(backend, "FastAPI", "Python 3.12", "REST API + pipeline обработки")
ContainerDb(db, "SQLite/PostgreSQL", "Хранит реконструкции, vectorization_data JSON")
Container(storage, "File Storage", "Disk", "uploads/models/*.glb, uploads/models/*.obj")
Rel(frontend, backend, "HTTP/REST — GET /reconstructions/{id}")
Rel(backend, db, "SQLAlchemy async")
Rel(backend, storage, "File I/O — читает маску, пишет GLB")
Rel(frontend, storage, "Загружает GLB напрямую по URL")
```

## C4 Level 3 — Component

### 3.1 Backend Components

```mermaid
C4Component
title 3d-builder-upgrade — Backend Components
Component(router, "api/reconstruction.py", "FastAPI Router", "Тонкий слой: validate → service → return")
Component(service, "services/reconstruction_service.py", "ReconstructionService", "Оркестрирует pipeline: vectorize → build_mesh → export")
Component(mesh_gen, "processing/mesh_generator.py", "Pure functions", "contour_to_polygon, contours_to_polygons, extrude_wall, build_floor_mesh, build_ceiling_mesh, cut_door_opening, assign_room_colors")
Component(mesh_builder, "processing/mesh_builder.py", "build_mesh_from_vectorization()", "Точка входа: VectorizationResult → trimesh.Trimesh")
Component(repo, "db/repositories/reconstruction_repo.py", "ReconstructionRepository", "update_mesh(), update_vectorization_data()")
Component(domain, "models/domain.py", "VectorizationResult", "walls, rooms, doors — уже содержит всю геометрию")
Rel(router, service, "await service.build_mesh(...)")
Rel(service, mesh_builder, "build_mesh_from_vectorization(vr, w, h)")
Rel(mesh_builder, mesh_gen, "вызывает чистые функции")
Rel(service, repo, "await repo.update_mesh(...)")
Rel(service, domain, "читает VectorizationResult из DB")
```

### 3.2 Frontend Components

```mermaid
C4Component
title 3d-builder-upgrade — Frontend Components
Component(page, "pages/ViewMeshPage.tsx", "Page", "Сборка: хук + компонент + overlay")
Component(hook, "hooks/useMeshViewer.ts", "useMeshViewer", "Загрузка данных реконструкции, проекция меток")
Component(viewer, "components/MeshViewer/MeshViewer.tsx", "MeshViewer", "React Three Fiber Canvas + GLB + освещение в стиле карты")
Component(labels, "components/MeshViewer/RoomLabels.tsx", "RoomLabels", "HTML overlay с метками комнат (как в 2GIS)")
Component(controls, "components/MeshViewer/ViewerControls.tsx", "ViewerControls", "Кнопки: сброс камеры, скачать GLB, переключить вид (top/3D)")
Component(api, "api/apiService.ts", "reconstructionApi", "getReconstructionById() — уже существует")
Rel(page, hook, "const { meshData, roomLabels } = useMeshViewer(id)")
Rel(page, viewer, "<MeshViewer url={...} />")
Rel(page, labels, "<RoomLabels labels={roomLabels} />")
Rel(page, controls, "<ViewerControls />")
Rel(hook, api, "reconstructionApi.getReconstructionById(id)")
```

### Визуальный стиль (2GIS/Яндекс Карты)

Цель — читаемая карта, а не серая масса. Ключевые решения:

- **Пол** — светло-бежевый (`#f5f0e8`), матовый материал `MeshLambertMaterial`
- **Стены** — тёмно-серые (`#4a4a4a`), чуть выше пола → визуальный контраст
- **Комнаты** — цветные полы по типу (classroom=жёлтый, corridor=синий и т.д.)
- **Освещение** — `AmbientLight` (мягкий общий) + `DirectionalLight` сверху-сбоку (тени дают глубину)
- **Фон сцены** — светло-серый (`#e8e8e8`), как подложка карты
- **Вид по умолчанию** — сверху под углом ~60° (изометрия), как в 2GIS при открытии здания
- **Переключатель** — кнопка "Сверху" (ортографическая камера) / "3D" (перспективная)

## Module Dependency Graph

```mermaid
flowchart BT
    router["api/reconstruction.py"] --> service["services/reconstruction_service.py"]
    service --> mesh_builder["processing/mesh_builder.py"]
    mesh_builder --> mesh_gen["processing/mesh_generator.py"]
    service --> repo["db/repositories/reconstruction_repo.py"]
    mesh_gen -.->|"NEVER"| service
    mesh_gen -.->|"NEVER"| router
    mesh_gen -.->|"NEVER"| repo
```

**Правило:** `processing/` не импортирует из `api/`, `services/`, `db/`.
`mesh_generator.py` — только `numpy`, `shapely`, `trimesh`.

## Что меняется vs текущее состояние

| Компонент | Сейчас | После апгрейда |
|-----------|--------|----------------|
| `mesh_generator.py` | Класс `MeshGeneratorService` с состоянием (`_mesh_id`, `output_dir`) | Чистые функции: `contour_to_polygon()`, `extrude_wall()`, `build_floor_mesh()`, `build_ceiling_mesh()`, `assign_room_colors()` |
| `mesh_builder.py` | `build_mesh(contours, w, h)` — игнорирует VectorizationResult | `build_mesh_from_vectorization(vr, w, h)` — использует walls/rooms/doors |
| `reconstruction_service.py:175` | `find_contours(mask)` → `build_mesh(contours, w, h)` | `build_mesh_from_vectorization(vectorization_result, w, h)` |
| `MeshViewer.tsx` | 56 строк, только OrbitControls | + `RoomLabels` overlay, кнопка скачать GLB |
| `ViewMeshPage.tsx` | Прямой `useEffect` + `useState` | Логика вынесена в `useMeshViewer` hook |
| Высота этажа | 1.5 м (баг в `mesh_builder.py:17`) | 3.0 м из `settings.DEFAULT_FLOOR_HEIGHT` |
