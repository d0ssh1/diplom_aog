# API Contract: 3D Color API

## Endpoint: POST /api/v1/reconstruction/reconstructions

Generate 3D mesh from floor plan mask with optional custom wall color.

### Request

```json
{
  "plan_file_id": "uuid-string",
  "user_mask_file_id": "uuid-string",
  "wall_color": "#FF5733"
}
```

**Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `plan_file_id` | string (UUID) | Yes | ID of uploaded floor plan image | `"550e8400-e29b-41d4-a716-446655440000"` |
| `user_mask_file_id` | string (UUID) | Yes | ID of binarized mask image | `"550e8400-e29b-41d4-a716-446655440001"` |
| `wall_color` | string OR array | No | Wall color in hex (#RRGGBB or #RRGGBBAA) or RGBA array [R, G, B, A] | `"#FF5733"` or `[255, 87, 51, 255]` |

**Color Format Details:**

- **Hex string:** `"#RRGGBB"` (6 digits) or `"#RRGGBBAA"` (8 digits with alpha)
  - Example: `"#FF5733"` → RGB(255, 87, 51) with full opacity
  - Example: `"#FF573380"` → RGB(255, 87, 51) with 50% opacity (128/255)
  - Case-insensitive: `"#ff5733"` is valid
  - Whitespace stripped: `" #FF5733 "` is valid

- **RGBA array:** `[R, G, B, A]` where each value is 0-255
  - Example: `[255, 87, 51, 255]` → full opacity
  - Example: `[255, 87, 51, 128]` → 50% opacity
  - All values must be integers in range [0, 255]

- **Omitted:** If `wall_color` is not provided, defaults to `#4A4A4A` (dark grey)

### Response (201 Created)

```json
{
  "id": 123,
  "name": "",
  "status": 3,
  "status_display": "Готово",
  "created_at": "2026-03-20T14:30:00Z",
  "created_by": 1,
  "saved_at": null,
  "url": "/api/v1/uploads/models/123.glb",
  "error_message": null
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Reconstruction record ID |
| `name` | string | User-provided name (empty if not saved) |
| `status` | integer | Status code: 1=Created, 2=Processing, 3=Completed, 4=Error |
| `status_display` | string | Human-readable status in Russian |
| `created_at` | ISO 8601 datetime | When reconstruction was created |
| `created_by` | integer | User ID who created it |
| `saved_at` | ISO 8601 datetime OR null | When reconstruction was saved (null if not saved) |
| `url` | string | URL to download GLB model file |
| `error_message` | string OR null | Error details if status=4, otherwise null |

### Response (400 Bad Request)

Invalid color format:

```json
{
  "detail": "Invalid wall_color: expected #RRGGBB, #RRGGBBAA, or [R, G, B, A] array"
}
```

Invalid RGBA array:

```json
{
  "detail": "Invalid wall_color: RGBA values must be integers in range [0, 255]"
}
```

### Response (404 Not Found)

Mask file not found:

```json
{
  "detail": "Mask file not found"
}
```

### Response (500 Internal Server Error)

Mesh generation failed:

```json
{
  "detail": "Error building 3D model"
}
```

## Examples

### Example 1: Generate with Hex Color

**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/reconstruction/reconstructions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_mask_file_id": "550e8400-e29b-41d4-a716-446655440001",
    "wall_color": "#FF5733"
  }'
```

**Response (201):**
```json
{
  "id": 123,
  "name": "",
  "status": 3,
  "status_display": "Готово",
  "created_at": "2026-03-20T14:30:00Z",
  "created_by": 1,
  "url": "/api/v1/uploads/models/123.glb",
  "error_message": null
}
```

### Example 2: Generate with RGBA Array

**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/reconstruction/reconstructions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_mask_file_id": "550e8400-e29b-41d4-a716-446655440001",
    "wall_color": [100, 150, 200, 255]
  }'
```

**Response (201):** Same as Example 1

### Example 3: Generate with Default Color (Omit Parameter)

**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/reconstruction/reconstructions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_mask_file_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

**Response (201):** Mesh generated with default #4A4A4A color

### Example 4: Invalid Color Format

**Request:**
```bash
curl -X POST http://localhost:8000/api/v1/reconstruction/reconstructions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_mask_file_id": "550e8400-e29b-41d4-a716-446655440001",
    "wall_color": "INVALID"
  }'
```

**Response (400):**
```json
{
  "detail": "Invalid wall_color: expected #RRGGBB, #RRGGBBAA, or [R, G, B, A] array"
}
```
