# Phase 4: Extend API response with room_labels

phase: 4
layer: api
depends_on: phase-03
design: ../05-api-contract.md

## Goal

Добавить `RoomLabelResponse` и `room_labels: List[RoomLabelResponse]` в `CalculateMeshResponse`.
Обновить все места в `api/reconstruction.py`, где конструируется `CalculateMeshResponse`,
чтобы они передавали `room_labels`.

## Context

Phase 3 добавила `ReconstructionService.get_room_labels(vr)` — статический метод,
возвращающий `list[dict]` с полями `id, name, room_type, center_x, center_y, color`.

## Files to Modify

### `backend/app/models/__init__.py` (или где определён `CalculateMeshResponse`)

Найти определение `CalculateMeshResponse` и добавить:

```python
class RoomLabelResponse(BaseModel):
    id: str
    name: str
    room_type: str
    center_x: float
    center_y: float
    color: str

class CalculateMeshResponse(BaseModel):
    # ... существующие поля без изменений ...
    room_labels: List[RoomLabelResponse] = []
```

### `backend/app/api/reconstruction.py`

**GET `/reconstructions/{id}` (строки ~130-146):**

```python
# Добавить загрузку VectorizationResult и room_labels:
vr = await svc.get_vectorization_data(id)
room_labels = ReconstructionService.get_room_labels(vr)

return CalculateMeshResponse(
    id=reconstruction.id,
    name=reconstruction.name or "",
    status=reconstruction.status,
    status_display=svc.get_status_display(reconstruction.status),
    created_at=reconstruction.created_at,
    created_by=reconstruction.created_by or 1,
    url=svc.build_mesh_url(reconstruction),
    room_labels=[RoomLabelResponse(**r) for r in room_labels],
)
```

**POST `/reconstructions` (~строки 84-108):** добавить `room_labels=[]` (пустой список,
т.к. модель только что создана и ещё строится).

**Все остальные места** где конструируется `CalculateMeshResponse` — добавить `room_labels=[]`.

**Импорты добавить:**
```python
from app.models import RoomLabelResponse
```

## Verification
- [ ] `python -m py_compile backend/app/api/reconstruction.py` passes
- [ ] `python -m pytest backend/tests/api/ -v -k "reconstruction"` — существующие тесты green
- [ ] `GET /api/v1/reconstruction/reconstructions/{id}` возвращает поле `room_labels`
- [ ] Для реконструкции без `vectorization_data` — `room_labels: []` (не ошибка)
