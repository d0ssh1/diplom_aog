# Research: Vectorization Pipeline
date: 2026-03-13

## Summary

The vectorization-pipeline feature aims to integrate existing but unused `BinarizationService` and `ContourService` classes into the current reconstruction pipeline. Currently, the pipeline uses simple functions (`preprocess_image()`, `find_contours()`) that provide basic functionality. The advanced service classes exist in `processing/binarization.py` and `processing/contours.py` but are not called by any service layer code.

**What exists:**
- Full-featured `BinarizationService` with Otsu, adaptive threshold, morphology operations
- Advanced `ContourService` with element classification (wall, room, door, stairs, noise)
- Basic pipeline: `MaskService.calculate_mask()` → `ReconstructionService.build_mesh()`
- File storage structure (`uploads/plans/`, `uploads/masks/`, `uploads/models/`)
- Database schema (`Reconstruction`, `UploadedFile` tables)
- API endpoints (`POST /reconstruction/initial-masks`, `POST /reconstruction/reconstructions`)

**What's missing:**
- Integration of `BinarizationService` into `MaskService`
- Integration of `ContourService` into `ReconstructionService`
- `services/` layer (business logic currently mixed in `processing/` and `api/`)
- `repositories/` layer (direct SQLAlchemy usage everywhere)
- Proper logging (uses `print()` instead of `logging`)
- Tests for `BinarizationService` and `ContourService`

**Architectural debt:**
- `processing/` contains service classes instead of pure functions (violates architecture.md)
- `reconstruction_service.py` mixes DB access, business logic, and file I/O (329 lines)
- `api/reconstruction.py` contains business logic (should be thin layer)
- No dependency injection (uses singleton pattern)

## Architecture — Current State

### Backend Structure (relevant to vectorization-pipeline)

**API Layer:**
- `backend/app/api/reconstruction.py:34` — `POST /reconstruction/initial-masks` → calls `MaskService.calculate_mask()`
- `backend/app/api/reconstruction.py:81` — `POST /reconstruction/reconstructions` → calls `ReconstructionService.build_mesh()`
- `backend/app/api/upload.py:60` — `POST /upload/plan-photo/` → saves plan image to disk

**Service Layer:**
- `backend/app/services/mask_service.py:28-62` — `MaskService.calculate_mask()` → orchestrates preprocessing, calls `preprocess_image()` from `processing/preprocessor.py`
- `backend/app/services/reconstruction_service.py:36-107` — `ReconstructionService.build_mesh()` → full pipeline (DB record → find mask → vectorize → build mesh → export → update DB)

**Processing Layer (PURE FUNCTIONS):**
- `backend/app/processing/preprocessor.py:11-94` — `preprocess_image(image, crop, rotation)` → rotate → crop → grayscale → blur → Otsu → morphology → noise removal
- `backend/app/processing/vectorizer.py:14-53` — `find_contours(binary_mask, min_area=50)` → cv2.findContours + area filter
- `backend/app/processing/mesh_builder.py:13-51` — `build_mesh(contours)` → delegates to MeshGeneratorService

**Processing Layer (SERVICE CLASSES — NOT USED):**
- `backend/app/processing/binarization.py:18-268` — `BinarizationService` class with methods:
  - `binarize_otsu(image)` — Otsu thresholding with GaussianBlur
  - `apply_adaptive_threshold(image)` — adaptive thresholding
  - `apply_morphology(binary, operation, kernel_size)` — closing + opening
  - `invert_if_needed(binary)` — auto-invert based on pixel counts
- `backend/app/processing/contours.py:32-325` — `ContourService` class with methods:
  - `find_contours(binary)` — cv2.findContours wrapper
  - `approximate_contour(contour, epsilon_factor)` — Douglas-Peucker
  - `get_contour_properties(contour)` — area, perimeter, center, bounding_box, aspect_ratio, extent, solidity
  - `classify_element(contour, properties)` — classifies as wall/room/door/stairs/noise
  - `extract_elements(binary)` — full pipeline (find → approximate → classify)

**Repository Layer:**
- `backend/app/db/repositories/reconstruction_repo.py:17-45` — `create_uploaded_file()` — INSERT uploaded files
- `backend/app/db/repositories/reconstruction_repo.py:47-71` — `create_reconstruction()` — INSERT reconstruction with status
- `backend/app/db/repositories/reconstruction_repo.py:81-100` — `update_mesh()` — UPDATE mesh paths and status

