# Research: Stitching-Plans (Merging Multiple Floor Plans)
date: 2026-03-22

## Summary

The stitching-plans feature will enable merging multiple floor plan reconstructions into a single unified model. The existing codebase provides a solid foundation with:
- Complete single-plan reconstruction pipeline (upload → preprocess → vectorize → 3D build)
- Coordinate normalization system ([0,1] normalized space)
- VectorizationResult domain model storing walls, rooms, doors
- Fabric.js canvas editing with transformation support
- Multi-step wizard workflow pattern

**Key gaps identified:**
- No multi-plan selection/management UI
- No coordinate transformation functions (affine transforms, clip operations)
- No plan alignment/stitching service
- No merged reconstruction database model
- No canvas-based plan positioning editor

---

## Architecture — Current State

### Backend Structure (relevant to stitching)

**API Layer** — `backend/app/api/reconstruction.py:1-303`
- `POST /reconstruction/reconstructions` — builds 3D mesh from single plan+mask
- `GET /reconstruction/reconstructions` — lists saved reconstructions
- `GET /reconstruction/reconstructions/{id}/vectors` — retrieves VectorizationResult
- `PUT /reconstruction/reconstructions/{id}/vectors` — updates vectorization data
- Pattern: thin router → validate → call service → return response

**Service Layer** — `backend/app/services/reconstruction_service.py:38-361`
- `ReconstructionService.build_mesh()` (line 47-205) — orchestrates full pipeline:
  1. Create DB record (status=2)
  2. Load mask from storage
  3. Extract walls via `extract_elements()`
  4. Detect rooms via `room_detect()`
  5. Detect doors via `door_detect()`
  6. Normalize coordinates to [0,1]
  7. Build 3D mesh
  8. Export OBJ + GLB
  9. Update DB (status=3)
- `get_vectorization_data()` — deserializes JSON from DB
- `update_vectorization_data()` — serializes and saves to DB

**Processing Layer** — `backend/app/processing/pipeline.py:1-953`
- Pure functions (no DB, no HTTP, no side effects)
- `normalize_coords()` (line 880-952) — clamps all coords to [0,1]
- `room_detect()` (line 597+) — returns rooms with normalized polygon coords
- `door_detect()` (line 715+) — returns doors with normalized positions
- `compute_scale_factor()` (line 859-878) — pixels → meters conversion

**Database Models** — `backend/app/db/models/reconstruction.py:31-54`
- `Reconstruction` table:
  - `id` (PK), `name`, `plan_file_id` (FK), `mask_file_id` (FK)
  - `mesh_file_id_obj`, `mesh_file_id_glb`
  - `status` (1=created, 2=processing, 3=done, 4=error)
  - `vectorization_data` (JSON TEXT) — stores VectorizationResult
  - `created_by`, `created_at`, `updated_at`
- `Building` table (building.py:14-24): `id`, `name`, `address`
- `Floor` table (building.py:27-40): `id`, `building_id` (FK), `number`, `reconstruction_id` (FK)

**Domain Models** — `backend/app/models/domain.py:52-75`
- `VectorizationResult`:
  - `walls: List[Wall]` — polylines with normalized [0,1] coords
  - `rooms: List[Room]` — polygons with center, name, type
  - `doors: List[Door]` — positions with width
  - `text_blocks: List[TextBlock]` — OCR results
  - `image_size_original: Tuple[int, int]` — (width, height) before crop
  - `image_size_cropped: Tuple[int, int]` — after crop
  - `crop_rect`, `crop_applied`, `rotation_angle`
  - `wall_thickness_px`, `estimated_pixels_per_meter`
  - `rooms_with_names`, `corridors_count`, `doors_count`

### Frontend Structure (relevant to stitching)

**Wizard Workflow** — `frontend/src/pages/WizardPage.tsx:1-151`
- 6-step wizard: Upload → Preprocess → WallEditor → NavGraph → View3D → Save
- State management via `useWizard()` hook
- Step navigation with validation
- Confirmation dialogs for destructive operations

**Canvas Editor** — `frontend/src/components/Editor/WallEditorCanvas.tsx:1-835`
- Fabric.js canvas for drawing walls and marking rooms
- Coordinate transformation: rotation + crop (line 65-96)
- Room/door annotation storage in refs
- Export: `getBlob()`, `getAnnotations()`, `getCanvasState()`
- Tools: wall, eraser, room, staircase, elevator, corridor, door

