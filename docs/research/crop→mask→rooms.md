# Research: crop→mask→rooms
date: 2026-03-31

## Summary
The current frontend editor uses two related but separate image pipelines. The plan image is transformed in `WallEditorCanvas` by rotation and optional crop into `displayPlanUrl`, while the editable mask is loaded independently as `maskUrl` and fit into the Fabric canvas as the background image. Room and door annotations are stored and normalized against the mask background bounds. This means the plan, mask, and annotations can be in different coordinate spaces.

The same crop and rotation parameters are passed from the wizard/editor pages into both the plan view and mask generation requests. The crop/rotation values are sent to the backend when generating the mask preview, and the edited reconstruction stores vectorization data through the `/reconstruction/reconstructions/{id}/vectors` endpoint. The backend vectorization model already contains crop and rotation metadata, but the frontend editor still normalizes new room/door annotations directly against the rendered mask canvas.

The main gap is that the plan visual and mask visual are not guaranteed to share the same transform chain at render time. Rooms and doors are saved relative to the mask background bounds, not relative to the cropped/rotated plan geometry, so any mismatch in how `planUrl` and `maskUrl` are produced will create the observed drift.

## Architecture — Current State

### Backend Structure (relevant to crop→mask→rooms)
- `backend/app/api/reconstruction.py:254-347` — exposes vectorization and navigation-related endpoints relevant to editing rooms and masks.
  - `get_vectorization_data(id: int)` → returns `VectorizationResult`.
  - `update_vectorization_data(id: int, data: VectorizationResult)` → stores edited vector data.
  - `get_rooms(id: int)` / `save_rooms(id: int, request: RoomsRequest)` → room markers API, currently stubbed.
  - `build_nav_graph(request: BuildNavGraphRequest)` → builds navigation graph from mask and rooms.
- `backend/app/db/models/reconstruction.py:31-57` — reconstruction persistence model.
  - `Reconstruction.mask_file_id` stores the active mask file.
  - `Reconstruction.vectorization_data` stores JSON vectorization output.
  - `Reconstruction.building_id` and `floor_number` are also tracked.
- `backend/app/db/models/reconstruction.py:14-25` — uploaded file metadata.
  - `UploadedFile.file_path`, `UploadedFile.url`, `UploadedFile.file_type`, `UploadedFile.uploaded_at`.
- `backend/app/api/deps.py:27-53` — async service dependencies.
  - `get_mask_service`, `get_nav_service`, `get_reconstruction_service`, `get_stitching_service`.
- `backend/app/processing/preprocessor.py:11` — preprocessing entry point exists; pipeline docs define normalization expectations.
- `backend/app/processing/contours.py:23` — contour dataclass exists in processing layer.
- `backend/app/api/__init__.py:14-26` — router assembly includes common info endpoint.

### Frontend Structure (relevant to crop→mask→rooms)
- `frontend/src/pages/WizardPage.tsx:22-43` — wizard step progression.
  - Step 3 reads `canvasRef.current.getBlob()`, `getAnnotations()`, and `getCanvasState()` before saving mask and annotations.
  - Mask URL is derived from `state.editedMaskFileId ?? state.maskFileId`.
- `frontend/src/pages/WizardPage.tsx:65-112` — passes `planUrl`, `cropRect`, `rotation`, `maskUrl`, `initialRooms`, and `initialDoors` into `StepWallEditor`.
- `frontend/src/pages/EditPlanPage.tsx:36-92` — loads reconstruction data and vectorization data.
  - Maps `vectors.rooms` into `RoomAnnotation[]`.
  - Maps `vectors.doors` into `DoorAnnotation[]`.
  - Stores `maskUrl: rec.preview_url || ''`, `planUrl: rec.original_image_url || ''`, `rotation`, `cropRect`, `initialRooms`, `initialDoors`.
- `frontend/src/components/Wizard/StepWallEditor.tsx:45-158` — re-fetches mask preview when `blockSize`, `thresholdC`, `cropRect`, or `rotation` changes.
  - Calls `reconstructionApi.previewMask(planFileId, cropRect, rotation, blockSize, thresholdC)`.
  - Passes the resulting `currentMaskUrl` and `planUrl` to `WallEditorCanvas`.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:78-117` — transforms the plan into `displayPlanUrl`.
  - Loads `planUrl`, applies `planRotation`, then crops using `planCropRect`.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:243-268` — loads `maskUrl` and sets it as Fabric background image.
  - Stores `bgDims` and `maskAspect`.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:467-493` — door placement normalizes against background image bounds.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:623-678` — room placement normalizes against background image bounds and stores room rectangles in `roomsRef.current`.
- `frontend/src/components/Editor/WallEditorCanvas.tsx:765-771` — `getAnnotations()` returns `roomsRef.current` and `doorsRef.current`.
- `frontend/src/components/MaskEditor.tsx:14-78` — separate mask editor loads `planUrl` as visual background and, if present, loads `maskUrl` into Fabric drawing canvas.
- `frontend/src/components/Wizard/StepNavGraph.tsx:36-143` — nav graph step also consumes `maskUrl`.

### Database Models
- `UploadedFile` (`backend/app/db/models/reconstruction.py:14-28`) — file metadata and storage path/url.
- `Reconstruction` (`backend/app/db/models/reconstruction.py:31-57`) — links plan file, mask file, mesh file ids, vectorization data, and plan metadata.
- `Room` (`backend/app/db/models/reconstruction.py:59-71`) — room marker rows with `number`, `x`, and `y`.