**Database Models:**
- `backend/app/db/models/reconstruction.py:14-28` — `UploadedFile` — stores file metadata
- `backend/app/db/models/reconstruction.py:31-52` — `Reconstruction` — stores reconstruction state (plan_file_id, mask_file_id, mesh paths, status, error_message)
- `backend/app/db/models/reconstruction.py:55-66` — `Room` — stores room markers

### Frontend Structure (relevant to vectorization-pipeline)

**API Client:**
- `frontend/src/api/apiService.ts:77-84` — `uploadApi.uploadPlanPhoto()` → POST `/api/v1/upload/plan-photo/`
- `frontend/src/api/apiService.ts:110-125` — `reconstructionApi.calculateMask()` → POST `/api/v1/reconstruction/initial-masks`
- `frontend/src/api/apiService.ts:135-141` — `reconstructionApi.calculateMesh()` → POST `/api/v1/reconstruction/reconstructions`

**Components:**
- `frontend/src/components/MaskEditor.tsx` — canvas-based mask editing
- `frontend/src/components/CropSelector.tsx` — crop rectangle selection
- `frontend/src/components/MeshViewer.tsx` — Three.js 3D viewer

**Pages:**
- `frontend/src/pages/AddReconstructionPage.tsx` — 400 lines, mixes logic and rendering (architectural debt)

## Closest Analog Feature

**Mask Processing Pipeline** — the most similar existing feature.

**Files:**
- API: `backend/app/api/reconstruction.py` (routers)
- Services: `backend/app/services/mask_service.py`, `backend/app/services/reconstruction_service.py`
- Processing: `backend/app/processing/preprocessor.py`, `backend/app/processing/vectorizer.py`, `backend/app/processing/mesh_builder.py`
- Repository: `backend/app/db/repositories/reconstruction_repo.py`
- Models: `backend/app/models/reconstruction.py` (Pydantic), `backend/app/db/models/reconstruction.py` (ORM)

**Data flow:**
1. Frontend uploads plan → `POST /upload/plan-photo/` → saves to `uploads/plans/{uuid}.{ext}` → returns file_id
2. Frontend requests mask → `POST /reconstruction/initial-masks` with `{file_id, crop?, rotation?}` → `MaskService.calculate_mask()` → `preprocess_image()` → saves to `uploads/masks/{uuid}.png` → returns mask file_id
3. Frontend requests mesh → `POST /reconstruction/reconstructions` with `{plan_file_id, mask_file_id}` → `ReconstructionService.build_mesh()` → creates DB record with status=2 → `find_contours()` → `build_mesh()` → exports OBJ/GLB → updates DB with status=3 → returns reconstruction_id

**Error handling:**
- Custom exceptions: `ImageProcessingError(step, message)`, `FileStorageError(file_id, path)`
- Services catch exceptions, update DB status to 4 (error) with error_message
- API routers catch exceptions, return HTTPException 500

**Test approach:**
- Pure functions: simple unit tests with programmatically generated images (`blank_white_image`, `simple_room_image`, `binary_rectangle_mask`)
- Services: AsyncMock for dependencies, test happy path + error cases
- Test files: `tests/api/test_reconstruction.py`, `tests/services/test_mask_service.py`, `tests/processing/test_vectorizer.py`

## Existing Patterns to Reuse

**OpenCV Operations:**
- `backend/app/processing/binarization.py:77-102` — `binarize_otsu()` — Otsu thresholding with GaussianBlur
- `backend/app/processing/binarization.py:104-128` — `apply_adaptive_threshold()` — adaptive thresholding
- `backend/app/processing/binarization.py:130-170` — `apply_morphology()` — closing + opening with kernel
- `backend/app/processing/contours.py:45-73` — `find_contours()` — cv2.findContours wrapper
- `backend/app/processing/contours.py:75-94` — `approximate_contour()` — Douglas-Peucker approximation
- `backend/app/processing/contours.py:96-139` — `get_contour_properties()` — area, perimeter, center, bounding_box, aspect_ratio, extent, solidity
- `backend/app/processing/contours.py:141-187` — `classify_element()` — classifies contours as wall/room/door/stairs/noise

