# API Contract: edit-plan-restore

## Endpoints

### GET /api/v1/reconstruction/reconstructions/{id}/vectors

Returns stored vectorization data for a reconstruction.

**Response (200):**
```json
{
  "rooms": [
    {
      "id": "string",
      "name": "string",
      "room_type": "room | staircase | elevator | corridor",
      "center": {
        "x": 0.0,
        "y": 0.0
      },
      "polygon": [
        { "x": 0.0, "y": 0.0 },
        { "x": 0.5, "y": 0.0 },
        { "x": 0.5, "y": 0.5 },
        { "x": 0.0, "y": 0.5 }
      ],
      "area_normalized": 0.25
    }
  ],
  "doors": [
    {
      "id": "string",
      "position": { "x": 0.1, "y": 0.2 },
      "width": 0.05,
      "connects": ["string"]
    }
  ],
  "rotation_angle": 0,
  "crop_rect": {
    "x": 0.0,
    "y": 0.0,
    "width": 1.0,
    "height": 1.0
  }
}
```

### PUT /api/v1/reconstruction/reconstructions/{id}/vectors

Persists updated vectorization data.

**Request:**
```json
{
  "rooms": [
    {
      "id": "string",
      "name": "string",
      "room_type": "room | staircase | elevator | corridor",
      "center": {
        "x": 0.0,
        "y": 0.0
      },
      "polygon": [
        { "x": 0.0, "y": 0.0 },
        { "x": 0.5, "y": 0.0 },
        { "x": 0.5, "y": 0.5 },
        { "x": 0.0, "y": 0.5 }
      ],
      "area_normalized": 0.25
    }
  ],
  "doors": [
    {
      "id": "string",
      "position": { "x": 0.1, "y": 0.2 },
      "width": 0.05,
      "connects": ["string"]
    }
  ]
}
```

**Response (200):**
```json
{
  "id": 123,
  "status": 3,
  "vectorization_data": "..."
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | {"detail": "..."} | Payload does not match schema |
| 404 | {"detail": "..."} | Reconstruction not found |
| 500 | {"detail": "..."} | Database or serialization failure |

## Contract Notes
- `polygon` is the canonical room geometry field for edit-plan restore/save.
- `center` is required for compatibility with existing downstream consumers.
- Legacy records that lack `polygon` may still be read, but new saves should not remove it.