**Multi-File Upload** — `frontend/src/hooks/useFileUpload.ts:44-69`
- Parallel upload with `Promise.all()`
- Returns array of `UploadedFile` objects with `id`, `url`, `name`

**Wizard Shell** — `frontend/src/components/Wizard/WizardShell.tsx:1-54`
- Step indicator (dots)
- Navigation buttons (Назад / > Далее)
- Close button
- Footer hide option

**API Client** — `frontend/src/api/apiService.ts:130-235`
- `reconstructionApi.calculateMesh()` — POST /reconstruction/reconstructions
- `reconstructionApi.getReconstructions()` — GET /reconstruction/reconstructions
- `reconstructionApi.saveReconstruction()` — PUT /reconstruction/reconstructions/{id}/save

---

## Closest Analog Feature

**Single-Plan Reconstruction Workflow** — most similar existing feature

### Data Flow:
```
1. Upload plan image
   → POST /upload/plan-photo/ → FileStorage saves file → DB: UploadedFile

2. Crop + rotate
   → MaskService.calculate_mask()
   → Pipeline: normalize → color_filter → crop → binarize → text_detect → text_remove
   → Mask PNG + text blocks JSON saved

3. Edit walls + mark rooms
   → WallEditorCanvas (Fabric.js) draws on mask
   → POST /upload/user-mask/ → FileStorage saves edited mask

4. Build navigation graph
   → POST /reconstruction/nav-graph
   → NavService.build_graph() → JSON saved

5. Build 3D mesh
   → POST /reconstruction/reconstructions
   → ReconstructionService.build_mesh()
   → Exports OBJ + GLB
   → DB: Reconstruction with vectorization_data JSON

6. View 3D model
   → MeshViewer loads GLB via Three.js
   → Route finding via A*

7. Save reconstruction
   → PUT /reconstruction/reconstructions/{id}/save
   → DB: Reconstruction.name updated
```

### Files Involved:
- **Backend API:** `backend/app/api/reconstruction.py`
- **Backend Service:** `backend/app/services/reconstruction_service.py`
- **Backend Processing:** `backend/app/processing/pipeline.py`, `mesh_builder.py`
- **Backend DB:** `backend/app/db/models/reconstruction.py`, `repositories/reconstruction_repo.py`
- **Frontend Pages:** `frontend/src/pages/WizardPage.tsx`
- **Frontend Hooks:** `frontend/src/hooks/useWizard.ts`, `useFileUpload.ts`
- **Frontend Components:** `frontend/src/components/Editor/WallEditorCanvas.tsx`, `Wizard/WizardShell.tsx`

### Error Handling:
- Custom exceptions: `ImageProcessingError`, `FileStorageError`
- HTTP exceptions in routers with safe messages (500 with Russian text)
- Status tracking: 1=created, 2=processing, 3=done, 4=error

### Testing:
- Fixtures: `white_image`, `simple_mask`, `rooms_mask` (backend/tests/processing/conftest.py)
- AAA pattern: Arrange → Act → Assert
- Naming: `test_{function}_{scenario}_{expected}`

---

## Existing Patterns to Reuse

### Image Transformation Functions
- `preprocess_image()` (preprocessor.py:11-80) — rotate + crop + grayscale + binarize
- `normalize_brightness()` (pipeline.py:41-79) — CLAHE normalization
- `directional_morph_close()` (pipeline.py:133-162) — closes gaps in lines

### Coordinate Transformation
- `normalize_coords()` (pipeline.py:880-952) — clamps to [0,1]
- Denormalization formula: `x_px = x_norm * image_width_px`
- Normalization formula: `x_norm = max(0.0, min(1.0, x_px / image_width_px))`

### Canvas Editing (Fabric.js)
- `WallEditorCanvas` (WallEditorCanvas.tsx:1-835) — full-featured canvas editor
- Coordinate transformation on canvas (line 65-96): handles rotation + crop before display
- Annotation storage: `roomsRef`, `doorsRef` (line 53-54)
- Export methods: `getBlob()`, `getAnnotations()`, `getCanvasState()`

### Multi-Step Workflow
- `WizardShell` (WizardShell.tsx:1-54) — step indicator + navigation buttons
- `useWizard()` hook (useWizard.ts:1-177) — state management + API calls
- Confirmation dialogs for destructive operations (WizardPage.tsx:49)

### Multi-File Handling
- `useFileUpload.addFiles()` (useFileUpload.ts:44-69) — parallel upload with `Promise.all()`
- `FileGrid` (FileGrid.tsx:1-42) — grid display of uploaded files

