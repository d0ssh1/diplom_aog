# API Contract: user-floor-viewer

Фича меняет **auth-режим** одного эндпоинта; форма ответа не меняется. Для второго эндпоинта только фиксируем существующий контракт как baseline.

---

## GET /api/v1/buildings

**Query:**

| Param | Type | Default | Description |
|---|---|---|---|
| `published` | bool | `false` | `true` — публичный режим (auth НЕ требуется); `false` — admin-режим (auth обязателен) |

**Headers:**

| Header | When required |
|---|---|
| `Authorization: Bearer <token>` | Обязателен при `published=false` (или отсутствии параметра). При `published=true` — допустим, но игнорируется. |

### Response 200 — `published=true`

Тип: `PublicBuilding[]` (см. [frontend/src/types/hierarchy.ts:82](frontend/src/types/hierarchy.ts:82)).

```json
[
  {
    "id": 1,
    "code": "D",
    "name": "Корпус D",
    "floors": [
      {
        "id": 12,
        "number": 7,
        "schema_image_url": "/api/v1/uploads/floor_schemas/12.png",
        "schema_crop_bbox": [0.05, 0.1, 0.95, 0.9],
        "wall_polygons": [[[0.1, 0.2], [0.3, 0.2], [0.3, 0.4], [0.1, 0.4]]],
        "sections": [
          {
            "id": 101,
            "number": 4,
            "geometry": { "points": [[0.1,0.1],[0.4,0.1],[0.4,0.4],[0.1,0.4]] },
            "reconstruction_id": 42,
            "mesh_url_glb": "/api/v1/uploads/models/reconstruction_42.glb",
            "section_type": 1
          }
        ]
      }
    ]
  }
]
```

### Response 200 — `published=false`

Тип: `Building[]` (admin) — существующий ответ `BuildingResponse[]` без изменений.

### Errors

| Status | Body | When |
|---|---|---|
| 401 | `{"detail":"Not authenticated"}` | `published=false` без валидного `Authorization` |
| 401 | `{"detail":"Invalid token"}` | `published=false` с битым токеном |
| 500 | `{"detail":"Internal server error"}` | Сбой `list_published()` |

**Изменение vs текущий контракт:** убран обязательный `401` для `published=true` без `Authorization`. Поля ответа не меняются — фронт `buildingsApi.listPublished()` совместим.

---

## POST /api/v1/navigation/multifloor-route

**Auth:** не требуется (уже публичный, см. [navigation.py:19-24](backend/app/api/navigation.py:19) — нет `Depends(security)`). Контракт фиксируется как baseline.

**Request:**

```json
{
  "building_id": 1,
  "from_reconstruction_id": 42,
  "from_room_id": "304",
  "to_reconstruction_id": 57,
  "to_room_id": "712"
}
```

Поля Pydantic (точные имена сверять при имплементации с [models/transitions.py](backend/app/models/transitions.py) или эквивалентом — research упоминал тип `MultifloorRouteRequest`).

**Response 200:**

```json
{
  "status": "success",
  "total_distance_meters": 142.5,
  "estimated_time_seconds": 95,
  "path_segments": [
    {
      "reconstruction_id": 42,
      "floor_number": 4,
      "coordinates_3d": [[1.2, 0.0, 3.4], [1.5, 0.0, 3.8]]
    }
  ],
  "transitions_used": [
    { "from_floor": 4, "to_floor": 7, "type": "stairs", "position_3d": [2.0, 0.0, 5.0] }
  ],
  "from_room_3d": { "position": [1.2, 0.0, 3.4], "size": [2.0, 2.5, 1.5], "name": "304" },
  "to_room_3d": { "position": [4.5, 0.0, 8.0], "size": [2.0, 2.5, 1.5], "name": "712" },
  "message": null
}
```

**Errors:**

| Status | Body | When |
|---|---|---|
| 200 | `{"status":"no_path", "message":"...", "path_segments":[], ...}` | Алгоритм отработал, но путь не найден |
| 404 | `{"detail":"Room ... not found"}` | Некорректный `room_id` |
| 400 | `{"detail":"..."}` | Невалидный body |
| 500 | `{"detail":"..."}` | Сбой графа/процессинга |

**Изменений нет.** Контракт фиксируется здесь, чтобы фронт-индекс комнат (фаза 2 ADR-3) использовал корректные id.
