# Behavior: Refactor Core

Данный файл описывает поведение системы в целевом состоянии (TO BE).
API-контракт не меняется — меняются только внутренние вызовы между слоями.

---

## DFD: Полный pipeline обработки плана

```mermaid
flowchart LR
    User([User]) -->|POST /upload/plan-photo/| UploadAPI[api/upload.py]
    UploadAPI -->|save_file + repo.create_uploaded_file| Repo[db/repositories/reconstruction_repo]
    UploadAPI -->|write file| Disk[(Disk: uploads/plans/)]
    Repo -->|create_uploaded_file| DB
    Repo -->|INSERT| DB[(Database)]

    User -->|POST /reconstruction/initial-masks| MaskAPI[api/reconstruction.py]
    MaskAPI -->|calculate_mask| MaskSvc[services/mask_service]
    MaskSvc -->|read file| Disk
    MaskSvc -->|preprocess_image| Preprocessor[processing/preprocessor.py]
    Preprocessor -->|binary mask ndarray| MaskSvc
    MaskSvc -->|write mask PNG| Disk
    MaskSvc -->|CalculateMaskResponse| MaskAPI

    User -->|POST /reconstruction/reconstructions| ReconAPI[api/reconstruction.py]
    ReconAPI -->|build_mesh| ReconSvc[services/reconstruction_service]
    ReconSvc -->|create_reconstruction| Repo
    ReconSvc -->|read mask file| Disk
    ReconSvc -->|find_contours| Vectorizer[processing/vectorizer.py]
    ReconSvc -->|build_mesh| MeshBuilder[processing/mesh_builder.py]
    MeshBuilder -->|Trimesh object| ReconSvc
    ReconSvc -->|export glb, obj| Disk
    ReconSvc -->|update_reconstruction| Repo
    ReconSvc -->|CalculateMeshResponse| ReconAPI
```

---

## Sequence Diagrams

### Use Case 1: Upload Plan Photo

```mermaid
sequenceDiagram
    actor User
    participant Router as api/upload.py
    participant Deps as api/deps.py
    participant Repo as db/repositories/reconstruction_repo
    participant DB as Database
    participant Disk as File System

    User->>Router: POST /api/v1/upload/plan-photo/ (multipart)
    Router->>Router: validate_file(file) — check extension
    Router->>Deps: Depends(get_db) + Depends(get_repo)
    Deps-->>Router: ReconstructionRepository(session)
    Router->>Router: file_id = save_upload_file(file, "plans") — запись на диск
    Router->>Repo: await repo.create_uploaded_file(file_id, ...)
    Repo->>DB: INSERT uploaded_files
    DB-->>Repo: UploadedFile
    Repo-->>Router: UploadedFile
    Router-->>User: UploadPhotoResponse
    Router-->>User: 200 JSON {id, url, ...}
```

**Error cases:**

| Condition | HTTP Status | Response | Behaviour |
|-----------|------------|----------|-----------|
| Недопустимый формат файла | 400 | `{"detail": "Недопустимый формат..."}` | Отклонить до записи на диск |
| Недействительный токен | 401 | `{"detail": "Недействительный токен"}` | Отклонить на уровне deps |
| Диск недоступен | 500 | `{"detail": "Ошибка сохранения файла"}` | Логировать через `logging`, вернуть 500 |

---

### Use Case 2: Calculate Mask (Binarization Pipeline)

```mermaid
sequenceDiagram
    actor User
    participant Router as api/reconstruction.py
    participant Deps as api/deps.py
    participant Svc as services/mask_service
    participant Proc as processing/preprocessor.py
    participant Disk as File System

    User->>Router: POST /api/v1/reconstruction/initial-masks
    Router->>Router: validate CalculateMaskRequest
    Router->>Deps: Depends(get_mask_service)
    Deps-->>Router: MaskService(upload_dir)
    Router->>Svc: await svc.calculate_mask(file_id, crop, rotation)
    Svc->>Disk: get_file_path(file_id, "plans")
    Disk-->>Svc: image_path
    Svc->>Disk: cv2.imread(image_path)
    Disk-->>Svc: ndarray (BGR)
    Svc->>Proc: preprocess_image(image, crop, rotation)
    Note over Proc: PURE: rotate → crop →<br/>grayscale → GaussianBlur →<br/>Otsu thresh → morphology →<br/>noise removal (connectedComponents)
    Proc-->>Svc: binary_mask (ndarray, uint8, values 0|255)
    Svc->>Disk: cv2.imwrite(masks/{file_id}.png)
    Disk-->>Svc: OK
    Svc-->>Router: filename ("uuid.png")
    Router-->>User: 200 JSON CalculateMaskResponse
```

**Error cases:**

| Condition | HTTP Status | Response | Behaviour |
|-----------|------------|----------|-----------|
| file_id не найден на диске | 500 | `{"detail": "Ошибка обработки изображения: ..."}` | FileNotFoundError → logging.error → 500 |
| cv2.imread вернул None | 500 | `{"detail": "Ошибка обработки..."}` | ValueError → logging.error → 500 |
| Пустое изображение (0px) | 400 | `{"detail": "..."}` | ImageProcessingError → 400 |

**Edge cases:**
- `rotation=0` — пропустить rotate
- `crop=None` — пропустить crop
- Маска уже существует — перезаписать (idempotent)

---

### Use Case 3: Build 3D Mesh