### Mesh Combination
- `build_mesh_from_mask()` (mesh_builder.py:73-234) — builds single mesh from mask
- Uses `trimesh.util.concatenate()` to combine multiple meshes
- Applies transforms via `apply_transform()`

### Database Persistence
- `ReconstructionRepository` (reconstruction_repo.py:14-163) — CRUD operations
- `update_vectorization_data()` (line 148-162) — stores JSON in TEXT column
- Status tracking: 1=created, 2=processing, 3=done, 4=error

---

## Integration Points

### Database
- **Affected tables:** `reconstructions`, `uploaded_files`, `buildings`, `floors`
- **Key fields:**
  - `Reconstruction.vectorization_data` (JSON TEXT) — stores VectorizationResult
  - `Reconstruction.status` (int) — 1=created, 2=processing, 3=done, 4=error
  - `Floor.reconstruction_id` (FK, nullable) — links floor to reconstruction
- **Session management:** `async_session_maker` factory (database.py:22-27)
- **Migrations:** `backend/alembic/versions/` — initial schema exists

### File Storage
- **Directory structure:**
  - `uploads/plans/` — original floor plan images
  - `uploads/masks/` — binary masks
  - `uploads/models/` — 3D mesh exports (OBJ, GLB)
- **File naming:** `{file_id}.{ext}` where file_id is UUID
- **Vector data:** stored as JSON in `Reconstruction.vectorization_data` column
- **FileStorage service:** `backend/app/services/file_storage.py:19-196`
  - `find_file()`, `load_mask()`, `load_text_blocks()`, `save_mesh_files()`

### API Boundaries
- **Existing endpoints:**
  - `POST /reconstruction/reconstructions` — build 3D mesh
  - `GET /reconstruction/reconstructions` — list saved
  - `GET /reconstruction/reconstructions/{id}/vectors` — get vectorization
  - `PUT /reconstruction/reconstructions/{id}/vectors` — update vectorization
- **Frontend API client:** `frontend/src/api/apiService.ts:130-235`
- **Auth:** Bearer token via `Authorization` header

### Processing Pipeline
- **Coordinate system:** all coords normalized to [0,1] after vectorization
- **Image size tracking:** `VectorizationResult.image_size_original`, `image_size_cropped`
- **Scale factor:** `estimated_pixels_per_meter` for 3D mesh generation
- **Pure functions:** no DB, no HTTP, no side effects in `processing/` layer

### Coordinate Systems
- **Normalized [0,1]:** all coordinates after vectorization
- **Pixel space:** during image processing (before normalization)
- **Meter space:** for 3D mesh generation (via pixels_per_meter)
- **Transformation metadata:** stored in VectorizationResult (crop_rect, rotation_angle)

---

## Gaps (what's missing for stitching)

### Backend
1. **No `processing/stitching/` module** — need pure functions for:
   - `build_affine_matrix()` — scale → rotate → translate
   - `apply_affine_to_point()`, `apply_affine_to_polygon()`
   - `clip_walls()`, `clip_rooms()`, `clip_doors()` — Shapely difference operations
   - `merge_models()` — concatenate walls/rooms/doors
   - `normalize_to_bounding_box()` — renormalize to [0,1]
   - `check_duplicate_rooms()` — detect overlapping rooms
   - `stitch_raster_images()` — OpenCV warpAffine + composite

2. **No `services/stitching_service.py`** — need orchestration:
   - Load multiple reconstructions from DB
   - Deserialize vectorization data
   - Apply transformations
   - Merge models
   - Save new reconstruction

3. **No `api/stitching.py` router** — need endpoints:
   - `POST /api/v1/stitching/` — merge plans
   - `GET /api/v1/reconstructions/?status=ready_for_stitching` — list ready plans

4. **No `models/stitching.py`** — need Pydantic models:
   - `StitchingRequest`, `StitchingResponse`
   - `SourcePlanInput`, `TransformInput`, `ClipPolygonInput`

5. **No Shapely dependency** — need for polygon clipping operations

### Frontend
1. **No `pages/StitchingPage.tsx`** — need page with 2 steps:
   - Step 1: Plan selection form (building, floor, plan cards)
   - Step 2: Canvas editor for positioning

2. **No `components/Stitching/` directory** — need components:
   - `PlanSelectionStep.tsx` — form with plan cards
   - `StitchingCanvas.tsx` — Fabric.js canvas for positioning
   - `LayerPanel.tsx` — layer list with z-order controls
   - `ToolPanel.tsx` — tools (move, rotate, crop, polygon clip)
   - `PropertiesPanel.tsx` — X, Y, angle, scale sliders
   - `StitchingSidebar.tsx` — combines panels

