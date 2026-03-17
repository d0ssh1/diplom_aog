# Testing Strategy: 3d-builder-upgrade

## Test Rules
- AAA pattern (Arrange / Act / Assert) — `prompts/testing.md`
- Naming: `test_{что}_{условие}_{ожидаемый результат}`
- Processing тесты — только numpy/shapely/trimesh, без БД
- Service тесты — мокают репозиторий через `pytest-mock`
- Тестовые изображения — синтетические через numpy (не файлы)

## Test Structure

```
backend/tests/
├── processing/
│   └── test_mesh_generator.py      ← чистые функции
└── services/
    └── test_builder_3d.py          ← ReconstructionService.build_mesh (мок repo)
```

## Coverage Mapping

### Processing Function Coverage (`processing/mesh_generator.py`)

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| `contour_to_polygon()` | Валидный контур → Shapely Polygon | `test_contour_to_polygon_valid_contour_returns_polygon` |
| `contour_to_polygon()` | Менее 3 точек → None | `test_contour_to_polygon_too_few_points_returns_none` |
| `contour_to_polygon()` | Самопересекающийся → buffer(0) fix | `test_contour_to_polygon_self_intersecting_returns_valid` |
| `contours_to_polygons()` | Y-flip: OpenCV→3D координаты | `test_contours_to_polygons_y_flip_applied` |
| `contours_to_polygons()` | Пустой список → пустой список | `test_contours_to_polygons_empty_input_returns_empty` |
| `cut_door_opening()` | Ширина >= MIN_DOOR_WIDTH → Shapely box | `test_cut_door_opening_valid_width_returns_box` |
| `cut_door_opening()` | Ширина < MIN_DOOR_WIDTH → None | `test_cut_door_opening_too_narrow_returns_none` |
| `extrude_wall()` | Полигон → trimesh с заданной высотой | `test_extrude_wall_valid_polygon_returns_mesh` |
| `extrude_wall()` | Высота = floor_height | `test_extrude_wall_uses_provided_height` |
| `extrude_wall()` | Невалидный полигон → None | `test_extrude_wall_invalid_polygon_returns_none` |
| `build_floor_mesh()` | Полигон комнаты → плоский меш | `test_build_floor_mesh_room_polygon_returns_flat_mesh` |
| `build_floor_mesh()` | Меш на z=0 | `test_build_floor_mesh_z_offset_zero` |
| `build_ceiling_mesh()` | Прямоугольник на высоте floor_height | `test_build_ceiling_mesh_at_floor_height` |
| `assign_room_colors()` | corridor → синий цвет | `test_assign_room_colors_corridor_gets_blue` |
| `assign_room_colors()` | classroom → жёлтый цвет | `test_assign_room_colors_classroom_gets_yellow` |
| `assign_room_colors()` | Пустой список комнат → меш без изменений | `test_assign_room_colors_no_rooms_returns_unchanged` |
| `build_mesh_from_vectorization()` | VectorizationResult → trimesh.Trimesh | `test_build_mesh_from_vectorization_valid_result_returns_mesh` |
| `build_mesh_from_vectorization()` | Пустые walls → ImageProcessingError | `test_build_mesh_from_vectorization_empty_walls_raises_error` |
| `build_mesh_from_vectorization()` | Fallback если rooms пуст | `test_build_mesh_from_vectorization_no_rooms_uses_full_floor` |

### Service Coverage (`services/reconstruction_service.py`)

| Method | Scenario | Test Name |
|--------|----------|-----------|
| `build_mesh()` | Успешный pipeline → status=3 | `test_build_mesh_success_sets_status_3` |
| `build_mesh()` | Маска не найдена → status=4 | `test_build_mesh_mask_not_found_sets_status_4` |
| `build_mesh()` | `build_mesh_from_vectorization` бросает → status=4 | `test_build_mesh_processing_error_sets_status_4` |
| `build_mesh()` | Использует `DEFAULT_FLOOR_HEIGHT=3.0` | `test_build_mesh_uses_default_floor_height_3m` |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing (`test_mesh_generator.py`) | 19 |
| Service (`test_builder_3d.py`) | 4 |
| **TOTAL** | **23** |

## Fixtures

```python
# tests/processing/conftest.py — добавить:

@pytest.fixture
def simple_wall_contour() -> np.ndarray:
    """Прямоугольный контур 40x40 пикселей."""
    return np.array([[[10, 10]], [[50, 10]], [[50, 50]], [[10, 50]]], dtype=np.int32)

@pytest.fixture
def sample_vectorization_result() -> VectorizationResult:
    """Минимальный VectorizationResult с одной стеной и одной комнатой."""
    return VectorizationResult(
        walls=[Wall(id="w0", points=[Point2D(x=0.1, y=0.1), Point2D(x=0.9, y=0.1)], thickness=0.2)],
        rooms=[Room(id="r0", name="Аудитория 101", polygon=[...], room_type="classroom", ...)],
        doors=[],
        ...
    )
```
