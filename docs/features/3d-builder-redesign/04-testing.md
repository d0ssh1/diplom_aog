# Testing Strategy: 3D Builder Redesign

## Test Rules
- Processing тесты не используют БД — только numpy/trimesh (prompts/testing.md:116)
- AAA паттерн: Arrange → Act → Assert (prompts/testing.md:43)
- Именование: `test_{что}_{условие}_{ожидаемый результат}` (prompts/testing.md:34)
- Каждая новая функция в `processing/` → минимум 2 теста (prompts/testing.md:118)

## Test Structure

```
backend/tests/
└── processing/
    └── test_mesh_builder.py   ← новые тесты для _create_floor, _create_wall_cap
```

Существующие тесты для `build_mesh_from_mask` — не ломать.

## Coverage Mapping

### Processing Function Coverage

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| `_create_floor()` | Возвращает trimesh с 2 гранями и 4 вершинами | `test_create_floor_valid_dims_returns_quad` |
| `_create_floor()` | Vertex colors = FLOOR_COLOR для всех вершин | `test_create_floor_vertex_colors_match_floor_color` |
| `_create_floor()` | w_m=0 → возвращает None | `test_create_floor_zero_width_returns_none` |
| `_create_floor()` | h_m=0 → возвращает None | `test_create_floor_zero_height_returns_none` |
| `_create_wall_cap()` | Возвращает trimesh с корректными вершинами на высоте `height` | `test_create_wall_cap_valid_polygon_returns_mesh_at_height` |
| `_create_wall_cap()` | Vertex colors = WALL_CAP_COLOR | `test_create_wall_cap_vertex_colors_match_cap_color` |
| `_create_wall_cap()` | Невалидный полигон (<3 точек) → возвращает None | `test_create_wall_cap_invalid_polygon_returns_none` |
| `build_mesh_from_mask()` | Результат содержит вершины с WALL_SIDE_COLOR | `test_build_mesh_from_mask_wall_side_color_present` |
| `build_mesh_from_mask()` | Результат содержит вершины с WALL_CAP_COLOR | `test_build_mesh_from_mask_cap_color_present` |
| `build_mesh_from_mask()` | Результат содержит вершины с FLOOR_COLOR | `test_build_mesh_from_mask_floor_color_present` |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing (`test_mesh_builder.py`) | 9 |
| Service | 0 (нет изменений в логике) |
| API | 0 (нет изменений в эндпоинтах) |
| Frontend | 0 (визуальные изменения, не тестируются unit-тестами) |
| **TOTAL** | **9** |

## Test Fixtures

```python
# tests/processing/conftest.py — добавить:

@pytest.fixture
def simple_wall_mask() -> np.ndarray:
    """100x100 маска с прямоугольной стеной по периметру."""
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(mask, (10, 10), (90, 90), 255, thickness=5)
    return mask

@pytest.fixture
def square_polygon_coords():
    """Простой квадратный полигон 2x2 метра."""
    return [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)]
```

## Notes

- Frontend изменения (освещение, материалы) не покрываются unit-тестами — проверяются визуально
- `npx tsc --noEmit` проверяет TypeScript типы после изменений в `MeshViewer.tsx`
- Существующие тесты `test_mesh_builder.py` (если есть) должны продолжать проходить