3. **No `hooks/useStitching.ts`** — need state management:
   - Load plans, manage layers, API call

4. **No `hooks/useStitchingCanvas.ts`** — need Fabric.js logic:
   - Load plans to canvas, handle transforms, export state

5. **No `hooks/useStitchingHistory.ts`** — need undo/redo:
   - Snapshot stack (max 50), undo/redo operations

6. **No `types/stitching.ts`** — need TypeScript types:
   - `StitchingState`, `LayerData`, `TransformData`, `ClipPolygon`

### Database
1. **No source tracking** — `Reconstruction` table doesn't track:
   - `source_reconstruction_ids` (array) — which plans were merged
   - `is_stitched` (bool) — flag for merged reconstructions

2. **No multi-plan relationship** — no parent-child or many-to-many relationship

---

## Naming Patterns

### Router Files & Endpoints
- File: `/api/{resource}.py` (e.g., `reconstruction.py`, `stitching.py`)
- Endpoint paths: `/reconstruction/reconstructions`, `/stitching/`
- Pattern: `@router.post()`, `@router.get()`, `@router.put()`, `@router.delete()`

### Service Class Names
- `{Resource}Service` (e.g., `ReconstructionService`, `StitchingService`)
- Methods: `async def {action}_{resource}()` or `async def {action}()`

### Processing Function Names
- Pure functions: `{verb}_{noun}()` (e.g., `normalize_coords()`, `clip_walls()`)
- Helpers: `_{verb}_{noun}()` (e.g., `_create_floor()`, `_create_wall_cap()`)

### Test File & Function Names
- File: `test_{module}.py` (e.g., `test_stitching_transform.py`)
- Function: `test_{function}_{scenario}_{expected}()` (e.g., `test_apply_affine_identity_transform_no_change()`)
- Fixtures: `{noun}` (e.g., `simple_mask`, `two_room_model`)

### Component Names
- Page: `{Feature}Page.tsx` (e.g., `StitchingPage.tsx`)
- Component: `{Feature}.tsx` or `{Feature}{Type}.tsx` (e.g., `StitchingCanvas.tsx`, `LayerPanel.tsx`)
- Hook: `use{Feature}.ts` (e.g., `useStitching.ts`, `useStitchingCanvas.ts`)
- Type: `{domain}.ts` (e.g., `stitching.ts`)

### Database Models
- ORM Model: `{Entity}` (e.g., `Reconstruction`, `Building`)
- Repository: `{Entity}Repository` (e.g., `ReconstructionRepository`)
- Table: `{entities}` (e.g., `reconstructions`, `buildings`)

### API Request/Response Models
- Request: `{Action}{Resource}Request` (e.g., `StitchingRequest`)
- Response: `{Action}{Resource}Response` (e.g., `StitchingResponse`)

---

## Key Files

### Backend
- `backend/app/api/reconstruction.py` — reconstruction endpoints
- `backend/app/services/reconstruction_service.py` — reconstruction orchestration
- `backend/app/processing/pipeline.py` — vectorization pipeline
- `backend/app/processing/mesh_builder.py` — 3D mesh generation
- `backend/app/db/models/reconstruction.py` — ORM models
- `backend/app/db/repositories/reconstruction_repo.py` — data access
- `backend/app/models/domain.py` — domain models (VectorizationResult)
- `backend/app/models/reconstruction.py` — API models (Request/Response)
- `backend/app/services/file_storage.py` — file I/O

### Frontend
- `frontend/src/pages/WizardPage.tsx` — wizard orchestrator
- `frontend/src/hooks/useWizard.ts` — wizard state management
- `frontend/src/hooks/useFileUpload.ts` — file upload state
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — Fabric.js canvas editor
- `frontend/src/components/Wizard/WizardShell.tsx` — wizard shell
- `frontend/src/components/Wizard/StepIndicator.tsx` — step progress
- `frontend/src/api/apiService.ts` — API client
- `frontend/src/types/wizard.ts` — TypeScript types

### Tests
- `backend/tests/processing/test_pipeline.py` — pipeline tests
- `backend/tests/services/test_reconstruction_service.py` — service tests
- `backend/tests/api/test_reconstruction_api.py` — API tests

---

## Next Step

`/design_feature stitching-plans fullstack "Merge multiple floor plan reconstructions into a single unified model with canvas-based positioning editor"`
