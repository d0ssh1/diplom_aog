# Testing Strategy: nav-graph-room-segmentation

## Test Rules
- AAA pattern (Arrange / Act / Assert)
- Именование: `test_{что}_{условие}_{ожидаемый результат}`
- Processing тесты не используют БД — только numpy/cv2
- Тестовые изображения создаются программно через вспомогательные функции

## Test Structure

```
backend/tests/
└── processing/
    └── test_nav_graph.py   ← новые тесты + существующие (если есть)
```

## Coverage Mapping

### Processing Function Coverage — `extract_corridor_mask`

| Функция | Бизнес-правило | Тест |
|---------|---------------|------|
| `extract_corridor_mask` | Широкий проход (> порога) попадает в маску | `test_extract_corridor_mask_wide_corridor_included` |
| `extract_corridor_mask` | Узкий проход (< порога) не попадает в маску | `test_extract_corridor_mask_narrow_passage_excluded` |
| `extract_corridor_mask` | Адаптивный порог масштабируется с `wall_thickness_px` | `test_extract_corridor_mask_threshold_scales_with_wall_thickness` |
| `extract_corridor_mask` | `wall_thickness_px = 0` → fallback порог, не падает | `test_extract_corridor_mask_zero_wall_thickness_uses_fallback` |
| `extract_corridor_mask` | Пустая маска → возвращает zeros, не падает | `test_extract_corridor_mask_empty_mask_returns_zeros` |
| `extract_corridor_mask` | Комнаты вычитаются из результата | `test_extract_corridor_mask_rooms_subtracted` |
| `extract_corridor_mask` | Возвращает ndarray той же формы, что вход | `test_extract_corridor_mask_output_shape_matches_input` |
| `extract_corridor_mask` | Значения только 0 или 255 | `test_extract_corridor_mask_output_is_binary` |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing (`test_nav_graph.py`) | 8 |
| Service | 0 (nav_service не меняет логику, только передаёт параметр) |
| API | 0 (API контракт не меняется) |
| **TOTAL** | **8** |

## Test Fixtures

```python
# tests/processing/conftest.py (добавить или использовать существующие)

def make_corridor_plan(
    width: int = 200,
    height: int = 100,
    wall_thickness: int = 5,
    corridor_width: int = 30,
) -> tuple[np.ndarray, float]:
    """
    Синтетический план: горизонтальный коридор по центру.
    Возвращает (wall_mask, wall_thickness_px).
    wall_mask: uint8, стены=255, свободное=0
    """
    mask = np.zeros((height, width), dtype=np.uint8)
    # Верхняя стена
    mask[:wall_thickness, :] = 255
    # Нижняя стена
    mask[height - wall_thickness:, :] = 255
    # Боковые стены с дверным проёмом (узкий проход)
    mid = width // 2
    mask[:, mid:mid + wall_thickness] = 255
    # Оставить проём шириной 3px (меньше порога)
    mask[height//2 - 1:height//2 + 2, mid:mid + wall_thickness] = 0
    return mask, float(wall_thickness)
```

## Пример теста

```python
def test_extract_corridor_mask_wide_corridor_included():
    # Arrange
    wall_mask = np.zeros((100, 200), dtype=np.uint8)
    wall_mask[:5, :] = 255   # верхняя стена (5px)
    wall_mask[95:, :] = 255  # нижняя стена (5px)
    wall_thickness_px = 5.0
    rooms = []

    # Act
    result = extract_corridor_mask(wall_mask, rooms, 200, 100, wall_thickness_px)

    # Assert
    corridor_pixels = np.sum(result > 0)
    assert corridor_pixels > 0, "Широкий коридор должен быть выделен"
    assert result.shape == wall_mask.shape
    assert result.dtype == np.uint8


def test_extract_corridor_mask_zero_wall_thickness_uses_fallback():
    # Arrange
    wall_mask = np.zeros((100, 200), dtype=np.uint8)
    wall_mask[:5, :] = 255

    # Act — не должно падать
    result = extract_corridor_mask(wall_mask, [], 200, 100, wall_thickness_px=0.0)

    # Assert
    assert result is not None
    assert result.shape == wall_mask.shape
```
