# Research: Massive Stitching / Transition Points
date: 2026-04-16

## Summary
The current codebase has a completed stitching feature centered on `StitchingService`, `stitching` API endpoints, and a frontend stitching workflow. Stitching combines multiple reconstructions by loading stored vectorization JSON, applying crop/transform/clip operations, merging the models, normalizing coordinates, and saving a new reconstruction.

Navigation currently exists as a single-plan prototype. The backend exposes stub navigation endpoints in `backend/app/api/navigation.py`, while the real route logic lives in `backend/app/processing/nav_graph.py` and `backend/app/processing/navigation.py`. The frontend has route-selection UI in `RouteBottomBar`, plus reconstruction and mesh-viewer flows that already consume navigation and reconstruction APIs.

What is missing for this ticket is a true multi-plan transition model: there are no transition-point ORM models, no transition-group Pydantic models, no multi-plan route endpoint, and no frontend editor for inter-plan transitions. The current storage model still centers on stitching and single-plan routing.

## Architecture — Current State

### Backend Structure (relevant to massive stitching / transition points)
- `backend/app/api/__init__.py:7-22` — includes `reconstruction_router`, `navigation_router`, and `stitching_router` into the main API router.
- `backend/app/api/reconstruction.py:41-260` — reconstruction router with endpoints for mask generation, mesh building, listing reconstructions, saving, patching, and deleting.
- `backend/app/api/navigation.py:12-76` — navigation router with stubbed `POST /route` and `GET /buildings/{building_id}/floors/{floor_id}/graph` endpoints.
- `backend/app/api/stitching.py:15-53` — stitching router with `POST /` calling `StitchingService.stitch_plans()`.
- `backend/app/services/stitching_service.py:72-259` — `StitchingService` loads source reconstructions, deserializes vectorization data, crops/denormalizes/transforms/clips/merges, normalizes output, and saves a new reconstruction.
- `backend/app/processing/nav_graph.py:392-519` — graph serialization/deserialization, route finding with NetworkX A*, and line-of-sight pruning.
- `backend/app/processing/navigation.py:17-240` — `GraphNode`, `GraphEdge`, `NavigationGraphService`, and a standalone A* helper.
- `backend/app/models/reconstruction.py:13-210` — API models for upload, mask, mesh, save, rooms, nav graph, and route operations.
- `backend/app/models/stitching.py:9-70` — API models for stitching request/response and source-plan inputs.
- `backend/app/models/reconstruction_vectors.py:10-34` — vectorization-domain models used for reconstruction/edit-plan flows.
- `backend/app/db/models/reconstruction.py:14-71` — `UploadedFile`, `Reconstruction`, and `Room` ORM models.
- `backend/app/db/repositories/reconstruction_repo.py:18-191` — async repository for uploaded files, reconstructions, and vectorization data.
- `backend/main.py:6-59` — FastAPI app assembly, static uploads mount, CORS, and router registration.

### Frontend Structure (relevant to massive stitching / transition points)
- `frontend/src/pages/StitchingPage.tsx:10-148` — stitching page orchestrates plan selection, canvas, sidebar, undo/redo, and submit flow.
- `frontend/src/components/Stitching/StitchingCanvas.tsx:16-68` — stitching canvas component using `useStitchingCanvas()`.
- `frontend/src/components/MeshViewer/RouteBottomBar.tsx:20-163` — route-selection bar for from/to room selection and route execution.
- `frontend/src/hooks/useStitching.ts:21-219` — stitching state and API orchestration, including `postStitching()`.
- `frontend/src/hooks/useMeshViewer.ts:11-47` — fetches reconstruction data for mesh viewing.
- `frontend/src/types/stitching.ts:2-143` — client-side stitching request/response, layer, vector model, and state types.
- `frontend/src/types/wizard.ts:10-56` — room/door annotation and wizard state types used by the reconstruction flow.
- `frontend/src/api/apiService.ts:7-38` — axios base URL `/api/v1`, bearer token injection from `localStorage`, and 401 redirect handling.
- `frontend/src/api/apiService.ts:159-293` — reconstruction and navigation API client functions, including `getReadyReconstructions()`, `buildNavGraph()`, `findRoute()`, and reconstruction CRUD.
- `frontend/src/api/apiService.ts:295-298` — `postStitching()` client call to `/stitching/`.

