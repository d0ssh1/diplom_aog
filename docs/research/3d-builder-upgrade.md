# Research: 3d-builder-upgrade
date: 2026-03-14

## Summary

The 3D builder pipeline exists end-to-end and produces OBJ + GLB files from binary mask images. The core flow is: mask → contour extraction → wall extrusion via Shapely + trimesh → export. The frontend renders GLB via React Three Fiber with basic OrbitControls. The pipeline is functional but primitive: walls are simple extruded polygons with no interior geometry, fixed floor height, no materials/textures, no ceiling, and no topology awareness between rooms and doors.

The main architectural debt relevant to this feature: `MeshGeneratorService` in `processing/mesh_generator.py` is a service class (not pure functions), violating the `processing/` layer contract. `ReconstructionService.build_mesh()` is a 200-line monolith mixing DB access, file I/O, and business logic. The frontend `MeshViewer.tsx` is minimal (56 lines) with no controls beyond orbit.

Key upgrade opportunities: better wall geometry (interior walls, proper thickness), room-aware mesh (floors per room, door openings), ceiling generation, material/color assignment by room type, frontend viewer improvements (measurements, cross-sections, room labels).

## Architecture — Current State

### Backend Structure

- `backend/app/processing/mesh_builder.py:13` — `build_mesh(contours, image_width, image_height, floor_height=1.5, pixels_per_meter=50.0) -> trimesh.Trimesh` — thin wrapper around `MeshGeneratorService.generate_floor_model()`
- `backend/app/processing/mesh_generator.py:45` — `MeshGeneratorService` class (VIOLATES pure-function rule for `processing/`)
  - `:75` — `contour_to_polygon(contour, scale=1.0) -> Optional[Polygon]` — OpenCV contour → Shapely polygon
  - `:114` — `contours_to_polygons(contours, image_height) -> List[Polygon]` — batch convert with Y-flip
  - `:167` — `create_extruded_wall(polygon, height=None) -> Optional[trimesh.Trimesh]` — extrude 2D polygon to 3D wall via `trimesh.creation.extrude_polygon()`
  - `:202` — `create_floor_mesh(width, depth, z_offset=0.0) -> trimesh.Trimesh` — flat floor plane
  - `:230` — `generate_floor_model(wall_contours, image_width, image_height, floor_number=1, include_floor=True, include_ceiling=False) -> Optional[trimesh.Trimesh]` — full pipeline, applies -90° X rotation
  - `:311` — `export_mesh(mesh, name, formats=['obj', 'glb']) -> MeshExportResult` — exports to OBJ/GLB/STL
  - `:359` — `process_plan_image(mask_image, name, floor_number=1) -> Optional[MeshExportResult]` — end-to-end from mask image
- `backend/app/processing/vectorizer.py:14` — `find_contours(mask, min_area=50) -> List[np.ndarray]` — extracts wall contours from binary mask, pixel coords (NOT normalized)
- `backend/app/services/reconstruction_service.py:54` — `async build_mesh(...)` — 200-line pipeline orchestrator mixing DB, file I/O, and business logic
  - `:96` — calls `ContourService.extract_elements()` for wall extraction
  - `:175` — calls `find_contours()` then `build_mesh()` for 3D
  - `:185-186` — exports OBJ + GLB to `uploads/models/reconstruction_{id}.obj/.glb`
  - `:189-191` — updates DB with mesh file paths and status=3

### Frontend Structure

- `frontend/src/components/MeshViewer.tsx:32` — `MeshViewer({ url, format='obj' })` — React Three Fiber canvas
  - `:16` — loads GLB via `useGLTF()`
  - `:21` — loads OBJ via `OBJLoader`
  - `:46` — `Stage` with "city" environment lighting
  - `:52` — `OrbitControls` only — no measurements, labels, cross-sections
- `frontend/src/pages/ViewMeshPage.tsx:24` — fetches reconstruction by ID, renders `MeshViewer`, shows error if status=4
- `frontend/src/pages/AddReconstructionPage.tsx:80` — 401-line multi-step form (upload → mask → hough → mesh → save)
- `frontend/src/api/apiService.ts:135` — `reconstructionApi.calculateMesh(planFileId, maskFileId)` → POST `/reconstruction/reconstructions`

### Database Models

- `Reconstruction` (`backend/app/db/models/reconstruction.py:31`) — columns: `id`, `name`, `plan_file_id` (FK), `mask_file_id` (FK), `mesh_file_id_obj`, `mesh_file_id_glb`, `status` (1-4), `error_message`, `vectorization_data` (JSON), `created_by`, `created_at`, `updated_at`
- `UploadedFile` (`:14`) — `id` (UUID), `filename`, `file_path`, `url`, `file_type` (1=Plan/2=Mask/3=Env)
- `Room` (`:56`) — `id`, `reconstruction_id` (FK), `number`, `x`, `y`

### Pydantic Domain Models

- `backend/app/models/domain.py:5` — `Point2D(x, y)` — normalized [0,1]
- `:11` — `Wall(id, points: List[Point2D], thickness=0.2)`
- `:26` — `Room(id, name, polygon: List[Point2D], center, room_type, area_normalized)`
- `:36` — `Door(id, position, width, connects: List[str])`
- `:52` — `VectorizationResult` — full output with walls, rooms, doors, text_blocks, metadata; stored as JSON in `vectorization_data` column

