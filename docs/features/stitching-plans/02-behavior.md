# Behavior: Stitching-Plans

## Data Flow Diagrams

### DFD: Main Stitching Flow

```mermaid
flowchart LR
User([User]) -->|1. Select plans| Form[Plan Selection Form]
Form -->|2. Load to canvas| Canvas[Fabric.js Canvas]
User -->|3. Position/crop| Canvas
Canvas -->|4. Export transforms| API[POST /api/v1/stitching/]
API -->|5. Load models| Service[StitchingService]
Service -->|6. Transform| Processing[Processing Functions]
Processing -->|7. Merge| Service
Service -->|8. Save| DB[(Database)]
Service -->|9. Response| API
API -->|10. Redirect| User
```

## Sequence Diagrams

### Use Case 1: Load Plans for Selection

```mermaid
sequenceDiagram
actor User
participant Page as StitchingPage
participant API as apiService
participant Backend as GET /reconstructions

User->>Page: Navigate to /stitching
Page->>API: getReadyReconstructions()
API->>Backend: GET /api/v1/reconstructions?status=ready_for_stitching
Backend-->>API: 200 [{id, name, preview_url, rooms_count}, ...]
API-->>Page: reconstructions[]
Page->>Page: Render plan cards
User->>Page: Select ≥2 plans
User->>Page: Click "> Далее"
Page->>Page: Navigate to step 2 (canvas editor)
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| No reconstructions found | 200 | `[]` | Show message "Нет готовых планов. Загрузите план." + button → /wizard |
| User selects <2 plans | — | — | Disable "> Далее" button |
| Network error | 500 | `{"detail": "..."}` | Show error toast, retry button |

**Edge cases:**
- Zero reconstructions in DB → show empty state with "Загрузить план" button
- Only 1 reconstruction ready → show message "Для сшивания нужно минимум 2 плана"
- User selects same plan twice → prevent in UI (checkbox, not multi-select)

### Use Case 2: Position Plans on Canvas

```mermaid
sequenceDiagram
actor User
participant Canvas as StitchingCanvas
participant Hook as useStitchingCanvas
participant Fabric as fabric.Canvas
participant History as useStitchingHistory

User->>Canvas: Step 2 loads
Canvas->>Hook: Initialize canvas
Hook->>Fabric: new fabric.Canvas()
loop For each selected plan
    Hook->>Fabric: Load image + vector mask as fabric.Group
    Fabric-->>Hook: group object
    Hook->>Fabric: canvas.add(group)
end
Fabric-->>Canvas: Canvas ready

User->>Canvas: Drag plan (move tool)
Canvas->>Fabric: object:modified event
Fabric->>Hook: Update transform state
Hook->>History: pushState(snapshot)

User->>Canvas: Rotate plan (rotate tool)
Canvas->>Fabric: object:rotating event
Fabric->>Hook: Update angle
Hook->>History: pushState(snapshot)

User->>Canvas: Draw polygon clip
Canvas->>Fabric: Add polygon points
Fabric->>Hook: Polygon closed
Hook->>Fabric: Apply clipPath to group
Hook->>History: pushState(snapshot)

User->>Canvas: Ctrl+Z (undo)
Canvas->>History: undo()
History->>Hook: Restore previous snapshot
Hook->>Fabric: Update all objects
Fabric-->>Canvas: Canvas updated
```

**Error cases:**

| Condition | Behavior |
|-----------|----------|
| Image fails to load | Show placeholder + error icon on layer card |
| Canvas initialization fails | Show error message "Не удалось инициализировать редактор" |
| Out of memory (too many snapshots) | Limit to 50, FIFO removal |

**Edge cases:**
- User rotates plan 360° → normalize to 0°
- User scales plan to 0 → prevent (min scale 0.1)
- User moves plan outside canvas → allow (canvas is infinite, bounding box computed later)
- Polygon clip with <3 points → ignore, show tooltip "Минимум 3 точки"

### Use Case 3: Submit Stitching Request

```mermaid
sequenceDiagram
actor User
participant Page as StitchingPage
participant Hook as useStitching
participant Canvas as useStitchingCanvas
participant API as apiService
participant Router as POST /stitching/
participant Service as StitchingService
participant Processing as processing/stitching/
participant Repo as ReconstructionRepository
participant DB as Database

User->>Page: Click "> СШИТЬ"
Page->>Hook: handleStitch()
Hook->>Canvas: exportState()
Canvas-->>Hook: {layers: [{id, transform, clipPolygons, ...}]}
Hook->>API: postStitching(request)
API->>Router: POST /api/v1/stitching/

Router->>Service: stitch_plans(request)

loop For each source plan
    Service->>Repo: get_by_id(plan_id)
    Repo->>DB: SELECT vectorization_data
    DB-->>Repo: JSON string
    Repo-->>Service: VectorizationResult

    Service->>Processing: denormalize_coords(walls, image_size)
    Processing-->>Service: walls_px

    Service->>Processing: build_affine_matrix(scale, rotate, translate)
    Processing-->>Service: matrix

    Service->>Processing: apply_affine_to_polygon(walls, matrix)
    Processing-->>Service: walls_transformed

    alt Has clip polygons
        Service->>Processing: clip_walls(walls, clip_polygon)
        Processing-->>Service: walls_clipped
        Service->>Processing: clip_rooms(rooms, clip_polygon)
        Processing-->>Service: rooms_clipped
        Service->>Processing: clip_doors(doors, clip_polygon)
        Processing-->>Service: doors_clipped
    end
