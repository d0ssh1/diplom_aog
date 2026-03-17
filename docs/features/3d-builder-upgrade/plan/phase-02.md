# Phase 2: New mesh_builder entry point

phase: 2
layer: processing
depends_on: phase-01
design: ../06-pipeline-spec.md, ../01-architecture.md

## Goal

Заменить `build_mesh(contours, w, h)` в `mesh_builder.py` на
`build_mesh_from_vectorization(vr, w, h)` — точку входа, которая принимает
`VectorizationResult` и возвращает `trimesh.Trimesh` с цветами и геометрией комнат.

## Context

Phase 1 создала чистые функции в `mesh_generator.py`:
`contour_to_polygon`, `contours_to_polygons`, `extrude_wall`,
`build_floor_mesh`, `build_floor_mesh_rect`, `build_ceiling_mesh`,
`cut_door_opening`, `assign_room_colors`.

## Files to Modify

### `backend/app/processing/mesh_builder.py`

**Что меняется:** Старая функция `build_mesh(contours, w, h)` остаётся для обратной
совместимости (используется в тестах), но добавляется новая основная функция.

**Добавить:**

```python
def build_mesh_from_vectorization(
    vr: VectorizationResult,
    image_width: int,
    image_height: int,
    floor_height: float = 3.0,
) -> trimesh.Trimesh:
    """
    Строит 3D-меш этажа из VectorizationResult.

    Args:
        vr: Результат векторизации с walls, rooms, doors.
        image_width: Ширина маски в пикселях (для денормализации).
        image_height: Высота маски в пикселях (для денормализации).
        floor_height: Высота этажа в метрах (default: settings.DEFAULT_FLOOR_HEIGHT).

    Returns:
        trimesh.Trimesh — объединённый меш с vertex colors. НЕ сохранён на диск.

    Raises:
        ImageProcessingError: если walls пуст или trimesh/shapely не установлены.
    """
```

**Алгоритм (см. 06-pipeline-spec.md):**

1. Проверить `vr.walls` — если пуст, `raise ImageProcessingError(...)`
2. Проверить импорты trimesh/shapely — если нет, `raise ImageProcessingError(...)`
3. `pixels_per_meter = vr.estimated_pixels_per_meter`
4. Денормализовать `wall.points` → numpy contours: `x * image_width`, `y * image_height`
5. `polygons = contours_to_polygons(contours, image_height, pixels_per_meter)`
6. Для каждого полигона: `extrude_wall(poly, floor_height)` → добавить в `meshes`
7. Если `vr.doors` не пуст: для каждой двери с `width > 0` вызвать `cut_door_opening()`
   и применить Shapely difference к ближайшей стене (при ошибке — пропустить)
8. Если `vr.rooms` не пуст: для каждой комнаты денормализовать `room.polygon` →
   `build_floor_mesh(room_polygon)` → добавить в `meshes`
9. Иначе: `build_floor_mesh_rect(w/ppm, h/ppm)` → добавить в `meshes`
10. `build_ceiling_mesh(w/ppm, h/ppm, floor_height)` → добавить в `meshes`
11. `combined = trimesh.util.concatenate(meshes)`
12. `combined = assign_room_colors(combined, vr.rooms, pixels_per_meter)`
13. Применить rotation matrix `-π/2` вокруг X (Z-up → Y-up для Three.js)
14. Вернуть `combined`

**Импорты добавить:**
```python
from app.models.domain import VectorizationResult
from app.processing.mesh_generator import (
    contours_to_polygons, extrude_wall, build_floor_mesh,
    build_floor_mesh_rect, build_ceiling_mesh, cut_door_opening, assign_room_colors,
)
```

## Verification
- [ ] `python -m py_compile backend/app/processing/mesh_builder.py` passes
- [ ] `python -m pytest backend/tests/processing/test_mesh_generator.py -k "build_mesh_from_vectorization" -v` — 3 теста green
- [ ] Функция не делает file I/O, не обращается к БД
- [ ] `floor_height` default = 3.0 (не 1.5)