```mermaid
sequenceDiagram
    actor User
    participant Router as api/reconstruction.py
    participant Deps as api/deps.py
    participant Svc as services/reconstruction_service
    participant Vec as processing/vectorizer.py
    participant Mesh as processing/mesh_builder.py
    participant Repo as db/repositories/reconstruction_repo
    participant DB as Database
    participant Disk as File System

    User->>Router: POST /api/v1/reconstruction/reconstructions
    Router->>Router: validate CalculateMeshRequest
    Router->>Router: decode_token → user_id
    Router->>Deps: Depends(get_reconstruction_service)
    Deps-->>Router: ReconstructionService(repo, output_dir)
    Router->>Svc: await svc.build_mesh(plan_file_id, mask_file_id, user_id)
    Svc->>Repo: await repo.create_reconstruction(plan_file_id, mask_file_id, user_id, status=2)
    Repo->>DB: INSERT reconstructions
    DB-->>Repo: Reconstruction(id=N, status=2)
    Repo-->>Svc: reconstruction_id

    Svc->>Disk: find mask file (masks/{mask_file_id}.*)
    Disk-->>Svc: mask_path
    Svc->>Disk: cv2.imread(mask_path, GRAYSCALE)
    Disk-->>Svc: mask_ndarray

    Svc->>Vec: find_contours(mask_ndarray)
    Note over Vec: PURE: cv2.findContours →<br/>filter by area → list[ndarray]
    Vec-->>Svc: contours

    Svc->>Mesh: build_mesh(contours, image_height, floor_height, pixels_per_meter)
    Note over Mesh: PURE: contours → shapely polygons<br/>→ extrude → trimesh.Trimesh
    Mesh-->>Svc: mesh (trimesh.Trimesh)

    Svc->>Disk: mesh.export("reconstruction_{id}.obj")
    Svc->>Disk: mesh.export("reconstruction_{id}.glb")
    Disk-->>Svc: obj_path, glb_path

    Svc->>Repo: await repo.update_reconstruction(id, obj_path, glb_path, status=3)
    Repo->>DB: UPDATE reconstructions SET status=3, mesh_file_id_glb=...
    DB-->>Repo: OK
    Repo-->>Svc: Reconstruction(status=3)
    Svc-->>Router: Reconstruction ORM object
    Router-->>User: 200 JSON CalculateMeshResponse
```

**Error cases:**

| Condition | HTTP Status | Response | Behaviour |
|-----------|------------|----------|-----------|
| Маска не найдена на диске | 500 | `{"detail": "Ошибка построения 3D модели: ..."}` | Записать status=4 в DB, вернуть 500 |
| Trimesh/Shapely не установлен | 500 | `{"detail": "..."}` | RuntimeError → status=4, 500 |
| Маска пустая (нет контуров) | 500 | `{"detail": "..."}` | Empty mesh → status=4, error_message |
| Недействительный токен | 401 | `{"detail": "..."}` | Отклонить до запуска pipeline |

**Edge cases:**
- Маска с очень маленькими контурами (< MIN_AREA) — отфильтровать в vectorizer
- Маска 0×0 или None → `ImageProcessingError`

---

### Use Case 4: Get / List / Save Reconstruction (тонкий роутер → репозиторий)

```mermaid
sequenceDiagram
    actor User
    participant Router as api/reconstruction.py
    participant Deps as api/deps.py
    participant Svc as services/reconstruction_service
    participant Repo as db/repositories/reconstruction_repo
    participant DB as Database

    User->>Router: GET /api/v1/reconstruction/reconstructions
    Router->>Deps: Depends(get_reconstruction_service)
    Router->>Svc: await svc.get_saved_reconstructions()
    Svc->>Repo: await repo.get_saved(user_id=None)
    Repo->>DB: SELECT * WHERE name IS NOT NULL ORDER BY created_at DESC
    DB-->>Repo: [Reconstruction, ...]
    Repo-->>Svc: list[Reconstruction]
    Svc-->>Router: list[ReconstructionListItem] (маппинг в сервисе)
    Router-->>User: 200 JSON [{id, name, mesh_url, created_at}, ...]

    User->>Router: PUT /api/v1/reconstruction/reconstructions/{id}/save
    Router->>Svc: await svc.save_reconstruction(id, name)
    Svc->>Repo: await repo.get_by_id(id)
    Repo->>DB: SELECT WHERE id=?
    alt Не найдена
        DB-->>Repo: None
        Repo-->>Svc: None
        Svc-->>Router: None
        Router-->>User: 404 {"detail": "Реконструкция не найдена"}
    else Найдена
        DB-->>Repo: Reconstruction
        Svc->>Repo: await repo.update_name(id, name)
        Repo->>DB: UPDATE reconstructions SET name=?
        DB-->>Repo: Reconstruction
        Repo-->>Svc: Reconstruction
        Svc-->>Router: Reconstruction
        Router-->>User: 200 JSON CalculateMeshResponse
    end
```

**Error cases:**

| Endpoint | Condition | Status | Response |
|----------|-----------|--------|----------|
| GET /reconstructions | БД недоступна | 500 | `{"detail": "..."}` |
| PUT /{id}/save | id не существует | 404 | `{"detail": "Реконструкция не найдена"}` |
| GET /{id} | id не существует | 404 | `{"detail": "Реконструкция не найдена"}` |