### Config

- `backend/app/core/config.py:28` — `UPLOAD_DIR = "uploads"`
- `:34` — `DEFAULT_FLOOR_HEIGHT = 3.0` meters (but `mesh_builder.py` defaults to 1.5 — inconsistency)
- `backend/app/processing/mesh_generator.py:57` — default `wall_thickness=0.2` meters, `pixels_per_meter=50.0`

## Closest Analog Feature

**vectorization-pipeline** — most similar in structure (mask → processing → VectorizationResult → DB storage).

- Files: `processing/vectorizer.py`, `processing/contour_service.py` (ContourService), `services/reconstruction_service.py`, `api/reconstruction.py`, `db/repositories/reconstruction_repo.py`
- Data flow: POST `/reconstruction/reconstructions` → `ReconstructionService.build_mesh()` → ContourService → vectorizer functions → `VectorizationResult` JSON → DB; then `find_contours()` → `MeshGeneratorService` → OBJ/GLB files → DB file paths
- Error handling: exceptions caught in `build_mesh()` at `:193-202`, status set to 4, safe message returned
- Tests: unclear — no test files found for `mesh_generator.py` or `mesh_builder.py` during scan

## Existing Patterns to Reuse

- `trimesh.creation.extrude_polygon()` — found at `mesh_generator.py:167`, already used for wall extrusion
- `contours_to_polygons()` with Y-flip — found at `mesh_generator.py:114`, handles OpenCV→Shapely coordinate transform
- `VectorizationResult` with `walls`, `rooms`, `doors` — found at `domain.py:52`, already contains all geometry needed for room-aware mesh
- `MeshExportResult` — found at `mesh_generator.py` (exact line unclear), wraps OBJ/GLB paths
- `ReconstructionRepository.update_mesh()` — found at `db/repositories/reconstruction_repo.py:81`, updates mesh file IDs + status
- Static file serving pattern — `main.py:27`, `/api/v1/uploads/models/` already served

## Integration Points

- Database: `reconstructions` table — `mesh_file_id_obj`, `mesh_file_id_glb`, `vectorization_data` (JSON). No schema changes needed for basic upgrade; new columns needed for materials/metadata
- File storage: `uploads/models/reconstruction_{id}.obj` and `.glb` — naming convention fixed in `reconstruction_service.py:178-183`
- API: POST `/reconstruction/reconstructions` triggers build; GET `/{id}` returns `CalculateMeshResponse` with `url` pointing to GLB. Frontend uses `url` directly in `MeshViewer`
- Pipeline trigger: `ReconstructionService.build_mesh()` called from `api/reconstruction.py:84` handler `calculate_mesh()`
- Frontend 3D: `MeshViewer.tsx` accepts `url` + `format` props; currently only GLB/OBJ, no material/texture support

## Gaps (what's missing for this feature)

- No tests for `mesh_builder.py` or `mesh_generator.py` — violates testing standards
- `MeshGeneratorService` is a class in `processing/` — should be pure functions per architecture rules
- `DEFAULT_FLOOR_HEIGHT` inconsistency: config says 3.0m, `mesh_builder.py` defaults to 1.5m
- No room-aware mesh: rooms from `VectorizationResult` are not used in 3D generation — only raw contours used
- No door openings in walls — doors detected in vectorization but ignored in 3D build
- No ceiling generation — `include_ceiling=False` default, flag exists but unused in pipeline
- No material/color assignment — all geometry is single-color trimesh
- No interior wall differentiation — all contours treated equally regardless of wall type
- `MeshViewer.tsx` has no room labels, measurements, cross-section, or export controls
- No progress feedback during mesh generation — frontend polls by ID but no WebSocket/SSE
- `calculate_hough_lines` endpoint is a stub (returns empty) — Hough lines not integrated into 3D
- No LOD (level of detail) for large floor plans
- No multi-floor assembly support in 3D builder

## Key Files

- `backend/app/processing/mesh_generator.py` — core 3D generation logic (448 lines, needs refactor to pure functions)
- `backend/app/processing/mesh_builder.py` — entry point for 3D build (52 lines, thin wrapper)
- `backend/app/processing/vectorizer.py` — contour extraction from mask (54 lines)
- `backend/app/services/reconstruction_service.py` — pipeline orchestrator (255 lines, mixes concerns)
- `backend/app/models/domain.py` — `VectorizationResult`, `Wall`, `Room`, `Door` domain models
- `backend/app/core/config.py` — `DEFAULT_FLOOR_HEIGHT`, `UPLOAD_DIR`
- `frontend/src/components/MeshViewer.tsx` — Three.js viewer (56 lines, minimal)
- `frontend/src/pages/ViewMeshPage.tsx` — 3D view page (97 lines)
- `backend/app/api/reconstruction.py` — all reconstruction endpoints (236 lines)
- `backend/app/db/repositories/reconstruction_repo.py` — `update_mesh()`, `update_vectorization_data()`