## Closest Analog Feature
**Reconstruction editing flow**
- Files:
  - `frontend/src/pages/EditPlanPage.tsx:36-153`
  - `frontend/src/components/Wizard/StepWallEditor.tsx:45-158`
  - `frontend/src/components/Editor/WallEditorCanvas.tsx:78-771`
  - `backend/app/api/reconstruction.py:254-347`
  - `backend/app/db/models/reconstruction.py:31-71`
- Data flow:
  1. `EditPlanPage` loads reconstruction and vectorization payloads from `reconstructionApi.getReconstructionById()` and `getReconstructionVectors()`.
  2. It converts stored vector rooms/doors into annotation arrays.
  3. `StepWallEditor` requests a fresh preview mask via `reconstructionApi.previewMask(fileId, cropRect, rotation, blockSize, thresholdC)`.
  4. `WallEditorCanvas` renders the cropped/rotated plan and the mask background, then lets the user add rooms, doors, and walls.
  5. `getAnnotations()` returns edited rooms/doors; `EditPlanPage.saveVectors()` converts them into payloads and sends them via `updateVectorizationData()`.
  6. `buildNavGraph()` is called with `maskFileId`, rooms, and doors.
- Test approach:
  - `backend/tests/api/test_reconstruction_api.py` exists in the repository listing? Unclear from current search results; needs investigation.
  - `backend/tests/api/test_stitching_api.py` exists for the stitching feature, showing API test style.
  - `backend/tests/services/test_stitching_service.py` and `backend/tests/processing/stitching/` show the newer feature test layout.

## Existing Patterns to Reuse
- `crop` + `rotation` request forwarding from frontend to backend preview endpoint — `frontend/src/components/Wizard/StepWallEditor.tsx:93-110` and `frontend/src/api/apiService.ts:154-167`.
- Reconstruction vector persistence through a single `PUT` endpoint — `backend/app/api/reconstruction.py:267-278` and `frontend/src/api/apiService.ts:198-200`.
- Room/door annotations as normalized arrays in frontend state — `frontend/src/pages/EditPlanPage.tsx:46-70`, `frontend/src/components/Editor/WallEditorCanvas.tsx:630-678`.
- Background image–relative normalization for editor annotations — `frontend/src/components/Editor/WallEditorCanvas.tsx:467-493` and `623-678`.
- Mask preview generation with blob/object URL lifecycle management — `frontend/src/components/Wizard/StepWallEditor.tsx:93-115`.
- DTO-style response typing on the frontend API client — `frontend/src/api/apiService.ts:141-167`, `203-238`.

## Integration Points
- Database: `uploaded_files`, `reconstructions`, and `rooms` tables are directly relevant (`backend/app/db/models/reconstruction.py:14-71`).
- File storage: uploaded files are stored with `file_path` and `url` in `UploadedFile`; the frontend consumes `/api/v1/uploads/masks/{id}.png` as the mask URL (`frontend/src/pages/WizardPage.tsx:65`, `frontend/src/pages/EditPlanPage.tsx:73-78`).
- API: `previewMask`, `calculateMask`, `updateVectorizationData`, `buildNavGraph`, `getReconstructionVectors` are the direct frontend/backend touchpoints (`frontend/src/api/apiService.ts:141-233`, `backend/app/api/reconstruction.py:254-347`).
- Pipeline: the frontend passes `cropRect` and `rotation` into both preprocessing and mask preview generation (`frontend/src/pages/WizardPage.tsx:78-105`, `frontend/src/components/Wizard/StepWallEditor.tsx:93-110`). The backend vectorization payload already carries `crop_rect` and `rotation_angle` in `VectorizationResult` according to the pipeline spec (`prompts/pipeline.md:54-84`).

## Gaps (what's missing for this feature)
- No single shared coordinate transform object is visible in the frontend; plan and mask are transformed in separate effects (`frontend/src/components/Editor/WallEditorCanvas.tsx:78-117`, `243-268`).
- `WallEditorCanvas` normalizes rooms/doors against the rendered background image bounds, not against a unified crop/rotation basis (`frontend/src/components/Editor/WallEditorCanvas.tsx:467-493`, `623-678`).
- The room save/update API in `backend/app/api/reconstruction.py:283-299` is stubbed (`return RoomsRequest(rooms=[])` / `pass`).
- The current frontend uses `any` in `EditPlanPage.tsx:46-69` and `apiService.ts:178-199`, which differs from the strict TypeScript guidance in `prompts/frontend_style.md:2-8`.
- The current frontend has no `hooks/` directory in the relevant editor flow, matching the “current reality” notes in `CLAUDE.md:139-142`.
- The exact backend test coverage for this specific crop/mask/rooms flow is unclear from the current search and needs further investigation.

## Key Files
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — plan transform, mask background, and annotation normalization.
- `frontend/src/components/Wizard/StepWallEditor.tsx` — mask preview regeneration with crop/rotation.
- `frontend/src/pages/WizardPage.tsx` — wizard flow and save sequence.
- `frontend/src/pages/EditPlanPage.tsx` — reconstruction load/save flow.
- `frontend/src/api/apiService.ts` — HTTP client methods for mask/vector/nav endpoints.
- `backend/app/api/reconstruction.py` — vectorization and nav-graph endpoints.
- `backend/app/db/models/reconstruction.py` — stored reconstruction, file, and room records.
- `prompts/pipeline.md` — expected image-processing pipeline and normalization rules.
- `prompts/architecture.md` — intended layering and current-vs-target architecture.
