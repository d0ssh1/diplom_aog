# Pipeline Specification: nav-graph-room-segmentation

## Where in the Pipeline

```
[1] Preprocessing → [2] Text Removal → [3] Wall Vectorization
    → [4] FloorPlan Assembly → [5] 3D Build
    → [NAV-1] extract_corridor_mask  ← ЭТОТ ШАГ (заменяется)
    → [NAV-2] build_skeleton
    → [NAV-3] build_topology_graph
    → [NAV-4] prune_dendrites + integrate_semantics
    → [NAV-5] serialize_nav_graph
```

## Input / Output

**Input:**
- `wall_mask: np.ndarray` — бинарная маска стен (H, W), dtype=uint8, стены=255, фон=0
- `rooms: list[dict]` — список комнат с полями `x, y, width, height` (нормализованные [0,1]), `room_type`
- `mask_width: int`, `mask_height: int` — размеры маски в пикселях
- `wall_thickness_px: float` — медианная толщина стен в пикселях (из `compute_wall_thickness`)
- `corridor_ratio: float = 1.5` — коэффициент k: порог = k * wall_thickness_px

**Output:** `np.ndarray` — бинарная маска коридоров (H, W), dtype=uint8, коридор=255, остальное=0

## Algorithm

```
1. free_space = bitwise_not(wall_mask)
   → uint8 (H, W): свободное пространство = 255

2. dist = distanceTransform(free_space, DIST_L2, 5)
   → float32 (H, W): каждый пиксель = расстояние до ближайшей стены

3. corridor_threshold = max(MIN_CORRIDOR_PX, corridor_ratio * wall_thickness_px)
   где MIN_CORRIDOR_PX = 3.0  ← защита от нулевого порога

4. wide_passage = (dist >= corridor_threshold).astype(uint8) * 255
   → пиксели, достаточно далёкие от стен = «широкие проходы»

5. connectedComponentsWithStats(wide_passage, connectivity=8)
   → border_labels = компоненты, касающиеся краёв изображения (= экстерьер)
   → выбрать крупнейший компонент, НЕ входящий в border_labels И < 50% площади
   → fallback: если все компоненты в border_labels — взять крупнейший не-экстерьерный
     (экстерьер = самый большой border-компонент)
   → corridor_rough (грубая маска)

6. dilate_px = max(1, min(int(wall_thickness_px), MAX_DILATE_PX=30))
   dilate_kernel = ones((dilate_px, dilate_px))
   corridor_expanded = dilate(corridor_rough, dilate_kernel)
   corridor_mask = bitwise_and(free_space, corridor_expanded)
   → восстанавливаем полную ширину коридора (distanceTransform даёт только центр)

7. Вычесть размеченные комнаты (room_type in {'room', 'staircase', 'elevator'})
   → финальная corridor_mask
```

## Parameters

| Параметр | Тип | Default | Описание |
|----------|-----|---------|----------|
| `wall_thickness_px` | float | — (обязательный) | Медианная толщина стен, из `compute_wall_thickness` |
| `corridor_ratio` | float | 1.5 | Коэффициент: порог = corridor_ratio × wall_thickness_px |
| `MIN_CORRIDOR_PX` | float | 3.0 | Минимальный порог (константа внутри функции) |
| `MAX_DILATE_PX` | int | 30 | Верхняя граница ядра дилатации (защита от толстых стен) |

## Сравнение с текущим алгоритмом

| Аспект | Текущий (дилатация) | Новый (distanceTransform) |
|--------|--------------------|-----------------------------|
| Параметры | `kernel=7, iter=2` — фиксированные | `corridor_ratio=1.5` — адаптивный |
| Масштабируемость | Нет — зависит от DPI плана | Да — порог = f(wall_thickness_px) |
| Физический смысл | Косвенный (закрыть двери) | Прямой (ширина прохода в px) |
| Сложность | O(H×W) | O(H×W) — то же |

## Error Handling

| Условие | Поведение |
|---------|-----------|
| `wall_mask` пустой или None | `ImageProcessingError("[extract_corridor_mask] Empty mask")` |
| `wall_mask.dtype != uint8` | `ImageProcessingError("[extract_corridor_mask] Expected uint8, got {dtype}")` |
| `wall_thickness_px <= 0` | Логируется warning, используется `MIN_CORRIDOR_PX` |
| Нет широких проходов (все пиксели < порога) | Возвращается `np.zeros_like(wall_mask)`, логируется warning |
| Все компоненты касаются границ | Fallback: крупнейший не-экстерьерный (поведение из текущей реализации) |
