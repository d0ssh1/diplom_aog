# API Contract: Massive Stitching / Transition Points

## Endpoints

### POST /api/v1/transitions/groups

**Request:**
```json
{
  "building_id": 1,
  "type": "passage",
  "label": "Stair A"
}
```

**Response (201):**
```json
{
  "id": 10,
  "building_id": 1,
  "type": "passage",
  "label": "Stair A",
  "point_ids": [],
  "created_at": "2026-04-16T12:00:00Z"
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | {"detail": "..."} | Invalid request body |
| 401 | {"detail": "Unauthorized"} | Missing auth |

### GET /api/v1/transitions/groups?building_id={id}

**Response (200):**
```json
[
  {
    "id": 10,
    "building_id": 1,
    "type": "stairs",
    "label": "Main Stair",
    "point_ids": [101, 102],
    "created_at": "2026-04-16T12:00:00Z"
  }
]
```

### PATCH /api/v1/transitions/groups/{id}

**Request:**
```json
{
  "type": "elevator",
  "label": "Lift B"
}
```

**Response (200):**
```json
{
  "id": 10,
  "building_id": 1,
  "type": "elevator",
  "label": "Lift B",
  "point_ids": [101, 102],
  "created_at": "2026-04-16T12:00:00Z"
}
```

### DELETE /api/v1/transitions/groups/{id}

**Response (204):** no body

### POST /api/v1/transitions/points

**Request:**
```json
{
  "reconstruction_id": 42,
  "group_id": 10,
  "position_x": 0.25,
  "position_y": 0.66,
  "label": "top landing"
}
```

**Response (201):**
```json
{
  "id": 101,
  "reconstruction_id": 42,
  "group_id": 10,
  "position_x": 0.25,
  "position_y": 0.66,
  "label": "top landing",
  "snapped_node_id": "plan_42_corridor_7"
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | {"detail": "point out of reachable area"} | No reachable nav node within snap radius |
| 400 | {"detail": "..."} | Invalid coordinates or request body |
| 404 | {"detail": "..."} | Reconstruction or group not found |

### PATCH /api/v1/transitions/points/{id}

**Request:**
```json
{
  "position_x": 0.26,
  "position_y": 0.67,
  "label": "updated label"
}
```

**Response (200):**
```json
{
  "id": 101,
  "reconstruction_id": 42,
  "group_id": 10,
  "position_x": 0.26,
  "position_y": 0.67,
  "label": "updated label",
  "snapped_node_id": "plan_42_corridor_7"
}
```

### DELETE /api/v1/transitions/points/{id}

**Response (204):** no body

### GET /api/v1/transitions/reconstructions/{id}/points

**Response (200):**
```json
[
  {
    "id": 101,
    "reconstruction_id": 42,
    "group_id": 10,
    "position_x": 0.25,
    "position_y": 0.66,
    "label": "top landing",
    "snapped_node_id": "plan_42_corridor_7"
  }
]
```

### GET /api/v1/transitions/buildings/{id}/points

**Response (200):**
```json
[
  {
    "id": 101,
    "reconstruction_id": 42,
    "group_id": 10,
    "position_x": 0.25,
    "position_y": 0.66,
    "label": "top landing",
    "snapped_node_id": "plan_42_corridor_7"
  }
]
```

### POST /api/v1/navigation/route/multi

**Request:**
```json
{
  "from_reconstruction_id": 42,
  "from_room_id": "room_304",
  "to_reconstruction_id": 41,
  "to_room_id": "room_204"
}
```

**Response (200, success):**
```json
{
  "status": "success",
  "message": null,
  "total_distance_meters": 24.7,
  "segments": [
    {
      "reconstruction_id": 42,
      "reconstruction_name": "Building A - Floor 11",
      "floor_label": "Building A, floor 11",
      "coordinates": [[1.1, 0.0, 2.3], [1.7, 0.0, 3.0]],
      "transition_out_point_id": 101
    },
    {
      "reconstruction_id": 41,
      "reconstruction_name": "Building A - Floor 10",
      "floor_label": "Building A, floor 10",
      "coordinates": [[1.7, 0.0, 3.0], [2.5, 0.0, 4.2]],
      "transition_out_point_id": null
    }
  ]
}
```

**Response (200, no_path):**
```json
{
  "status": "no_path",
  "message": "No route found",
  "total_distance_meters": null,
  "segments": []
}
```

**Errors:**

| Status | Body | When |
|--------|------|------|
| 400 | {"detail": "..."} | Invalid request body or missing prerequisite graph |
| 401 | {"detail": "Unauthorized"} | Missing auth |

## Response Shape Rules
- All IDs are integers.
- Normalized coordinates are floats in `[0,1]`.
- Route geometry coordinates are arrays of three numbers `[x, y, z]`.
- `created_at` is an ISO 8601 string.
- `segments` is always present for multi-plan route responses.
