# Phase 1: Заменить алгоритм `extract_corridor_mask`

phase: 1
layer: processing
depends_on: none
design: ../README.md

## Goal

Заменить тело `extract_corridor_mask` в `processing/nav_graph.py:15-141`:
вместо дилатации стен использовать `distanceTransform` свободного пространства
с адаптивным порогом `corridor_ratio * wall_thickness_px`.

## Files to Modify

### `backend/app/processing/nav_graph.py` (lines 15-141)

**Новая сигнатура:**
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

**Убрать параметры:** `dilate_kernel_size: int = 7`, `dilate_iterations: int = 2`

**Алгоритм (см. 06-pipeline-spec.md):**

1. `free_space = cv2.bitwise_not(wall_mask)`
2. `dist = cv2.distanceTransform(free_space, cv2.DIST_L2, 5)`
3. `corridor_threshold = max(MIN_CORRIDOR_PX, corridor_ratio * wall_thickness_px)`
   — если `wall_thickness_px <= 0`: логировать warning, использовать `MIN_CORRIDOR_PX = 3.0`
4. `wide_passage = (dist >= corridor_threshold).astype(np.uint8) * 255`
5. `connectedComponentsWithStats(wide_passage)` → выбрать крупнейший внутренний компонент
   (не касается границ, < 50% площади) — логика выбора компонента из текущей реализации
   сохраняется полностью (lines 52-108 текущего кода)
6. `dilate_px = max(1, min(int(wall_thickness_px), 30))`
   `corridor_expanded = cv2.dilate(corridor_rough, np.ones((dilate_px, dilate_px)))`
   `corridor_mask = cv2.bitwise_and(free_space, corridor_expanded)`
7. Вычесть комнаты (логика из lines 118-128 текущего кода — сохраняется без изменений)

**Логирование** — сохранить `logger.info(...)` с диагностикой: порог, площадь, время.

## Verification

- [ ] `python -m py_compile backend/app/processing/nav_graph.py`
- [ ] Функция является чистой — нет импортов из `api/` или `db/`
- [ ] Параметры `dilate_kernel_size` / `dilate_iterations` удалены из сигнатуры
