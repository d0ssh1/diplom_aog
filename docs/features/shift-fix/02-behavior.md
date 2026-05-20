# Behavior: shift-fix

## Data Flow Diagrams

### DFD: Plan alignment flow

```mermaid
flowchart LR
User([User]) -->|Upload plan + set crop/rotation + edit rooms| Frontend[React UI]
Frontend -->|POST/PUT JSON + multipart| API[FastAPI Router]
API -->|Validate request models| Service[Service Layer]
Service -->|Apply crop/rotation, vectorize, normalize| Processing[Processing Modules]
Processing -->|VectorizationResult / mask bytes / graph data| Service
Service -->|Save files + vectorization data| DB[(Database)]
Service -->|Return IDs, URLs, geometry| API
API -->|JSON / blob| Frontend
Frontend -->|Render aligned overlay / mask / 3D preview| User
```

## Sequence Diagrams

### Use Case 1: Crop and preview mask stay aligned
User adjusts crop and rotation in the preprocess step and requests a mask preview.

```mermaid
sequenceDiagram
actor User
participant Frontend
participant Router as Reconstruction Router
participant Service as MaskService
participant Processing
participant Storage as File Storage

User->>Frontend: Change crop or rotation
Frontend->>Router: POST /api/v1/reconstruction/mask-preview
Router->>Service: preview_mask(file_id, crop, rotation, ...)
Service->>Storage: Load original plan image
Service->>Processing: apply crop/rotation + normalize brightness + remove colors + binarize
Processing-->>Service: preview mask bytes
Service->>Storage: Write preview bytes if needed
Service-->>Router: PNG bytes
Router-->>Frontend: 200 image/blob
Frontend-->>User: Show preview overlay
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Invalid crop schema | 422 | ValidationError | Reject request before processing |
| Missing source file | 404 | {"detail": "..."} | Do not build preview |
| Empty or unreadable image | 400 | {"detail": "..."} | Return safe error message |
| Processing failure | 500 | {"detail": "..."} | Log error and stop |

**Edge cases (Diplom3D-specific):**
- Crop rectangle reaches image boundary — preview must use the same clamp logic as the editor.
- Rotation changes image orientation — preview must reuse the same rotation value that will be used for saved mask generation.
- The preview must not introduce a different origin than the one used by reconstruction.

### Use Case 2: Manual room edits keep the same coordinate frame
User edits rooms/cabinets on the vector mask canvas and saves those changes for later reconstruction.

```mermaid
sequenceDiagram
actor User
participant Frontend
participant Canvas as WallEditorCanvas
participant Hook as useWizard
participant Router as Reconstruction Router
participant Service as ReconstructionService
participant DB as Database

User->>Canvas: Draw/move room annotations
Canvas-->>Hook: Return canvas state / annotations / blob
Hook->>Router: PUT /api/v1/reconstruction/reconstructions/{id}/vectors
Router->>Service: update_vectorization_data(id, data)
Service->>DB: Store serialized VectorizationResult
DB-->>Service: OK
Service-->>Router: Reconstruction updated
Router-->>Hook: JSON response
Hook-->>User: Canvas remains in same frame after save
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Invalid vectorization payload | 422 | ValidationError | Reject before save |
| Reconstruction not found | 404 | {"detail": "..."} | Do not write data |
| Save failure | 500 | {"detail": "..."} | Keep local editor state intact |

**Edge cases (Diplom3D-specific):**
- The canvas state must preserve the same crop-origin reference as the generated preview.
- Reopening saved annotations must not shift room labels relative to the underlying plan image.
- If vectorization data already contains crop metadata, the editor must render against that metadata instead of assuming full-image coordinates.

### Use Case 3: Reconstruction and emergency-plan output use the same geometry
User runs reconstruction and then views the 3D / navigation result.

```mermaid
sequenceDiagram
actor User
participant Frontend
participant Router as Reconstruction Router
participant Service as ReconstructionService
participant Processing
participant DB as Database
participant Storage as File Storage

User->>Frontend: Click build reconstruction
Frontend->>Router: POST /api/v1/reconstruction/reconstructions
Router->>Service: build_mesh(plan_file_id, user_mask_file_id)
Service->>Storage: Load saved mask image
Service->>Processing: detect contours, rooms, doors, normalize coordinates
Processing-->>Service: VectorizationResult
Service->>DB: Save vectorization_data and mesh file references
Service->>Storage: Write OBJ/GLB files
Service-->>Router: Reconstruction response
Router-->>Frontend: JSON response
Frontend-->>User: Render 3D/route result
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Mask missing | 404 | {"detail": "..."} | Stop build |
| No contours detected | 200 or 4xx depending on service policy | Empty geometry or validation error | Must be defined consistently in decisions |
| Coordinate normalization failure | 500 | {"detail": "..."} | Do not save broken geometry |

**Edge cases (Diplom3D-specific):**
- The saved mask image and the original plan image must share the same reference transform used for room positions.
- Emergency-plan route rendering must use the same normalized coordinates as reconstruction and nav graph serialization.
- Any crop metadata stored in `VectorizationResult` must be read back before mesh/nav rendering.
