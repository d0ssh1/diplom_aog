# Behavior: 3d-builder-upgrade

## Data Flow Diagrams

### DFD: Построение 3D модели (обновлённый pipeline)

```mermaid
flowchart LR
    User([User]) -->|POST /reconstructions| API[API Router]
    API --> Service[ReconstructionService]
    Service -->|load mask| Disk[(File Storage)]
    Service -->|vectorize| Pipeline[processing/pipeline.py]
    Pipeline --> VR[VectorizationResult]
    VR --> Service
    Service -->|build_mesh_from_vectorization| MeshBuilder[processing/mesh_builder.py]
    MeshBuilder --> MeshGen[processing/mesh_generator.py]
    MeshGen -->|trimesh.Trimesh| MeshBuilder
    MeshBuilder --> Service
    Service -->|export GLB/OBJ| Disk
    Service -->|update_mesh + vectorization_data| DB[(Database)]
    DB --> Service
    Service --> API
    API -->|ReconstructionResponse| User
```

### DFD: Просмотр 3D модели с метками

```mermaid
flowchart LR
    User([User]) -->|GET /view/{id}| Page[ViewMeshPage]
    Page --> Hook[useMeshViewer]
    Hook -->|getReconstructionById| API[reconstructionApi]
    API -->|HTTP GET /reconstructions/{id}| Backend[FastAPI]
    Backend -->|CalculateMeshResponse + room_labels| API
    API --> Hook
    Hook -->|url, roomLabels| Page
    Page --> Viewer[MeshViewer Canvas]
    Page --> Labels[RoomLabels overlay]
    Viewer -->|загружает GLB| Storage[(File Storage)]
```

## Sequence Diagrams

### Use Case 1: Построение 3D модели из VectorizationResult

```mermaid
sequenceDiagram
    actor User
    participant Router as api/reconstruction.py
    participant Service as ReconstructionService
    participant MeshBuilder as processing/mesh_builder.py
    participant MeshGen as processing/mesh_generator.py
    participant Repo as ReconstructionRepository
    participant DB as Database
    participant Disk as File Storage

    User->>Router: POST /api/v1/reconstruction/reconstructions
    Router->>Service: await build_mesh(plan_file_id, mask_file_id, user_id)
    Service->>Repo: create_reconstruction(status=2)
    Repo->>DB: INSERT reconstructions
    DB-->>Repo: reconstruction{id}
    Repo-->>Service: reconstruction

    Service->>Disk: glob uploads/masks/{mask_file_id}.*
    Disk-->>Service: mask_path
    Service->>Service: cv2.imread(mask_path, GRAYSCALE)
    Service->>Service: vectorize pipeline → VectorizationResult
    Service->>Repo: update_vectorization_data(id, json)
    Repo->>DB: UPDATE vectorization_data

    Service->>MeshBuilder: build_mesh_from_vectorization(vr, w, h, floor_height=3.0)
    MeshBuilder->>MeshGen: contours_to_polygons(wall_contours, h, pixels_per_meter)
    MeshGen-->>MeshBuilder: List[Polygon]
    MeshBuilder->>MeshGen: extrude_wall(polygon, height) × N
    MeshGen-->>MeshBuilder: List[trimesh.Trimesh]
    MeshBuilder->>MeshGen: build_floor_mesh(room_polygon) × M
    MeshGen-->>MeshBuilder: List[trimesh.Trimesh]
    MeshBuilder->>MeshGen: build_ceiling_mesh(w, h, floor_height)
    MeshGen-->>MeshBuilder: trimesh.Trimesh
    MeshBuilder->>MeshGen: assign_room_colors(meshes, rooms)
    MeshGen-->>MeshBuilder: trimesh.Trimesh (с vertex colors)
    MeshBuilder-->>Service: combined trimesh.Trimesh

    Service->>Disk: mesh.export(obj_path)
    Service->>Disk: mesh.export(glb_path)
    Service->>Repo: update_mesh(id, obj_path, glb_path, status=3)
    Repo->>DB: UPDATE mesh_file_id_obj, mesh_file_id_glb, status
    DB-->>Repo: OK
    Repo-->>Service: reconstruction{status=3}
    Service-->>Router: reconstruction
    Router-->>User: 200 CalculateMeshResponse{url, room_labels}
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-------------|----------|----------|
| Маска не найдена на диске | 200 (async) | status=4, error_message | `FileStorageError` → `update_mesh(status=4)` |
| Контуры не найдены | 200 (async) | status=4, error_message | `ImageProcessingError` → `update_mesh(status=4)` |
| trimesh/shapely не установлены | 200 (async) | status=4, error_message | `ImageProcessingError` → `update_mesh(status=4)` |
| `VectorizationResult` пуст (старая запись) | — | fallback | `build_mesh_from_vectorization` fallback на сырые контуры |

**Edge cases:**
- `rooms` список пуст → пол генерируется как один прямоугольник по размеру изображения
- `doors` список пуст → шаг вырезания проёмов пропускается
- Shapely boolean difference даёт невалидный полигон → `.buffer(0)` fix; при неудаче — стена без проёма
- Координаты комнат нормализованы [0,1] → денормализация `x * w, y * h` перед передачей в processing

### Use Case 2: Просмотр 3D модели с метками комнат

```mermaid
sequenceDiagram
    actor User
    participant Page as ViewMeshPage
    participant Hook as useMeshViewer
    participant API as reconstructionApi
    participant Backend as FastAPI
    participant Viewer as MeshViewer (R3F)
    participant Labels as RoomLabels

    User->>Page: navigate /view/{id}
    Page->>Hook: useMeshViewer(id)
    Hook->>API: reconstructionApi.getReconstructionById(id)
    API->>Backend: GET /api/v1/reconstruction/reconstructions/{id}
    Backend-->>API: CalculateMeshResponse{url, status, room_labels}
    API-->>Hook: meshData
    Hook-->>Page: { url, roomLabels, isLoading: false }
    Page->>Viewer: <MeshViewer url={url} />
    Page->>Labels: <RoomLabels labels={roomLabels} cameraRef={...} />
    Viewer->>Viewer: useGLTF(url) → загружает GLB
    Labels->>Labels: project 3D coords → 2D screen via camera.project()
    Labels-->>User: HTML overlay с именами комнат
    User->>Page: click "Скачать GLB"
    Page-->>User: window.open(url) → браузер скачивает файл
```

**Error cases:**

| Condition | Поведение |
|-----------|-----------|
| status=4 (ошибка построения) | Показать `error_message` вместо Canvas |
| url=null (ещё строится) | Показать спиннер / статус |
| GLB не загружается (404) | `<Suspense fallback>` показывает заглушку |
| `room_labels` пуст | `RoomLabels` не рендерится |
