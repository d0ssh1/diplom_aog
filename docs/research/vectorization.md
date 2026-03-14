# Research: Vectorization Pipeline

_Date: 2026-03-11_

---

## Actual vs Planned Structure

The codebase diverges from `prompts/architecture.md`. There is **no `services/` directory**. Business
logic lives inside `processing/`. Naming conventions also differ from the plan.

---

## What Exists

### Backend — Processing Layer

#### `backend/app/processing/mask_service.py`
- Class: `MaskService` — **COMPLETE, PRODUCTION-USED**
- `calculate_mask(file_id, crop, rotation)` → saves PNG to `uploads/masks/`
- Pipeline: load → rotate → crop → grayscale → GaussianBlur → THRESH_BINARY_INV+OTSU → MORPH_CLOSE → connectedComponents noise filter
- Note: re-implements binarization inline; does NOT use `BinarizationService`

#### `backend/app/processing/binarization.py`
- Class: `BinarizationService` — **COMPLETE but UNUSED by main pipeline**
- Methods: `load_image`, `to_grayscale`, `binarize_otsu`, `apply_adaptive_threshold`, `apply_morphology`, `invert_if_needed`, `process`
- Richer API than `MaskService` (supports adaptive threshold, configurable morphology iterations)
- Currently only usable as standalone script

#### `backend/app/processing/contours.py`
- Class: `ContourService` — **COMPLETE but UNUSED by main pipeline**
- `StructuralElement` dataclass: `{id, element_type, contour, area, perimeter, center, bounding_box, vertices, aspect_ratio}`
- `element_type` values: `wall`, `room`, `door`, `stairs`, `unknown`, `noise`
- `extract_elements(binary_image)` → Douglas-Peucker approximation, geometric classification
- `classify_element()` — heuristic: aspect ratio for walls, area+solidity+vertices for rooms, area for doors
- `draw_contours()`, `get_wall_contours()` — visualization helpers
- NOT wired into `mesh_generator.py` or `reconstruction_service.py`