end

Service->>Processing: merge_models(all_walls, all_rooms, all_doors)
Processing-->>Service: merged_model

Service->>Processing: check_duplicate_rooms(merged_rooms)
Processing-->>Service: warnings[]

Service->>Processing: normalize_to_bounding_box(merged_model)
Processing-->>Service: normalized_model

Service->>Repo: create_reconstruction(name, vectorization_data)
Repo->>DB: INSERT INTO reconstructions
DB-->>Repo: new_id
Repo-->>Service: reconstruction

Service-->>Router: StitchingResponse
Router-->>API: 201 {id, name, rooms_count, walls_count, warnings}
API-->>Hook: response
Hook->>Page: Navigate to /reconstructions/{id}
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Less than 2 plans | 400 | `{"detail": "At least 2 source plans required"}` | Show error toast |
| Invalid transform data | 400 | `{"detail": "Invalid transform: scale must be > 0"}` | Show validation errors |
| No walls after merge | 400 | `{"detail": "No walls after merge"}` | Show error toast |
| Source plan not found | 404 | `{"detail": "Reconstruction {id} not found"}` | Show error toast |
| Building not found | 404 | `{"detail": "Building {id} not found"}` | Show error toast |
| Pydantic validation | 422 | `{"detail": [{"loc": [...], "msg": "..."}]}` | Show validation errors |
| Processing error | 500 | `{"detail": "Stitching failed: ..."}` | Show error + log details |
| DB save error | 500 | `{"detail": "Failed to save"}` | Show error, don't navigate |

**Edge cases:**
- All rooms clipped away → create reconstruction with 0 rooms (valid, user can re-edit)
- Bounding box is empty (no walls) → return 400 "No walls after merge"
- Duplicate room warnings → include in response, show to user as info toast
- Very large merged model (>10k walls) → process normally, may be slow (add timeout warning)

### Use Case 4: View Stitched Reconstruction

```mermaid
sequenceDiagram
actor User
participant Page as ViewMeshPage
participant API as apiService
participant Backend as GET /reconstructions/{id}

User->>Page: Navigate to /reconstructions/{id}
Page->>API: getReconstruction(id)
API->>Backend: GET /api/v1/reconstruction/reconstructions/{id}
Backend-->>API: 200 {id, name, status, mesh_url, vectorization_data}
API-->>Page: reconstruction
Page->>Page: Load 3D mesh (GLB)
Page->>Page: Render room labels from vectorization_data
User->>Page: Use navigation (A*)
```

**No special behavior** — stitched reconstruction is identical to single-plan reconstruction from this point forward.

## State Transitions

### Stitching Workflow State Machine

```mermaid
stateDiagram-v2
[*] --> SelectPlans: User navigates to /stitching
SelectPlans --> PositionPlans: ≥2 plans selected, click "> Далее"
PositionPlans --> SelectPlans: Click "Назад"
PositionPlans --> Processing: Click "> СШИТЬ"
Processing --> Success: API returns 201
Processing --> Error: API returns 4xx/5xx
Success --> [*]: Navigate to /reconstructions/{id}
Error --> PositionPlans: Show error, stay on page
```

### Canvas Tool State

```mermaid
stateDiagram-v2
[*] --> Move: Default tool
Move --> Rotate: User clicks "Вращение"
Rotate --> RectCrop: User clicks "Кадрирование"
RectCrop --> PolygonClip: User clicks "Полигон. обрезка"
PolygonClip --> Move: User clicks "Перемещение"
```

**Tool behaviors:**
- **Move:** Drag plan = translate, drag corner = scale, drag near corner = rotate
- **Rotate:** Drag anywhere on plan = rotate around center, Shift = snap to 15°
- **RectCrop:** Drag rectangle on plan, Enter = apply crop (delete outside)
- **PolygonClip:** Click to add points, click first point = close, apply = delete inside

## Data Structures

### StitchingRequest (frontend → backend)

```typescript
interface StitchingRequest {
  name: string;
  building_id: string;
  floor_number: number;
  source_plans: SourcePlanInput[];
}

interface SourcePlanInput {
  reconstruction_id: string;
  transform: {
    translate_x: number;  // Canvas pixels
    translate_y: number;
    scale_x: number;
    scale_y: number;
    rotation_deg: number;
  };
  clip_polygons: ClipPolygon[];
  rect_crop: RectCrop | null;
  image_width_px: number;   // Original image size
  image_height_px: number;
  z_index: number;
}

interface ClipPolygon {
  type: "subtract";
  points: [number, number][];  // Canvas pixels
}

interface RectCrop {
  x: number;      // Image pixels
  y: number;
  width: number;
  height: number;
}
```

### StitchingResponse (backend → frontend)

```typescript
interface StitchingResponse {
  id: number;
  name: string;
  status: number;  // 3 = completed
  source_reconstruction_ids: number[];
  building_id: string;
  floor_number: number;
  rooms_count: number;
  walls_count: number;
  warnings?: string[];  // e.g., ["Duplicate room 'A304' detected"]
}
```

### Canvas Snapshot (undo/redo)

```typescript
interface StitchingSnapshot {
  layers: LayerSnapshot[];
}

interface LayerSnapshot {
  reconstructionId: string;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    angle: number;
  };
  clipPaths: SerializedClipPath[];
  rectCrop: RectCrop | null;
  zIndex: number;
}
```
