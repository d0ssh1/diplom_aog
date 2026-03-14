# Behavior: Vectorization Pipeline

## Data Flow Diagrams

### DFD: Full Vectorization Pipeline

```mermaid
flowchart TB
User([Administrator]) -->|1. Upload plan photo| Upload[POST /upload/plan-photo/]
Upload -->|file_id| User
User -->|2. Request mask with crop/rotation| CalcMask[POST /reconstruction/initial-masks]
CalcMask -->|Orchestrate| MaskService[MaskService]
MaskService -->|Step 1-2| ColorFilter[color_filter + auto_crop]
ColorFilter -->|cleaned image| MaskService
MaskService -->|Step 3-4| Binarization[BinarizationService]
Binarization -->|binary mask| MaskService
MaskService -->|Step 5-6| TextRemoval[text_detect + inpaint]
TextRemoval -->|mask + text_blocks| MaskService
MaskService -->|Save mask| Storage[(uploads/masks/)]
MaskService -->|mask_file_id| User

User -->|3. Request mesh| CalcMesh[POST /reconstruction/reconstructions]
CalcMesh -->|Orchestrate| ReconService[ReconstructionService]
ReconService -->|Load mask| Storage
ReconService -->|Step 7| RoomDetect[room_detect + ContourService]
RoomDetect -->|walls, rooms, doors| ReconService
ReconService -->|Step 8| Normalize[normalize_coords + compute scale]
Normalize -->|VectorizationResult| ReconService
ReconService -->|Save JSON| DB[(reconstructions.vectorization_data)]
ReconService -->|Build 3D mesh| MeshBuilder[mesh_builder]
MeshBuilder -->|OBJ/GLB| Storage
ReconService -->|reconstruction_id| User

User -->|4. Retrieve vectors| GetVectors[GET /reconstructions/{id}/vectors]
GetVectors -->|Load JSON| DB
DB -->|VectorizationResult| User
```

---

## Sequence Diagrams

### Use Case 1: Calculate Mask with Auto-Crop

```mermaid
sequenceDiagram
actor Admin
participant Router as API Router
participant MaskSvc as MaskService
participant Pipeline as pipeline.py
participant BinSvc as BinarizationService
participant Storage as File Storage

Admin->>Router: POST /reconstruction/initial-masks<br/>{file_id, crop?, rotation?}
Router->>MaskSvc: calculate_mask(file_id, crop, rotation)
MaskSvc->>Storage: find file uploads/plans/{file_id}.*
Storage-->>MaskSvc: file_path
MaskSvc->>Storage: cv2.imread(file_path)
Storage-->>MaskSvc: image (BGR)

Note over MaskSvc,Pipeline: Step 1: Brightness normalization
MaskSvc->>Pipeline: normalize_brightness(image)
Pipeline-->>MaskSvc: normalized_image

Note over MaskSvc,Pipeline: Step 2: Color filtering
MaskSvc->>Pipeline: color_filter(image)
Pipeline-->>MaskSvc: filtered_image (colored elements removed)

Note over MaskSvc,Pipeline: Step 3: Auto-crop suggestion
MaskSvc->>Pipeline: auto_crop_suggest(image)
Pipeline-->>MaskSvc: suggested_crop_rect or None
alt User provided crop
    MaskSvc->>MaskSvc: apply user crop
else Auto-crop suggested
    MaskSvc->>MaskSvc: apply suggested crop
else No crop
    MaskSvc->>MaskSvc: use full image
end

Note over MaskSvc,BinSvc: Step 4: Adaptive binarization
MaskSvc->>BinSvc: binarize_otsu(gray) or apply_adaptive_threshold(gray)
BinSvc-->>MaskSvc: binary_mask

Note over MaskSvc,Pipeline: Step 5: Text detection
MaskSvc->>Pipeline: text_detect(image, binary_mask)
Pipeline-->>MaskSvc: text_blocks (with room numbers)

Note over MaskSvc,Pipeline: Step 6: Text removal
MaskSvc->>Pipeline: remove_text_regions(binary_mask, text_blocks)
Pipeline-->>MaskSvc: cleaned_mask

MaskSvc->>Storage: cv2.imwrite(uploads/masks/{file_id}.png, cleaned_mask)
Storage-->>MaskSvc: OK
MaskSvc-->>Router: mask_file_id
Router-->>Admin: 200 CalculateMaskResponse<br/>{id, url, text_blocks_count}
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| file_id not found | 404 | {"detail": "Plan file not found"} | FileStorageError raised |
| Invalid image format | 400 | {"detail": "Failed to decode image"} | cv2.imread returns None |
| Processing failed | 500 | {"detail": "Image processing error: {step}"} | ImageProcessingError caught, logged |
| Empty image after crop | 400 | {"detail": "Crop area is empty"} | Validate crop before processing |

**Edge cases:**
- Large file (>10MB): Already validated in upload endpoint, rejected before reaching this step
- Plan with no text: text_detect returns empty list, system continues normally
- Plan with no detectable building boundary: auto_crop returns None, uses full image
- Extreme rotation (not 0/90/180/270): Reject in validation, only allow 90° increments

---

### Use Case 2: Build Mesh with Room Detection

```mermaid
sequenceDiagram
actor Admin
participant Router as API Router
participant ReconSvc as ReconstructionService
participant Repo as ReconstructionRepository
participant Pipeline as pipeline.py
participant ContourSvc as ContourService
participant MeshBuilder as mesh_builder
participant DB as Database
participant Storage as File Storage

