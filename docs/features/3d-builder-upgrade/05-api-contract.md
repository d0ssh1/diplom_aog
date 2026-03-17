# API Contract: 3d-builder-upgrade

Новых эндпоинтов не добавляется. Изменяется только ответ существующего эндпоинта.

## Modified Endpoint

### GET /api/v1/reconstruction/reconstructions/{id}

Добавляется поле `room_labels` в ответ — список меток для overlay на фронте.

**Response (200) — было** (из `api/reconstruction.py:138-146`):
```json
{
  "id": 42,
  "name": "Корпус А, этаж 2",
  "status": 3,
  "status_display": "Готово",
  "created_at": "2026-03-14T08:00:00",
  "created_by": 1,
  "url": "/api/v1/uploads/models/reconstruction_42.glb"
}
```

**Response (200) — стало** (добавляется только `room_labels`):
```json
{
  "id": 42,
  "name": "Корпус А, этаж 2",
  "status": 3,
  "status_display": "Готово",
  "created_at": "2026-03-14T08:00:00",
  "created_by": 1,
  "url": "/api/v1/uploads/models/reconstruction_42.glb",
  "room_labels": [
    {
      "id": "r0",
      "name": "Аудитория 101",
      "room_type": "classroom",
      "center_x": 0.35,
      "center_y": 0.48,
      "color": "#f5c542"
    },
    {
      "id": "r1",
      "name": "Коридор",
      "room_type": "corridor",
      "center_x": 0.72,
      "center_y": 0.50,
      "color": "#4287f5"
    }
  ]
}
```

**Поля `room_labels[i]`:**

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | ID комнаты из VectorizationResult |
| `name` | `string` | Название комнаты (может быть пустым `""`) |
| `room_type` | `string` | `"classroom"` \| `"corridor"` \| `"staircase"` \| `"toilet"` \| `"other"` |
| `center_x` | `float` | Нормализованная X координата центра [0, 1] |
| `center_y` | `float` | Нормализованная Y координата центра [0, 1] |
| `color` | `string` | HEX цвет для overlay (#rrggbb) |

**Когда `room_labels` пуст:**
- `vectorization_data` в DB равен `null` (старые реконструкции)
- `rooms` список в VectorizationResult пуст
- В обоих случаях возвращается `"room_labels": []`

**Errors:**

| Status | Body | When |
|--------|------|------|
| 404 | `{"detail": "Reconstruction not found"}` | ID не существует |

## Pydantic модели (backend)

```python
# models/responses.py — добавить:

class RoomLabelResponse(BaseModel):
    id: str
    name: str
    room_type: str
    center_x: float
    center_y: float
    color: str

class CalculateMeshResponse(BaseModel):
    id: int
    name: Optional[str]
    status: int
    url: Optional[str]
    error_message: Optional[str]
    room_labels: List[RoomLabelResponse] = []
```

## TypeScript типы (frontend)

```typescript
// types/reconstruction.ts — добавить:

export interface RoomLabel {
  id: string;
  name: string;
  room_type: 'classroom' | 'corridor' | 'staircase' | 'toilet' | 'other';
  center_x: number;
  center_y: number;
  color: string;
}

export interface ReconstructionDetail {
  id: number;
  name: string | null;
  status: number;
  url: string | null;
  error_message: string | null;
  room_labels: RoomLabel[];
}
```
