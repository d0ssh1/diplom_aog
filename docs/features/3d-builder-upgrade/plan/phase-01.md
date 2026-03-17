# Phase 1: Refactor mesh_generator to pure functions

phase: 1
layer: processing
depends_on: none
design: ../01-architecture.md, ../06-pipeline-spec.md

## Goal

Заменить класс `MeshGeneratorService` в `processing/mesh_generator.py` на набор
чистых функций. Убрать состояние (`_mesh_id`, `output_dir`). Добавить новые функции:
`build_floor_mesh`, `build_ceiling_mesh`, `cut_door_opening`, `assign_room_colors`.

## Files to Create

### `backend/app/processing/mesh_generator.py` (полная замена)

**Purpose:** Чистые функции генерации 3D геометрии. Нет классов, нет состояния, нет импортов из `api/`, `services/`, `db/`.

**Функции для реализации:**

```python
def contour_to_polygon(contour: np.ndarray, scale: float = 1.0) -> Optional[Polygon]
```
- Принимает OpenCV контур (Nx1x2 или Nx2), масштабирует, возвращает Shapely Polygon
- Менее 3 точек → `None`
- Невалидный полигон → `poly.buffer(0)`, если всё ещё невалидный → `None`

```python
def contours_to_polygons(contours: List[np.ndarray], image_height: int, pixels_per_meter: float) -> List[Polygon]
```
- Batch-конвертация с Y-flip: `y_flipped = (image_height / pixels_per_meter) - y`
- Обрабатывает Polygon и MultiPolygon
- Невалидные пропускаются (logger.debug)

```python
def extrude_wall(polygon: Polygon, height: float) -> Optional[trimesh.Trimesh]
```
- `trimesh.creation.extrude_polygon(polygon, height=height)`
- При исключении → `None` (logger.debug)

```python
def build_floor_mesh(polygon: Polygon, z_offset: float = 0.0) -> Optional[trimesh.Trimesh]
```
- Экструзия полигона комнаты на толщину 0.05 м (тонкая плита пола)
- `z_offset` — вертикальное смещение (0.0 для пола)

```python
def build_floor_mesh_rect(width: float, depth: float, z_offset: float = 0.0) -> trimesh.Trimesh
```
- Fallback: прямоугольный пол `trimesh.creation.box([width, depth, 0.05])`
- Центрируется по `[width/2, depth/2, z_offset]`

```python
def build_ceiling_mesh(width: float, depth: float, z_offset: float) -> trimesh.Trimesh
```
- Прямоугольный потолок `trimesh.creation.box([width, depth, 0.05])`
- Центрируется по `[width/2, depth/2, z_offset]`

```python
def cut_door_opening(
    position: tuple[float, float],  # (x, y) в метрах
    width_m: float,
    height: float,
    pixels_per_meter: float,
) -> Optional[Polygon]
```
- Возвращает Shapely `box(cx - w/2, 0, cx + w/2, height)` — прямоугольник проёма
- Если `width_m < MIN_DOOR_WIDTH (0.3)` → `None`

```python
ROOM_COLORS: dict[str, list[int]] = {
    "classroom":  [245, 197, 66,  255],
    "corridor":   [66,  135, 245, 255],
    "staircase":  [245, 66,  66,  255],
    "toilet":     [66,  245, 200, 255],
    "other":      [200, 200, 200, 255],
    "room":       [200, 200, 200, 255],  # legacy default
}

def assign_room_colors(mesh: trimesh.Trimesh, rooms: list, pixels_per_meter: float) -> trimesh.Trimesh
```
- Назначает vertex colors по `room_type` через `ROOM_COLORS`
- Если `rooms` пуст → возвращает меш без изменений
- Стены получают цвет `[74, 74, 74, 255]` (тёмно-серый `#4a4a4a`)
- Пол без комнаты — `[245, 240, 232, 255]` (бежевый `#f5f0e8`)

**Константы модуля:**
```python
MIN_DOOR_WIDTH = 0.3  # метры
WALL_COLOR = [74, 74, 74, 255]
DEFAULT_FLOOR_COLOR = [245, 240, 232, 255]
```

**Что удалить:**
- Класс `MeshGeneratorService` целиком
- `MeshExportResult` dataclass (экспорт — ответственность сервиса)
- `process_plan_image()` метод
- `export_mesh()` метод
- `if __name__ == "__main__"` блок

### `backend/tests/processing/test_mesh_generator.py` (новый файл)

**Tests from 04-testing.md:**
- `test_contour_to_polygon_valid_contour_returns_polygon`
- `test_contour_to_polygon_too_few_points_returns_none`
- `test_contour_to_polygon_self_intersecting_returns_valid`
- `test_contours_to_polygons_y_flip_applied`
- `test_contours_to_polygons_empty_input_returns_empty`
- `test_extrude_wall_valid_polygon_returns_mesh`
- `test_extrude_wall_uses_provided_height`
- `test_extrude_wall_invalid_polygon_returns_none`
- `test_build_floor_mesh_room_polygon_returns_flat_mesh`
- `test_build_floor_mesh_z_offset_zero`
- `test_build_ceiling_mesh_at_floor_height`
- `test_assign_room_colors_corridor_gets_blue`
- `test_assign_room_colors_classroom_gets_yellow`
- `test_assign_room_colors_no_rooms_returns_unchanged`
- `test_cut_door_opening_valid_width_returns_box`
- `test_cut_door_opening_too_narrow_returns_none`
- `test_build_mesh_from_vectorization_valid_result_returns_mesh` ← из mesh_builder (фаза 2), добавить сюда
- `test_build_mesh_from_vectorization_empty_walls_raises_error`
- `test_build_mesh_from_vectorization_no_rooms_uses_full_floor`

**Fixtures (добавить в `tests/processing/conftest.py`):**
```python
@pytest.fixture
def simple_wall_contour() -> np.ndarray:
    return np.array([[[10,10]],[[50,10]],[[50,50]],[[10,50]]], dtype=np.int32)

@pytest.fixture
def sample_vectorization_result() -> VectorizationResult:
    # минимальный VR с одной стеной и одной комнатой
```

## Verification
- [ ] `python -m py_compile backend/app/processing/mesh_generator.py` passes
- [ ] `python -m pytest backend/tests/processing/test_mesh_generator.py -v` — 19 тестов green
- [ ] `flake8 backend/app/processing/mesh_generator.py --max-line-length=100` clean
- [ ] Нет импортов из `app.api`, `app.services`, `app.db` в mesh_generator.py