Admin->>Router: POST /reconstruction/reconstructions<br/>{plan_file_id, mask_file_id}
Router->>ReconSvc: build_mesh(plan_file_id, mask_file_id, user_id)
ReconSvc->>Repo: create_reconstruction(plan_file_id, mask_file_id, user_id, status=2)
Repo->>DB: INSERT reconstructions (status=PROCESSING)
DB-->>Repo: reconstruction
Repo-->>ReconSvc: reconstruction

ReconSvc->>Storage: find mask uploads/masks/{mask_file_id}.*
Storage-->>ReconSvc: mask_path
ReconSvc->>Storage: cv2.imread(mask_path, GRAYSCALE)
Storage-->>ReconSvc: binary_mask

Note over ReconSvc,ContourSvc: Step 7a: Extract structural elements
ReconSvc->>ContourSvc: extract_elements(binary_mask)
ContourSvc-->>ReconSvc: List[StructuralElement] (walls, rooms, doors)

Note over ReconSvc,Pipeline: Step 7b: Compute wall thickness
ReconSvc->>Pipeline: compute_wall_thickness(binary_mask)
Pipeline-->>ReconSvc: wall_thickness_px

Note over ReconSvc,Pipeline: Step 7c: Detect rooms (invert mask)
ReconSvc->>Pipeline: room_detect(binary_mask)
Pipeline-->>ReconSvc: List[Room] (polygons + centers)

Note over ReconSvc,Pipeline: Step 7d: Classify rooms (corridor vs room)
ReconSvc->>Pipeline: classify_rooms(rooms)
Pipeline-->>ReconSvc: rooms (with room_type)

Note over ReconSvc,Pipeline: Step 7e: Detect doors
ReconSvc->>Pipeline: door_detect(binary_mask, rooms)
Pipeline-->>ReconSvc: List[Door] (position + connects)

Note over ReconSvc,Pipeline: Step 7f: Assign room numbers
ReconSvc->>Pipeline: assign_room_numbers(rooms, text_blocks)
Pipeline-->>ReconSvc: rooms (with names)

Note over ReconSvc,Pipeline: Step 8: Normalize coordinates
ReconSvc->>Pipeline: normalize_coords(walls, rooms, doors, image_size)
Pipeline-->>ReconSvc: normalized entities

ReconSvc->>Pipeline: compute_scale_factor(wall_thickness_px)
Pipeline-->>ReconSvc: estimated_pixels_per_meter

ReconSvc->>ReconSvc: Build VectorizationResult
ReconSvc->>Repo: update_vectorization_data(reconstruction_id, vectorization_result_json)
Repo->>DB: UPDATE reconstructions SET vectorization_data=...
DB-->>Repo: OK

Note over ReconSvc,MeshBuilder: Build 3D mesh from VectorizationResult
ReconSvc->>MeshBuilder: build_mesh(vectorization_result)
MeshBuilder-->>ReconSvc: trimesh.Trimesh
ReconSvc->>MeshBuilder: export_mesh(mesh, formats=[obj, glb])
MeshBuilder->>Storage: Save uploads/models/reconstruction_{id}.obj/glb
Storage-->>MeshBuilder: OK
MeshBuilder-->>ReconSvc: obj_path, glb_path

ReconSvc->>Repo: update_mesh(reconstruction_id, obj_path, glb_path, status=3)
Repo->>DB: UPDATE reconstructions SET status=COMPLETED
DB-->>Repo: reconstruction
Repo-->>ReconSvc: reconstruction
ReconSvc-->>Router: reconstruction
Router-->>Admin: 200 CalculateMeshResponse<br/>{id, status, url, rooms_count, doors_count}
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| mask_file_id not found | 404 | {"detail": "Mask file not found"} | FileStorageError raised |
| No contours detected | 200 | {status: COMPLETED, walls: [], rooms: []} | Valid result, empty building |
| Room detection failed | 500 | {status: ERROR, error_message: "..."} | Update DB status=4, return error |
| Mesh generation failed | 500 | {status: ERROR, error_message: "..."} | Update DB status=4, VectorizationResult still saved |