**Pydantic Models:**
- `backend/app/models/reconstruction.py:24-29` — `CropRect` — x, y, width, height (0-1 normalized)
- `backend/app/models/reconstruction.py:32-36` — `CalculateMaskRequest` — file_id, crop, rotation
- `backend/app/models/reconstruction.py:39-45` — `CalculateMaskResponse` — id, url, timestamps

**Utility Functions:**
- `backend/app/services/mask_service.py:20-26` — `_find_file(file_id, subfolder)` — glob pattern matching with FileStorageError
- `backend/app/api/upload.py:23-30` — `validate_file()` — checks extension against ALLOWED_EXTENSIONS
- `backend/app/api/upload.py:33-47` — `save_upload_file()` — generates UUID, saves to disk, returns file_id

**React Components:**
- `frontend/src/components/MaskEditor.tsx` — canvas-based mask editing
- `frontend/src/components/CropSelector.tsx` — crop rectangle selection
- `frontend/src/components/MeshViewer.tsx` — Three.js 3D viewer

## Integration Points

**Database:**
- Tables: `uploaded_files`, `reconstructions` (already exist, no schema changes needed)
- Session management: `async_session_maker` from `backend/app/core/database.py:22`
- Repository pattern: `ReconstructionRepository` takes `AsyncSession` in `__init__`

**File Storage:**
- Base directory: `uploads/` (from `backend/app/core/config.py:28`)
- Subdirectories: `plans/`, `masks/`, `models/`, `contours/`, `processed/`
- Naming: `{uuid}.{ext}` for all files
- Discovery: `glob.glob(os.path.join(upload_dir, subfolder, f"{file_id}.*"))` to find files with any extension

**API Boundaries:**
- Frontend expects: `{id, url, file_type, uploaded_at}` from upload endpoints
- Frontend expects: `{id, status, status_display, url, error_message}` from reconstruction endpoints
- Auth: `Authorization: Bearer {token}` header (added by axios interceptor)

**Processing Pipeline:**
- Current: `MaskService.calculate_mask()` → `preprocess_image()` → save mask
- Current: `ReconstructionService.build_mesh()` → `find_contours()` → `build_mesh()` → export OBJ/GLB
- Unused: `BinarizationService` and `ContourService` (available for integration)
- No tmp/ directory usage (processing happens in-memory)

## Gaps (what's missing for this feature)

**Architecture:**
- No `services/` layer following architecture.md (business logic mixed in `processing/` and `api/`)
- No `repositories/` layer (direct SQLAlchemy usage in services)
- `processing/` contains service classes instead of pure functions (violates architecture.md)
- No dependency injection (uses singleton pattern)

**Integration:**
- `BinarizationService` not called by `MaskService` (exists but unused)
- `ContourService` not called by `ReconstructionService` (exists but unused)
- No bridge between simple functions (`preprocess_image`, `find_contours`) and advanced service classes

**Logging:**
- Uses `print()` instead of `logging` module
- No performance logging (time.perf_counter) as specified in cv_patterns.md

**Testing:**
- No tests for `BinarizationService` (only tests for simple `preprocess_image` function)
- No tests for `ContourService` (only tests for simple `find_contours` function)
- No integration tests for full pipeline

**Frontend:**
- No `hooks/` directory (logic lives in page components)
- No `types/` directory (types defined inline)
- `AddReconstructionPage.tsx` is 400 lines (mixes logic and rendering)

## Key Files

**Backend:**
- `backend/app/processing/binarization.py` — BinarizationService (unused, needs integration)
- `backend/app/processing/contours.py` — ContourService (unused, needs integration)
- `backend/app/services/mask_service.py` — orchestrates preprocessing (needs refactor to use BinarizationService)
- `backend/app/services/reconstruction_service.py` — orchestrates full pipeline (needs refactor to use ContourService)
- `backend/app/api/reconstruction.py` — API endpoints (needs to be thinned, move logic to services)

**Frontend:**
- `frontend/src/pages/AddReconstructionPage.tsx` — main UI (needs refactor to extract hooks)
- `frontend/src/api/apiService.ts` — API client (already well-structured)

**Standards:**
- `prompts/architecture.md` — target architecture (services/ and repositories/ layers)
- `prompts/pipeline.md` — processing pipeline specification
- `prompts/cv_patterns.md` — OpenCV patterns and rules
- `prompts/python_style.md` — naming conventions