### Database Models
- `backend/app/db/models/reconstruction.py:14-29` — `UploadedFile` columns: `id`, `filename`, `file_path`, `url`, `file_type`, `uploaded_by`, `uploaded_at`.
- `backend/app/db/models/reconstruction.py:31-57` — `Reconstruction` columns include `plan_file_id`, `mask_file_id`, `mesh_file_id_obj`, `mesh_file_id_glb`, `building_id`, `floor_number`, `status`, `error_message`, `vectorization_data`, `created_by`, timestamps.
- `backend/app/db/models/reconstruction.py:59-71` — `Room` columns: `id`, `reconstruction_id`, `number`, `x`, `y`.
- `backend/app/db/models/building.py:35` — search result shows a `reconstruction_id` foreign key on the floor/building model area; exact surrounding context was not fully read here.

## Closest Analog Feature
Stitching is the closest analog feature.
- Files: `backend/app/api/stitching.py:15-53`, `backend/app/services/stitching_service.py:72-259`, `backend/app/models/stitching.py:9-70`, `frontend/src/pages/StitchingPage.tsx:10-148`, `frontend/src/hooks/useStitching.ts:21-219`, `frontend/src/types/stitching.ts:2-143`.
- Data flow: frontend builds a `StitchingRequest` and sends it via `postStitching()` → API router authenticates and passes to `StitchingService` → service loads reconstructions from `ReconstructionRepository` → deserializes `vectorization_data` → applies crop/transform/clip/merge/normalize → creates and saves a new reconstruction → returns `StitchingResponse`.
- Test approach: stitching tests exist in `backend/tests/services/test_stitching_service.py`, `backend/tests/api/test_stitching_api.py`, and `backend/tests/processing/stitching/` per the ticket context and repository snapshot.

## Existing Patterns to Reuse
- Async repository with commit/refresh pattern — `backend/app/db/repositories/reconstruction_repo.py:18-191`.
- API router thin layer with `Depends(...)` service injection — `backend/app/api/reconstruction.py:41-260` and `backend/app/api/stitching.py:15-53`.
- Pydantic request/response models with explicit suffixes — `backend/app/models/reconstruction.py:13-210` and `backend/app/models/stitching.py:9-70`.
- NetworkX A* route finding and LOS pruning — `backend/app/processing/nav_graph.py:422-519`.
- Frontend axios token injection and 401 handling — `frontend/src/api/apiService.ts:18-38`.
- Frontend hook-driven state orchestration — `frontend/src/hooks/useStitching.ts:21-219` and `frontend/src/hooks/useMeshViewer.ts:11-47`.
- Three.js resource cleanup patterns exist in project standards, and mesh-viewer code already relies on hook-based scene setup per `prompts/threejs_patterns.md:4-15` and `:184-210`.

## Integration Points
- Database: `Reconstruction`, `UploadedFile`, `Room` are the current persistence anchors; stitching writes merged vectorization data back into `reconstructions.vectorization_data` (`backend/app/db/models/reconstruction.py:31-71`, `backend/app/db/repositories/reconstruction_repo.py:177-191`).
- File storage: uploads are stored under `uploads/plans`, `uploads/masks`, `uploads/environment`, and navigation graphs are saved beside masks as `{mask_id}_nav.json` (`backend/app/core/config.py:26-29`, `backend/app/api/upload.py:55-137`, `backend/app/services/nav_service.py:105-108`).
- API: frontend calls reconstruction and navigation endpoints through `frontend/src/api/apiService.ts:159-298`; route-related shapes currently come from `backend/app/models/reconstruction.py:174-210`.
- Pipeline: reconstruction flow is triggered from reconstruction API endpoints, stitching flow from `POST /stitching/`, and nav graph serialization / route finding lives in `backend/app/processing/nav_graph.py:392-519` and `backend/app/processing/navigation.py:37-196`.

## Gaps (what's missing for this feature)
- No ORM models for transition groups or transition points.
- No Pydantic models for transition-group/point CRUD or multi-plan route responses.
- No backend repository/service for managing transition points/groups.
- No multi-plan route endpoint; navigation API is still a stub for route building.
- No processing function that merges multiple per-plan nav graphs into one super-graph.
- No frontend transition-point editor page, components, or hooks.
- No frontend API client for transition CRUD or multi-plan route requests.
- No existing UI flow for inter-plan linking distinct from stitching.

## Key Files
- `backend/app/services/stitching_service.py` — closest working analog for multi-source plan combination.
- `backend/app/processing/nav_graph.py` — current graph serialization and route search logic.
- `backend/app/processing/navigation.py` — current A* service prototype.
- `backend/app/api/navigation.py` — stub navigation boundary to replace or extend.
- `backend/app/db/models/reconstruction.py` — current persistence model for plans and saved reconstructions.
- `frontend/src/pages/StitchingPage.tsx` — frontend analog for multi-source editor workflow.
- `frontend/src/components/MeshViewer/RouteBottomBar.tsx` — current route-selection UI.
- `frontend/src/api/apiService.ts` — current API boundary shapes and auth handling.
