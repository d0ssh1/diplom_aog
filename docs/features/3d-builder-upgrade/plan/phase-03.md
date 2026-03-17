# Phase 3: Update ReconstructionService

phase: 3
layer: service
depends_on: phase-02
design: ../02-behavior.md, ../06-pipeline-spec.md

## Goal

Заменить в `ReconstructionService.build_mesh()` вызов `find_contours() → build_mesh(contours)`
на `build_mesh_from_vectorization(vr, w, h, floor_height=settings.DEFAULT_FLOOR_HEIGHT)`.
Добавить метод `get_room_labels()` для формирования меток комнат из `VectorizationResult`.

## Context

Phase 2 создала `build_mesh_from_vectorization(vr, w, h, floor_height)` в `mesh_builder.py`.
Phase 1 создала чистые функции в `mesh_generator.py`.
`VectorizationResult` уже вычисляется и сохраняется в DB в строках 151-172 сервиса.

## Files to Modify

### `backend/app/services/reconstruction_service.py`

**Что меняется:**

1. Строки 175-176 — заменить:
```python
# БЫЛО:
contours = find_contours(mask_array)
mesh = build_mesh(contours, w, h)

# СТАЛО:
from app.core.config import settings
mesh = build_mesh_from_vectorization(
    vectorization_result, w, h,
    floor_height=settings.DEFAULT_FLOOR_HEIGHT,
)
```

2. Импорт — заменить `from app.processing.mesh_builder import build_mesh` на
   `from app.processing.mesh_builder import build_mesh_from_vectorization`

3. Удалить импорт `from app.processing.vectorizer import find_contours`
   (больше не нужен в этом методе)

4. Добавить статический метод `get_room_labels()`:
```python
@staticmethod
def get_room_labels(vr: Optional[VectorizationResult]) -> list[dict]:
    """Формирует список меток комнат для API ответа."""
    if not vr or not vr.rooms:
        return []
    colors = {
        "classroom": "#f5c542", "corridor": "#4287f5",
        "staircase": "#f54242", "toilet": "#42f5c8",
        "other": "#c8c8c8", "room": "#c8c8c8",
    }
    return [
        {
            "id": room.id,
            "name": room.name,
            "room_type": room.room_type,
            "center_x": room.center.x,
            "center_y": room.center.y,
            "color": colors.get(room.room_type, "#c8c8c8"),
        }
        for room in vr.rooms
    ]
```

### `backend/tests/services/test_builder_3d.py` (новый файл)

**Tests from 04-testing.md:**
- `test_build_mesh_success_sets_status_3` — мок repo + мок build_mesh_from_vectorization
- `test_build_mesh_mask_not_found_sets_status_4` — FileStorageError → status=4
- `test_build_mesh_processing_error_sets_status_4` — ImageProcessingError → status=4
- `test_build_mesh_uses_default_floor_height_3m` — проверить что вызов идёт с floor_height=3.0

**Паттерн:**
```python
@pytest.mark.asyncio
async def test_build_mesh_success_sets_status_3(mocker):
    # Arrange
    mock_repo = mocker.AsyncMock(spec=ReconstructionRepository)
    mock_repo.create_reconstruction.return_value = Reconstruction(id=1, status=2)
    mock_repo.update_mesh.return_value = Reconstruction(id=1, status=3)
    mocker.patch("app.processing.mesh_builder.build_mesh_from_vectorization",
                 return_value=mocker.MagicMock())  # fake trimesh
    # ... setup mask file mock
    svc = ReconstructionService(repo=mock_repo, upload_dir="/tmp/test")

    # Act
    result = await svc.build_mesh("plan_id", "mask_id", user_id=1)

    # Assert
    assert result.status == 3
```

## Verification
- [ ] `python -m py_compile backend/app/services/reconstruction_service.py` passes
- [ ] `python -m pytest backend/tests/services/test_builder_3d.py -v` — 4 теста green
- [ ] `find_contours` больше не импортируется в reconstruction_service.py для mesh build
- [ ] `floor_height` передаётся из `settings.DEFAULT_FLOOR_HEIGHT` (3.0, не 1.5)
