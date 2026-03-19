# Research: nav-graph-room-segmentation
date: 2026-03-19

## Summary

Текущий `extract_corridor_mask` (`nav_graph.py:15`) использует дилатацию стен (7×7, iter=2, ~14px) для закрытия дверных проёмов, после чего ищет самый большой внутренний connected component. Проблема: на реальных планах дверные проёмы шире 14px, либо дилатация сливает весь интерьер в один blob — тогда "самый большой внутренний компонент" = весь этаж, и коридор не выделяется.

Данные distance transform (из предыдущего анализа): медиана = 19px, p25 = 8.6px. Дверные проёмы — узкие места (dist < 8–10px). Коридор — широкое пространство (dist > 15px). Это означает, что distance transform позволяет надёжно отделить коридор от комнат без дилатации.

Существующий код `compute_wall_thickness` (`pipeline.py:569`) уже использует `cv2.distanceTransform` на маске стен. Аналогичный подход применим к свободному пространству: `distanceTransform(free_space)` даёт карту расстояний до ближайшей стены — высокие значения = широкие проходы (коридор), низкие = узкие (дверные проёмы, углы комнат).

## Architecture — Current State

### Backend Structure

- `backend/app/processing/nav_graph.py:15` — `extract_corridor_mask(wall_mask, rooms, mask_width, mask_height, dilate_kernel_size=7, dilate_iterations=2)` — текущая реализация через дилатацию
- `backend/app/processing/nav_graph.py:144` — `build_skeleton(corridor_mask)` — binary_closing + skeletonize (skimage)
- `backend/app/processing/nav_graph.py:159` — `build_topology_graph(skeleton)` — sknw → NetworkX граф
- `backend/app/processing/nav_graph.py:198` — `prune_dendrites(G, min_branch_length=20.0)`
- `backend/app/processing/nav_graph.py:230` — `integrate_semantics(G, rooms, doors, mask_width, mask_height)`
- `backend/app/processing/pipeline.py:569` — `compute_wall_thickness(binary_mask)` — использует `cv2.distanceTransform` на маске стен → медиана ненулевых значений
- `backend/app/services/nav_service.py:41` — `NavService.build_graph()` — вызывает `extract_corridor_mask` с дефолтными параметрами
- `backend/tests/processing/test_nav_graph.py:19` — 13 тестов, все pass

### Текущий алгоритм extract_corridor_mask (проблемный)

```
1. free_space = bitwise_not(wall_mask)
2. dilated_walls = dilate(wall_mask, 7×7, iter=2)   ← закрывает проёмы ≤14px
3. closed_free = bitwise_not(dilated_walls)
4. connectedComponentsWithStats(closed_free)
5. Исключить border-компоненты (экстерьер)
6. Взять самый большой внутренний компонент → corridor_rough
7. Расширить обратно + пересечь с free_space
8. Вычесть размеченные комнаты
```

**Проблема**: если дверные проёмы > 14px → дилатация не закрывает их → весь интерьер = один blob → алгоритм выбирает весь этаж как "коридор".

## Closest Analog Feature

`compute_wall_thickness` (`pipeline.py:569`) — ближайший аналог использования distanceTransform:
```python
dist = cv2.distanceTransform(binary_mask, cv2.DIST_L2, 5)
nonzero = dist[dist > 0]
thickness = float(np.median(nonzero))
```

## Предлагаемый алгоритм (Distance Transform подход)

Вместо дилатации стен — пороговая фильтрация по расстоянию до стен:

```
1. free_space = bitwise_not(wall_mask)
2. dist = distanceTransform(free_space, DIST_L2, 5)
   # dist[y,x] = расстояние от пикселя до ближайшей стены
3. corridor_seed = (dist > threshold)
   # threshold ≈ половина ширины дверного проёма
   # Дверной проём 8-12px → threshold = 6-8px
   # Коридор 30-60px → dist > 15px → попадает в seed
4. connectedComponentsWithStats(corridor_seed)
5. Исключить border-компоненты
6. Взять самый большой внутренний компонент → corridor_core
7. Расширить corridor_core обратно → пересечь с free_space
   # Это восстанавливает полную ширину коридора
```

**Ключевое преимущество**: threshold не зависит от ширины дверного проёма — он зависит от ширины коридора. Коридор всегда шире дверного проёма, поэтому порог можно выбрать между ними.

**Адаптивный threshold**: использовать `compute_wall_thickness` для оценки масштаба:
- `wall_thickness_px` = медиана dist на стенах
- Дверной проём ≈ 1–2 толщины стены
- Коридор ≈ 4–8 толщин стены
- `corridor_threshold = wall_thickness_px * 1.5` — между дверью и коридором

## Integration Points

- **Файл для изменения**: `backend/app/processing/nav_graph.py:15` — только функция `extract_corridor_mask`
- **Сигнатура**: можно сохранить текущую, добавив `corridor_dist_threshold: float = 0` (0 = авто)
- **Зависимости**: `cv2.distanceTransform` уже используется в `pipeline.py:582` — импорт не нужен
- **Тесты**: `backend/tests/processing/test_nav_graph.py:19` — класс `TestExtractCorridorMask` (5 тестов) + `TestExtractCorridorMaskDoorwayIsolation` (3 теста) — нужно обновить/добавить тест с широким проёмом
- **NavService**: `nav_service.py:59` — вызов `extract_corridor_mask(wall_mask, rooms, w, h)` — параметры не меняются

## Gaps (что нужно сделать)

- Заменить алгоритм дилатации на distance transform в `extract_corridor_mask`
- Добавить адаптивный расчёт `corridor_dist_threshold` из `wall_thickness_px`
- Обновить тест `test_wide_opening_not_closed` — он сейчас помечен "допустимо для MVP", после фикса должен проверять реальную изоляцию
- Добавить тест с проёмом 20px (текущий алгоритм не справляется, новый должен)

## Key Files

- `backend/app/processing/nav_graph.py` — функция `extract_corridor_mask` (строки 15–141) — единственный файл для изменения
- `backend/app/processing/pipeline.py:569` — `compute_wall_thickness` — паттерн distanceTransform для переиспользования
- `backend/tests/processing/test_nav_graph.py:54` — `TestExtractCorridorMaskDoorwayIsolation` — тесты для обновления
- `backend/app/services/nav_service.py:59` — вызов функции — не меняется
