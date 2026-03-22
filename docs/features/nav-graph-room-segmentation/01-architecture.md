# Architecture: nav-graph-room-segmentation

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — nav-graph-room-segmentation
Person(user, "User", "Запускает построение навигационного графа")
System(system, "Diplom3D", "Обработка планов эвакуации + 3D навигация")
Rel(user, system, "POST /api/v1/nav/build")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — nav-graph-room-segmentation
Container(frontend, "React App", "TypeScript", "UI + 3D viewer")
Container(backend, "FastAPI", "Python 3.12", "REST API + processing")
ContainerDb(storage, "File Storage", "Disk", "Маски стен + nav JSON")
Rel(frontend, backend, "HTTP/REST")
Rel(backend, storage, "File I/O (wall_mask, _nav.json)")
```

## C4 Level 3 — Component

### 3.1 Backend Components

```mermaid
C4Component
title nav-graph-room-segmentation — Backend Components
Component(router, "api/navigation.py", "FastAPI", "Thin router: validate → call service → return")
Component(service, "services/nav_service.py", "Python", "Оркестрация пайплайна: mask → graph → JSON")
Component(nav_graph, "processing/nav_graph.py", "OpenCV", "Чистые функции: extract_corridor_mask, build_skeleton, ...")
Component(pipeline, "processing/pipeline.py", "OpenCV", "compute_wall_thickness — уже вычисляет wall_thickness_px")
Rel(router, service, "await service.build_graph()")
Rel(service, nav_graph, "extract_corridor_mask(wall_mask, rooms, w, h, wall_thickness_px)")
Rel(service, pipeline, "compute_wall_thickness(wall_mask) → wall_thickness_px")
Rel(nav_graph, pipeline, "НЕТ зависимости — pipeline не импортируется из nav_graph")
```

### 3.2 Затронутые файлы

| Файл | Роль | Изменение |
|------|------|-----------|
| `processing/nav_graph.py:15-141` | Алгоритм сегментации | Заменить тело `extract_corridor_mask` |
| `services/nav_service.py:59` | Вызов функции | Передать `wall_thickness_px` в `extract_corridor_mask` |

## Module Dependency Graph

```mermaid
flowchart BT
router[api/navigation.py] --> service[services/nav_service.py]
service --> nav_graph[processing/nav_graph.py]
service --> pipeline[processing/pipeline.py]
nav_graph -.->|NEVER| service
nav_graph -.->|NEVER| pipeline
pipeline -.->|NEVER| nav_graph
```

**Правило:** `processing/nav_graph.py` не импортирует из `pipeline.py`.
`wall_thickness_px` передаётся как параметр через `nav_service.py`.
