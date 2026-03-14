# Architecture: Vectorization Pipeline

## C4 Level 1 — System Context

WHO interacts with the system and WHAT external systems are involved.

```mermaid
C4Context
title System Context — Vectorization Pipeline
Person(admin, "Administrator", "Uploads floor plan photos, reviews auto-detected rooms")
System(diplom3d, "Diplom3D", "Floor plan digitizer with intelligent vectorization")
System_Ext(storage, "File Storage", "Stores uploaded images, masks, 3D models")
System_Ext(ocr, "Tesseract OCR", "Extracts text from floor plans")

Rel(admin, diplom3d, "Uploads plan photo, confirms auto-crop")
Rel(diplom3d, storage, "Reads/writes images and results")
Rel(diplom3d, ocr, "Detects room numbers via pytesseract")
```

**Context:** Administrator uploads evacuation plan photo → system processes through 8-step pipeline → produces structured VectorizationResult with walls, rooms, doors, text → saves to DB → enables downstream features (floor-editor, 3d-builder, pathfinding).

---

## C4 Level 2 — Container

WHAT services/containers and HOW they communicate.

```mermaid
C4Container
title Container Diagram — Vectorization Pipeline
Person(admin, "Administrator")
Container(frontend, "React App", "TypeScript", "Upload UI + crop selector + result overlay")
Container(backend, "FastAPI", "Python 3.12", "REST API + 8-step processing pipeline")
ContainerDb(db, "SQLite/PostgreSQL", "Stores Reconstruction + VectorizationResult JSON")
Container(storage, "File Storage", "Disk", "uploads/plans/, uploads/masks/, uploads/models/")
System_Ext(tesseract, "Tesseract OCR", "pytesseract")

Rel(admin, frontend, "Uploads plan, confirms crop")
Rel(frontend, backend, "POST /reconstruction/initial-masks, POST /reconstruction/reconstructions")
Rel(backend, db, "SQLAlchemy: save VectorizationResult as JSON")
Rel(backend, storage, "cv2.imread/imwrite")
Rel(backend, tesseract, "pytesseract.image_to_data()")
```

**Key flows:**
1. Upload: Frontend → Backend → Storage (saves plan to uploads/plans/)
2. Vectorization: Backend reads plan → 8-step pipeline → saves VectorizationResult JSON to DB
3. Retrieval: Frontend → Backend → DB (GET /reconstructions/{id}/vectors)

---

## C4 Level 3 — Component

WHAT internal modules handle the feature logic.

### 3.1 Backend Components

```mermaid
C4Component
title Vectorization Pipeline — Backend Components
Component(router, "API Router", "reconstruction.py", "POST /initial-masks, POST /reconstructions, GET/PUT /vectors")
Component(mask_svc, "MaskService", "mask_service.py", "Orchestrates steps 1-6: color filter → crop → binarize → text removal")
Component(recon_svc, "ReconstructionService", "reconstruction_service.py", "Orchestrates steps 7-8: room detection → normalization → save VectorizationResult")
Component(bin_proc, "BinarizationService", "binarization.py", "Adaptive binarization (Otsu/adaptive)")
Component(contour_proc, "ContourService", "contours.py", "Contour extraction + classification")
Component(pipeline_proc, "Pipeline Functions", "pipeline.py", "Pure functions: color_filter, auto_crop, text_detect, room_detect, door_detect")
Component(repo, "ReconstructionRepository", "reconstruction_repo.py", "CRUD for Reconstruction + vectorization_data")
Component(models, "Domain Models", "models/domain.py", "VectorizationResult, Wall, Room, Door, TextBlock")

Rel(router, mask_svc, "calculate_mask(file_id, crop, rotation)")
Rel(router, recon_svc, "build_mesh(plan_file_id, mask_file_id)")
Rel(mask_svc, bin_proc, "binarize_otsu() or apply_adaptive_threshold()")
Rel(mask_svc, pipeline_proc, "color_filter(), auto_crop(), text_detect()")
Rel(recon_svc, contour_proc, "extract_elements()")
Rel(recon_svc, pipeline_proc, "room_detect(), door_detect(), normalize_coords()")
Rel(recon_svc, repo, "update_vectorization_data()")
Rel(router, models, "Validates VectorizationResult")
```

### 3.2 Module Dependency Graph

```mermaid
flowchart BT
router[api/reconstruction.py] --> mask_svc[services/mask_service.py]
router --> recon_svc[services/reconstruction_service.py]
mask_svc --> bin_proc[processing/binarization.py]
mask_svc --> pipeline[processing/pipeline.py]
recon_svc --> contour_proc[processing/contours.py]
recon_svc --> pipeline
recon_svc --> repo[db/repositories/reconstruction_repo.py]
pipeline -.->|NEVER| mask_svc
pipeline -.->|NEVER| router
bin_proc -.->|NEVER| mask_svc
contour_proc -.->|NEVER| recon_svc
```

**Dependency Rules:**
- `processing/` modules are PURE — no imports from `api/`, `services/`, or `db/`
- `services/` orchestrate processing functions and call repositories
- `api/` routers are thin — validate input → call service → return response
- `repositories/` handle all database operations

### 3.3 New Files Created

**Processing Layer (pure functions):**
- `backend/app/processing/pipeline.py` — NEW: color_filter, auto_crop, text_detect, room_detect, door_detect, normalize_coords

**Domain Models:**
- `backend/app/models/domain.py` — MODIFIED: extend VectorizationResult, add Room, Door, TextBlock

**Database:**
- `backend/app/db/models/reconstruction.py` — MODIFIED: add vectorization_data column (Text/JSON)
- `backend/alembic/versions/{timestamp}_add_vectorization_data.py` — NEW: migration

**API:**
- `backend/app/api/reconstruction.py` — MODIFIED: add GET/PUT /reconstructions/{id}/vectors endpoints

**Services:**
- `backend/app/services/mask_service.py` — MODIFIED: integrate BinarizationService + pipeline functions
- `backend/app/services/reconstruction_service.py` — MODIFIED: integrate ContourService + pipeline functions, save VectorizationResult

### 3.4 Modified Files

**Existing services refactored to use new pipeline:**
- `backend/app/services/mask_service.py:28-62` — replace `preprocess_image()` call with BinarizationService + pipeline steps 1-6
- `backend/app/services/reconstruction_service.py:36-107` — replace `find_contours()` call with ContourService + pipeline steps 7-8

**Existing processing classes integrated:**
- `backend/app/processing/binarization.py` — NO CHANGES (already implements Otsu + adaptive)
- `backend/app/processing/contours.py` — NO CHANGES (already implements classification)

---

## Architecture Principles

1. **Pure Processing Layer:** All functions in `processing/pipeline.py` are pure — take np.ndarray, return np.ndarray or domain models. No side effects, no DB, no HTTP.

2. **Service Orchestration:** `MaskService` and `ReconstructionService` orchestrate pipeline steps, handle file I/O, call repositories.

3. **Domain-Driven Design:** `VectorizationResult` is the core domain model — all downstream features depend on its structure.

4. **Backward Compatibility:** Existing API endpoints unchanged. New endpoints added for vector data access.

5. **Testability:** Pure functions tested with synthetic images. Services tested with mocked dependencies. API tested with TestClient.

6. **Separation of Concerns:**
   - `processing/` — image algorithms (OpenCV, numpy)
   - `services/` — business logic (orchestration, validation)
   - `api/` — HTTP layer (request/response)
   - `db/` — persistence (SQLAlchemy)