#### `backend/app/processing/mesh_generator.py`
- Class: `MeshGeneratorService` — **COMPLETE, PRODUCTION-USED**
- Dependencies: `trimesh`, `shapely`
- `process_plan_image(mask_image, name, floor_number)` — full pipeline: `cv2.findContours(RETR_EXTERNAL)` → Shapely Polygon → `trimesh.creation.extrude_polygon` → OBJ + GLB export
- Does its **own** contour extraction (doesn't use `ContourService`)
- `contours_to_polygons()` — flips Y coordinate for 3D space
- `generate_floor_model()` — adds optional floor mesh (`trimesh.creation.box`), applies -90° X rotation
- `export_mesh()` — exports to OBJ and GLB by default
- `MeshExportResult` dataclass: `{mesh_id, obj_path, glb_path, stl_path, vertices_count, faces_count}`

#### `backend/app/processing/reconstruction_service.py`
- Class: `ReconstructionService` — **COMPLETE, PRODUCTION-USED**
- **ARCHITECTURE VIOLATION**: calls `async_session_maker()` (DB) from `processing/` — violates pure function rule
- `build_mesh(plan_file_id, mask_file_id, user_id)` — creates DB record, calls `_generate_mesh_sync`, updates status
- Status codes: 1=CREATED, 2=PROCESSING, 3=DONE, 4=ERROR
- Singleton: `reconstruction_service = ReconstructionService()` at module level

#### `backend/app/processing/navigation.py` — **PARTIAL (A* complete, graph construction missing)**
- `GraphNode` dataclass: `{id, room_number, x, y, floor}`
- `GraphEdge` dataclass: `{from_id, to_id, weight}`
- `NavigationGraphService.a_star()` (line 87) — **A* algorithm COMPLETE**
- `NavigationGraphService.find_route()` (line 151) — converts room numbers → node IDs → A* → `RouteResponse`
- **MISSING**: no graph builder — needs room/door data from `floor-editor`

---

### Backend — API Layer

#### `backend/app/api/reconstruction.py` — **MOSTLY COMPLETE**
- `POST /reconstruction/initial-masks` → calls `MaskService.calculate_mask()` — **WORKING**
- `POST /reconstruction/houghs` → **STUB** — returns placeholder, no implementation (line 94)
- `POST /reconstruction/reconstructions` → calls `reconstruction_service.build_mesh()` — **WORKING**
- `GET /reconstruction/reconstructions` → list saved — **WORKING**
- `GET /reconstruction/reconstructions/{id}` → poll status — **WORKING**
- `PUT /reconstruction/reconstructions/{id}/save` → save with name — **WORKING**
- `PATCH /reconstruction/reconstructions/{id}` → **TODO stub** (line 288)
- `DELETE /reconstruction/reconstructions/{id}` → **TODO stub** (line 299)
- `GET/PUT /reconstruction/reconstructions/{id}/rooms` → **TODO stubs** (lines 313, 327)

**Bug**: `ReconstructionListItem` response model (`models/reconstruction.py:100`) has only `{id, name}` but router at line 185 tries to append `mesh_url` and `created_at` — type mismatch.

#### `backend/app/api/upload.py` — referenced but not read
#### `backend/app/api/navigation.py` — navigation feature, separate

---

### Backend — Models

#### `backend/app/models/reconstruction.py` — **COMPLETE**
- `UploadPhotoResponse`, `CropRect`, `CalculateMaskRequest/Response`
- `CalculateHoughRequest/Response`, `CalculateMeshRequest/Response`
- `SaveReconstructionRequest`, `ReconstructionListItem` (only `{id, name}`)
- `PatchReconstructionRequest`, `RoomsRequest`, `RoomData` (pattern: `^[A-Za-z]\d{3}[A-Za-z]?$`)
- `RouteRequest`, `RoutePoint`, `RouteResponse`
- **MISSING**: No `Wall`, `Room`, `FloorPlan`, `VectorizationResult`, `Point2D` domain models

#### `backend/app/models/building.py` — exists, not read

---

### Backend — DB Layer

#### `backend/app/db/models/reconstruction.py` — exists (ORM model with `plan_file_id`, `mask_file_id`, `status`, `mesh_file_id_obj`, `mesh_file_id_glb`, `name`, `error_message`, `created_by`, `created_at`)
#### `backend/app/db/models/building.py`, `user.py` — exist

---

### Backend — Core

#### `backend/app/core/config.py`
- `Settings`: `UPLOAD_DIR="uploads"`, `DEFAULT_FLOOR_HEIGHT=3.0`, `MIN_IMAGE_RESOLUTION=1000`
- `CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173"]`
- **In dev**: `.env` configures `DATABASE_URL=sqlite+aiosqlite:///./diplom3d.db` (not PostgreSQL)
- **MISSING**: No `ImageProcessingError`, no `core/exceptions.py`

---

### Frontend

#### `frontend/src/api/apiService.ts` — **COMPLETE**
- Single axios instance with JWT interceptor, 401/403 → redirect `/login`
- `uploadApi`: `uploadPlanPhoto`, `uploadUserMask`
- `reconstructionApi`: `calculateMask(fileId, crop?, rotation?)`, `calculateHough`, `calculateMesh`, `getReconstructionById`, `getReconstructions`, `saveReconstruction`, `deleteReconstruction`, `saveRooms`
- `navigationApi`: `buildRoute(startPoint, endPoint)`
- **Violation**: `authApi.register(data: any)` — line 58 uses `any`

#### `frontend/src/components/MaskEditor.tsx` — **COMPLETE (with caveats)**
- `fabric.js` canvas: draw (white) / erase (black) brush with adjustable size
- Plan shown as semi-transparent background (`<img opacity=0.5>`)
- Exports PNG blob via `canvas.toDataURL`
- **Issue**: plan image `loadImage` handler for non-mask images does nothing (lines 44-49 have dead code with comments)

#### `frontend/src/components/MeshViewer.tsx` — **COMPLETE**
- `@react-three/fiber`, `@react-three/drei`, `three-stdlib`
- Supports `glb` (useGLTF) and `obj` (OBJLoader)
- **Violation**: `let scene: any` — line 13 uses `any`

#### `frontend/src/components/CropSelector.tsx` — exists (not read, used in AddReconstructionPage)

#### `frontend/src/pages/AddReconstructionPage.tsx` — **COMPLETE**
- Full 5-step workflow: upload → mask (auto+manual) → hough → mesh → save
- Crop selector + rotate (90° steps) support
- `generateCroppedImage()`, `generateRotatedImage()` — client-side canvas transforms

#### `frontend/src/pages/ViewMeshPage.tsx` — exists, uses `MeshViewer`
#### `frontend/src/pages/ReconstructionsListPage.tsx` — exists

---

## What's Missing

### Critical Gaps

1. **Hough transform service** — `POST /reconstruction/houghs` is a stub (line 94 `reconstruction.py`). No `HoughService` implementation anywhere.

2. **`ContourService` not wired** — rich wall/room/door/stairs classifier exists in `contours.py` but is bypassed. `mesh_generator.py` does raw `cv2.findContours(RETR_EXTERNAL)` without classification.

3. **`BinarizationService` not wired** — `binarization.py` is a richer standalone service but `MaskService` reimplements binarization inline.

4. **Zero tests** — no `backend/tests/` directory found. Violates architecture rule.

5. **No `services/` layer** — `reconstruction_service.py` lives in `processing/` and calls DB directly. Architecture violation.

6. **`ImageProcessingError`** — not defined anywhere. No `core/exceptions.py`.

7. **Room number storage** — `PUT /reconstruction/reconstructions/{id}/rooms` is a stub. Rooms not persisted.

8. **`PATCH`/`DELETE` reconstructions** — both are stubs (lines 288, 299).

### Installed but Unused
- `pytesseract` — in `requirements.txt` but no text removal step implemented
- `networkx`, `scipy` — installed for graph ops, but `NavigationGraphService` uses manual A*
- `zustand` — in `package.json` (line 21) but zero stores created

### Domain Models Not Implemented
- `Wall`, `Room`, `FloorPlan`, `VectorizationResult`, `Point2D` — mentioned in `prompts/architecture.md` but absent from codebase.

### Frontend Gaps
- No `frontend/src/types/` directory — TypeScript interfaces for domain entities missing.
- No `frontend/src/hooks/` — logic lives directly in page components.
- `any` types in `MeshViewer.tsx:13` and `apiService.ts:58`.
- `MaskEditor.tsx` non-mask image branch is dead code.

### Pipeline Gaps vs Spec
- Text removal step — not implemented (step 2 in `prompts/pipeline.md`).
- `VectorizationResult` dataclass not used — pipeline goes mask → raw contours → Shapely → trimesh, skipping normalized `[0,1]` coordinate step.
- No `scale_factor` (pixels→meters) calibration exposed.
- No `tmp/` debug output for intermediate results.
- `print()` throughout processing code instead of `logging`.

---

## Existing Pipeline Summary

```
Image Upload (multipart)
    → MaskService.calculate_mask()      [binarization.py: UNUSED]
         Otsu + morphology + CC filter
         → saves PNG to uploads/masks/
    → [Manual edit in MaskEditor.tsx + re-upload]
    → [Hough: STUB, no-op]
    → ReconstructionService.build_mesh()
         → MeshGeneratorService.process_plan_image()
              cv2.findContours(RETR_EXTERNAL)   [contours.py: UNUSED]
              → Shapely polygon + Y-flip
              → trimesh.extrude_polygon()
              → exports OBJ + GLB
         → DB record: Reconstruction
    → MeshViewer.tsx renders GLB via @react-three/fiber
```

---

## File:Line Reference Index

| Symbol | File | Line |
|--------|------|------|
| `MaskService.calculate_mask` | `processing/mask_service.py` | 24 |
| `BinarizationService.process` | `processing/binarization.py` | 194 |
| `ContourService.extract_elements` | `processing/contours.py` | 189 |
| `ContourService.classify_element` | `processing/contours.py` | 141 |
| `MeshGeneratorService.process_plan_image` | `processing/mesh_generator.py` | 356 |
| `MeshGeneratorService.generate_floor_model` | `processing/mesh_generator.py` | 227 |
| `ReconstructionService.build_mesh` | `processing/reconstruction_service.py` | 34 |
| `POST /reconstruction/houghs` stub | `api/reconstruction.py` | 80 |
| `PATCH reconstruction` stub | `api/reconstruction.py` | 278 |
| `DELETE reconstruction` stub | `api/reconstruction.py` | 291 |
| `PUT rooms` stub | `api/reconstruction.py` | 317 |
| `CalculateMaskRequest` | `models/reconstruction.py` | 32 |
| `ReconstructionListItem` (bug: missing fields) | `models/reconstruction.py` | 100 |
| `Settings.DEFAULT_FLOOR_HEIGHT` | `core/config.py` | 34 |
| `MaskEditor` fabric.js | `frontend/components/MaskEditor.tsx` | 10 |
| `MeshViewer` any-type violation | `frontend/components/MeshViewer.tsx` | 13 |
| `reconstructionApi.calculateMask` | `frontend/api/apiService.ts` | 110 |
| `AddReconstructionPage` workflow | `frontend/pages/AddReconstructionPage.tsx` | 80 |
