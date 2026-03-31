# API Contract: crop→mask→rooms

## Endpoints

### POST /reconstruction/initial-masks
Generate or regenerate the mask using crop and rotation metadata.

**Request:**
```json
{
  "file_id": "string",
  "crop": {
    "x": 0.1,
    "y": 0.2,
    "width": 0.5,
    "height": 0.4
  },
  "rotation": 90,
  "block_size": 15,
  "threshold_c": 10
}
```

**Response (200):**
```json
{
  "file_id": "string"
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | `{"detail": "..."}` | Invalid crop or rotation input |
| 404 | `{"detail": "..."}` | Input plan file cannot be found |
| 500 | `{"detail": "..."}` | Preview generation failed |

### POST /reconstruction/mask-preview
Generate a preview blob for the edited mask.

**Request:**
```json
{
  "file_id": "string",
  "crop": {
    "x": 0.1,
    "y": 0.2,
    "width": 0.5,
    "height": 0.4
  },
  "rotation": 90,
  "block_size": 15,
  "threshold_c": 10
}
```

**Response (200):**
- `image/png` blob

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | validation error | Invalid request payload |
| 404 | `{"detail": "..."}` | Plan file not found |
| 500 | `{"detail": "..."}` | Mask preview generation failed |

### GET /reconstruction/reconstructions/{id}
Load reconstruction metadata for editor rehydration.

**Response (200):**
```json
{
  "id": 123,
  "name": "string | null",
  "url": "string | null",
  "preview_url": "string | null",
  "rooms_count": 0,
  "walls_count": 0,
  "created_at": "2026-03-31T00:00:00Z",
  "rotation_angle": 0
}
```

### GET /reconstruction/reconstructions/{id}/vectors
Load stored vectorization data, including crop and rotation metadata.

**Response (200):**
```json
{
  "crop_rect": {
    "x": 0.1,
    "y": 0.2,
    "width": 0.5,
    "height": 0.4
  },
  "rotation_angle": 90,
  "rooms": [
    {
      "id": "string",
      "name": "A101",
      "room_type": "room",
      "polygon": [
        { "x": 0.1, "y": 0.2 }
      ]
    }
  ],
  "doors": [
    {
      "id": "string",
      "position": { "x": 0.3, "y": 0.4 },
      "connects": ["string"]
    }
  ]
}
```

### PUT /reconstruction/reconstructions/{id}/vectors
Persist edited rooms and doors.

**Request:**
```json
{
  "crop_rect": {
    "x": 0.1,
    "y": 0.2,
    "width": 0.5,
    "height": 0.4
  },
  "rotation_angle": 90,
  "rooms": [
    {
      "id": "string",
      "name": "A101",
      "room_type": "room",
      "polygon": [
        { "x": 0.1, "y": 0.2 }
      ]
    }
  ],
  "doors": [
    {
      "id": "string",
      "position": { "x": 0.3, "y": 0.4 },
      "connects": ["string"]
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "Vectorization data updated"
}
```

### POST /reconstruction/nav-graph
Build a navigation graph from the shared geometry basis.

**Request:**
```json
{
  "mask_file_id": "string",
  "rooms": [],
  "doors": [],
  "scale_factor": 0.02
}
```

**Response (200):**
```json
{
  "graph_id": "string"
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 404 | `{"detail": "..."}` | Mask file missing |
| 500 | `{"detail": "Ошибка построения навигационного графа"}` | Graph generation fails |

## Contract Notes
- The current frontend uses `previewMask()` and `calculateMask()` with `cropRect` and `rotation` already serialized as `crop` + `rotation` in `frontend/src/api/apiService.ts:141-167`.
- `RoomAnnotation` and `DoorAnnotation` are transferred as normalized shapes from the editor and are later converted into payloads in `EditPlanPage.tsx:119-153`.
- Exact backend response schemas for `GET /reconstruction/reconstructions/{id}/vectors` and `PUT /reconstruction/reconstructions/{id}/vectors` need to be verified against the current Pydantic models before implementation.
