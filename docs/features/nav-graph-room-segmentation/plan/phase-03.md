# Phase 3: Написать тесты

phase: 3
layer: tests
depends_on: phase-01
design: ../04-testing.md

## Goal

Написать 8 тестов для новой реализации `extract_corridor_mask`
согласно `04-testing.md`.

## Context

Phase 1 заменила алгоритм `extract_corridor_mask`. Новая сигнатура:
```python
def extract_corridor_mask(
    wall_mask: np.ndarray,
    rooms: list[dict],
    mask_width: int,
    mask_height: int,
    wall_thickness_px: float,
    corridor_ratio: float = 1.5,
) -> np.ndarray:
```

## Files to Create / Modify

### `backend/tests/processing/test_nav_graph.py`

Если файл существует — добавить тесты. Если нет — создать.

**Импорты:**
```python
import numpy as np
import pytest
from app.processing.nav_graph import extract_corridor_mask
```

**8 тестов из 04-testing.md:**

1. `test_extract_corridor_mask_wide_corridor_included`
   — план с широким коридором (30px), wall_thickness=5 → corridor_pixels > 0

2. `test_extract_corridor_mask_narrow_passage_excluded`
   — план с узким проходом (3px), wall_thickness=5, corridor_ratio=1.5 → порог=7.5px → проход не попадает

3. `test_extract_corridor_mask_threshold_scales_with_wall_thickness`
   — два вызова с разными wall_thickness_px → результаты различаются

4. `test_extract_corridor_mask_zero_wall_thickness_uses_fallback`
   — wall_thickness_px=0.0 → не падает, возвращает ndarray

5. `test_extract_corridor_mask_empty_mask_returns_zeros`
   — wall_mask = np.zeros((100, 200), uint8) → результат = zeros

6. `test_extract_corridor_mask_rooms_subtracted`
   — комната покрывает центр коридора → пиксели под комнатой = 0
   — rooms используют нормализованные координаты [0,1]

7. `test_extract_corridor_mask_output_shape_matches_input`
   — result.shape == wall_mask.shape

8. `test_extract_corridor_mask_output_is_binary`
   — все значения в result ∈ {0, 255}

9. `test_extract_corridor_mask_all_components_touch_borders_uses_fallback`
   — маска без внутренних компонентов → fallback, не падает, возвращает ndarray

**Вспомогательная функция (в файле теста):**
```python
def _make_corridor_plan(
    width: int = 200, height: int = 100,
    wall_thickness: int = 5, corridor_width: int = 30,
) -> np.ndarray:
    """Горизонтальный коридор по центру. Стены=255, свободное=0."""
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[:wall_thickness, :] = 255
    mask[height - wall_thickness:, :] = 255
    return mask
```

## Verification

- [ ] `python -m pytest backend/tests/processing/test_nav_graph.py -v` — все тесты зелёные
- [ ] Тесты не используют БД, HTTP, файловую систему