**Edge cases:**
- Plan with no rooms (only corridors): rooms list empty, corridors_count > 0
- Plan with no doors detected: doors list empty, system continues
- Plan with overlapping rooms: Keep all, floor-editor allows manual merge
- Wall thickness cannot be computed: Use default 0.2m, log warning

---

### Use Case 3: Retrieve Vectorization Data

```mermaid
sequenceDiagram
actor User
participant Router as API Router
participant ReconSvc as ReconstructionService
participant Repo as ReconstructionRepository
participant DB as Database

User->>Router: GET /reconstructions/{id}/vectors
Router->>ReconSvc: get_vectorization_data(reconstruction_id)
ReconSvc->>Repo: get_by_id(reconstruction_id)
Repo->>DB: SELECT * FROM reconstructions WHERE id=...
DB-->>Repo: reconstruction
Repo-->>ReconSvc: reconstruction

alt vectorization_data exists
    ReconSvc->>ReconSvc: json.loads(reconstruction.vectorization_data)
    ReconSvc-->>Router: VectorizationResult
    Router-->>User: 200 VectorizationResult JSON
else vectorization_data is NULL
    ReconSvc-->>Router: None
    Router-->>User: 404 {"detail": "Vectorization data not available"}
end
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| reconstruction_id not found | 404 | {"detail": "Reconstruction not found"} | Repository returns None |
| vectorization_data is NULL | 404 | {"detail": "Vectorization data not available"} | Old reconstructions before this feature |
| Invalid JSON in vectorization_data | 500 | {"detail": "Corrupted vectorization data"} | Log error, return 500 |

---

### Use Case 4: Update Vectorization Data (from floor-editor)

```mermaid
sequenceDiagram
actor Admin
participant Router as API Router
participant ReconSvc as ReconstructionService
participant Repo as ReconstructionRepository
participant DB as Database

Admin->>Router: PUT /reconstructions/{id}/vectors<br/>{VectorizationResult}
Router->>Router: Validate VectorizationResult schema
Router->>ReconSvc: update_vectorization_data(reconstruction_id, vectorization_result)
ReconSvc->>ReconSvc: json.dumps(vectorization_result)
ReconSvc->>Repo: update_vectorization_data(reconstruction_id, json_str)
Repo->>DB: UPDATE reconstructions SET vectorization_data=..., updated_at=NOW()
DB-->>Repo: OK
Repo-->>ReconSvc: reconstruction
ReconSvc-->>Router: reconstruction
Router-->>Admin: 200 {"message": "Vectorization data updated"}
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| reconstruction_id not found | 404 | {"detail": "Reconstruction not found"} | Repository returns None |
| Invalid VectorizationResult schema | 400 | {"detail": "Validation error: ..."} | Pydantic validation fails |
| Coordinates out of [0,1] range | 400 | {"detail": "Invalid coordinates"} | Pydantic Field validation fails |

---

## Diplom3D-Specific Edge Cases

1. **Plans without room numbers (plans 2, 3):**
   - text_detect returns empty list or text_blocks without room number pattern
   - room.name remains empty string
   - System continues normally
   - Admin fills room names later in floor-editor

2. **Vertical/rotated plans:**
   - User manually rotates via button (90° increments)
   - Rotation applied before pipeline starts
   - No automatic rotation detection

3. **Plans with thick walls (plan 3) vs thin walls (plan 1):**
   - Adaptive binarization handles both
   - Wall thickness computed per-plan via distance transform
   - No hardcoded thickness values

4. **Phone photos with uneven lighting:**
   - Step 1 (brightness normalization) uses CLAHE
   - Step 4 (binarization) uses adaptive threshold instead of Otsu
   - Histogram analysis chooses method automatically

5. **Scans with uniform contrast:**
   - Step 1 (brightness normalization) skipped if histogram is already uniform
   - Step 4 (binarization) uses Otsu (faster, more accurate for bimodal histograms)

6. **Colored evacuation arrows and symbols:**
   - Step 2 (color filtering) removes high-saturation pixels before binarization
   - HSV mask: saturation > threshold → inpaint
   - Prevents green arrows and red symbols from becoming "walls"

7. **Mini-plans in corner:**
   - Step 3 (auto-crop) filters contours by area (> 20% of image)
   - Mini-plan is significantly smaller → excluded
   - Only main building boundary suggested for crop

8. **Concurrent edits to same reconstruction:**
   - Last-write-wins (no optimistic locking)
   - updated_at timestamp tracks last modification
   - Future: Add version field if conflicts become issue
