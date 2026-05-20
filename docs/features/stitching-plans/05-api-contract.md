# API Contract: Stitching-Plans

## Endpoints

### POST /api/v1/stitching/

Merge multiple floor plan reconstructions into a single unified model.

**Request:**
```json
{
  "name": "Этаж 3 — полный план",
  "building_id": "550e8400-e29b-41d4-a716-446655440000",
  "floor_number": 3,
  "source_plans": [
    {
      "reconstruction_id": "1",
      "transform": {
        "translate_x": 0.0,
        "translate_y": 0.0,
        "scale_x": 1.0,
        "scale_y": 1.0,
        "rotation_deg": 0.0
      },
      "clip_polygons": [
        {
          "type": "subtract",
          "points": [[450, 0], [500, 0], [500, 800], [450, 800]]
        }
      ],
      "rect_crop": {
        "x": 10,
        "y": 20,
        "width": 980,
        "height": 760
      },
      "image_width_px": 1000,
      "image_height_px": 800,
      "z_index": 0
    },
    {
      "reconstruction_id": "2",
      "transform": {
        "translate_x": 450.0,
        "translate_y": 0.0,
        "scale_x": 1.0,
        "scale_y": 1.0,
        "rotation_deg": 0.0
      },
      "clip_polygons": [],
      "rect_crop": null,
      "image_width_px": 1000,
      "image_height_px": 800,
      "z_index": 1
    }
  ]
}
```

**Request Fields:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| name | string | Yes | 1-255 chars | Name for the merged reconstruction |
| building_id | string | Yes | UUID format | Building this floor belongs to |
| floor_number | integer | Yes | >= 0 | Floor number (0 = ground floor) |
| source_plans | array | Yes | min 2 items | Plans to merge |

**SourcePlanInput Fields:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| reconstruction_id | string | Yes | Exists in DB | ID of source reconstruction |
| transform | object | Yes | — | Affine transformation parameters |
| transform.translate_x | number | Yes | — | Horizontal translation (canvas pixels) |
| transform.translate_y | number | Yes | — | Vertical translation (canvas pixels) |
| transform.scale_x | number | Yes | > 0 | Horizontal scale factor |
| transform.scale_y | number | Yes | > 0 | Vertical scale factor |
| transform.rotation_deg | number | Yes | 0-360 | Rotation angle (degrees) |
| clip_polygons | array | Yes | — | Polygons to subtract (empty array if none) |
| clip_polygons[].type | string | Yes | "subtract" | Clip operation type |
| clip_polygons[].points | array | Yes | min 3 points | Polygon vertices [[x, y], ...] in canvas pixels |
| rect_crop | object | No | null or object | Rectangular crop in image space |
| rect_crop.x | number | Yes | >= 0 | Left position (image pixels) |
| rect_crop.y | number | Yes | >= 0 | Top position (image pixels) |
| rect_crop.width | number | Yes | > 0 | Width (image pixels) |
| rect_crop.height | number | Yes | > 0 | Height (image pixels) |
| image_width_px | integer | Yes | > 0 | Original image width |
| image_height_px | integer | Yes | > 0 | Original image height |
| z_index | integer | Yes | >= 0 | Layer order (0 = bottom) |

**Response (201 Created):**
```json
{
  "id": 42,
  "name": "Этаж 3 — полный план",
  "status": 3,
  "source_reconstruction_ids": [1, 2],
  "building_id": "550e8400-e29b-41d4-a716-446655440000",
  "floor_number": 3,
  "rooms_count": 12,
  "walls_count": 45,
  "warnings": [
    "Duplicate room 'A304' detected at distance 25px"
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | integer | ID of new merged reconstruction |
| name | string | Name from request |
| status | integer | 3 = completed |
| source_reconstruction_ids | array | IDs of source plans |
| building_id | string | Building UUID |
| floor_number | integer | Floor number |
| rooms_count | integer | Total rooms in merged model |
| walls_count | integer | Total walls in merged model |
| warnings | array | Optional warnings (e.g., duplicate rooms) |

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | `{"detail": "At least 2 source plans required"}` | Less than 2 plans in request |
| 400 | `{"detail": "Invalid transform: scale must be > 0"}` | Invalid transform parameters |
| 400 | `{"detail": "No walls after merge"}` | All walls clipped away |
| 404 | `{"detail": "Reconstruction 123 not found"}` | Source reconstruction doesn't exist |
| 404 | `{"detail": "Building {id} not found"}` | Building doesn't exist |
| 422 | `{"detail": [{"loc": ["body", "name"], "msg": "field required"}]}` | Validation error (Pydantic) |
| 500 | `{"detail": "Stitching failed: {error}"}` | Processing error |

---

### GET /api/v1/reconstructions?status=ready_for_stitching

List reconstructions ready for stitching (completed, with vectorization data).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status. Value: "ready_for_stitching" |
| building_id | string | No | Filter by building UUID |
| floor_number | integer | No | Filter by floor number |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Секция А — этаж 3",
    "preview_url": "/api/v1/uploads/plans/file-uuid.jpg",
    "rooms_count": 6,
    "walls_count": 24,
    "created_at": "2026-03-22T10:30:00Z",
    "building_id": "550e8400-e29b-41d4-a716-446655440000",
    "floor_number": 3
  },
  {
    "id": 2,
    "name": "Секция Б — этаж 3",
    "preview_url": "/api/v1/uploads/plans/file-uuid-2.jpg",
    "rooms_count": 8,
    "walls_count": 32,
    "created_at": "2026-03-22T11:15:00Z",
    "building_id": "550e8400-e29b-41d4-a716-446655440000",
    "floor_number": 3
  }
]
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Reconstruction ID |
| name | string | Reconstruction name |
| preview_url | string | URL to preview image |
| rooms_count | integer | Number of rooms |
| walls_count | integer | Number of walls |
| created_at | string | ISO 8601 timestamp |
| building_id | string | Building UUID (if assigned) |
| floor_number | integer | Floor number (if assigned) |

**Errors:**

| Status | Body | When |
|--------|------|------|
| 500 | `{"detail": "Failed to load reconstructions"}` | Database error |

---

### GET /api/v1/reconstructions/{id}

Get single reconstruction (existing endpoint, used after stitching).

**Response (200 OK):**
```json
{
  "id": 42,
  "name": "Этаж 3 — полный план",
  "status": 3,
  "status_display": "Готово",
  "created_at": "2026-03-22T12:00:00Z",
  "created_by": 1,
  "saved_at": "2026-03-22T12:05:00Z",
  "url": "/api/v1/uploads/models/42.glb",
  "error_message": null
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 404 | `{"detail": "Reconstruction not found"}` | ID doesn't exist |

---

## Data Type Definitions

### Transform

```typescript
interface Transform {
  translate_x: number;  // Canvas pixels
  translate_y: number;  // Canvas pixels
  scale_x: number;      // Scale factor (1.0 = 100%)
  scale_y: number;      // Scale factor (1.0 = 100%)
  rotation_deg: number; // Degrees (0-360)
}
```

**Constraints:**
- `scale_x`, `scale_y` must be > 0
- `rotation_deg` normalized to [0, 360) on backend

### ClipPolygon

```typescript
interface ClipPolygon {
  type: "subtract";           // Only "subtract" supported in MVP
  points: [number, number][]; // [[x, y], ...] in canvas pixels
}
```

**Constraints:**
- Minimum 3 points (triangle)
- Points in canvas coordinate space
- Polygon must be closed (first point != last point, backend closes automatically)

### RectCrop

```typescript
interface RectCrop {
  x: number;      // Left position (image pixels)
  y: number;      // Top position (image pixels)
  width: number;  // Width (image pixels)
  height: number; // Height (image pixels)
}
```

**Constraints:**
- All values >= 0
- `width`, `height` > 0
- Crop rectangle must be within image bounds

### SourcePlanInput

```typescript
interface SourcePlanInput {
  reconstruction_id: string;
  transform: Transform;
  clip_polygons: ClipPolygon[];
  rect_crop: RectCrop | null;
  image_width_px: number;
  image_height_px: number;
  z_index: number;
}
```

### StitchingRequest

```typescript
interface StitchingRequest {
  name: string;
  building_id: string;
  floor_number: number;
  source_plans: SourcePlanInput[];
}
```

**Constraints:**
- `name`: 1-255 characters
- `building_id`: valid UUID format
- `floor_number`: >= 0
- `source_plans`: minimum 2 items

### StitchingResponse

```typescript
interface StitchingResponse {
  id: number;
  name: string;
  status: number;
  source_reconstruction_ids: number[];
  building_id: string;
  floor_number: number;
  rooms_count: number;
  walls_count: number;
  warnings?: string[];
}
```

---

## Example Requests

### Example 1: Simple Merge (No Crop, No Clip)

```bash
curl -X POST http://localhost:8000/api/v1/stitching/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "name": "Floor 3 Full",
    "building_id": "550e8400-e29b-41d4-a716-446655440000",
    "floor_number": 3,
    "source_plans": [
      {
        "reconstruction_id": "1",
        "transform": {
          "translate_x": 0,
          "translate_y": 0,
          "scale_x": 1.0,
          "scale_y": 1.0,
          "rotation_deg": 0
        },
        "clip_polygons": [],
        "rect_crop": null,
        "image_width_px": 1000,
        "image_height_px": 800,
        "z_index": 0
      },
      {
        "reconstruction_id": "2",
        "transform": {
          "translate_x": 950,
          "translate_y": 0,
          "scale_x": 1.0,
          "scale_y": 1.0,
          "rotation_deg": 0
        },
        "clip_polygons": [],
        "rect_crop": null,
        "image_width_px": 1000,
        "image_height_px": 800,
        "z_index": 1
      }
    ]
  }'
```

### Example 2: With Rotation and Clip

```bash
curl -X POST http://localhost:8000/api/v1/stitching/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "name": "Floor 2 Merged",
    "building_id": "550e8400-e29b-41d4-a716-446655440000",
    "floor_number": 2,
    "source_plans": [
      {
        "reconstruction_id": "5",
        "transform": {
          "translate_x": 0,
          "translate_y": 0,
          "scale_x": 1.0,
          "scale_y": 1.0,
          "rotation_deg": 0
        },
        "clip_polygons": [
          {
            "type": "subtract",
            "points": [[900, 0], [1000, 0], [1000, 800], [900, 800]]
          }
        ],
        "rect_crop": null,
        "image_width_px": 1000,
        "image_height_px": 800,
        "z_index": 0
      },
      {
        "reconstruction_id": "6",
        "transform": {
          "translate_x": 850,
          "translate_y": 50,
          "scale_x": 1.05,
          "scale_y": 1.05,
          "rotation_deg": 2.5
        },
        "clip_polygons": [],
        "rect_crop": null,
        "image_width_px": 1000,
        "image_height_px": 800,
        "z_index": 1
      }
    ]
  }'
```

### Example 3: Get Ready Reconstructions

```bash
curl -X GET "http://localhost:8000/api/v1/reconstructions?status=ready_for_stitching&building_id=550e8400-e29b-41d4-a716-446655440000&floor_number=3" \
  -H "Authorization: Bearer {token}"
```

---

## Validation Rules

### Backend Validation (Pydantic)

```python
class TransformInput(BaseModel):
    translate_x: float
    translate_y: float
    scale_x: float = Field(gt=0, description="Must be > 0")
    scale_y: float = Field(gt=0, description="Must be > 0")
    rotation_deg: float = Field(ge=0, le=360)

class ClipPolygonInput(BaseModel):
    type: Literal["subtract"]
    points: List[Tuple[float, float]] = Field(min_length=3)

class RectCropInput(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)

class SourcePlanInput(BaseModel):
    reconstruction_id: str
    transform: TransformInput
    clip_polygons: List[ClipPolygonInput]
    rect_crop: Optional[RectCropInput] = None
    image_width_px: int = Field(gt=0)
    image_height_px: int = Field(gt=0)
    z_index: int = Field(ge=0)

class StitchingRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    building_id: str  # UUID validation via regex or custom validator
    floor_number: int = Field(ge=0)
    source_plans: List[SourcePlanInput] = Field(min_length=2)
```

### Frontend Validation (TypeScript)

```typescript
function validateStitchingRequest(request: StitchingRequest): string[] {
  const errors: string[] = [];

  if (!request.name || request.name.length === 0) {
    errors.push("Name is required");
  }

  if (request.source_plans.length < 2) {
    errors.push("At least 2 plans required");
  }

  request.source_plans.forEach((plan, idx) => {
    if (plan.transform.scale_x <= 0 || plan.transform.scale_y <= 0) {
      errors.push(`Plan ${idx + 1}: scale must be > 0`);
    }

    plan.clip_polygons.forEach((clip, clipIdx) => {
      if (clip.points.length < 3) {
        errors.push(`Plan ${idx + 1}, clip ${clipIdx + 1}: minimum 3 points`);
      }
    });
  });

  return errors;
}
```

---

## HTTP Status Code Summary

| Status | Meaning | When |
|--------|---------|------|
| 200 | OK | GET requests successful |
| 201 | Created | POST /stitching/ successful |
| 400 | Bad Request | Validation error, invalid data |
| 404 | Not Found | Resource doesn't exist |
| 422 | Unprocessable Entity | Pydantic validation error |
| 500 | Internal Server Error | Processing error, DB error |
