# Тикет 22: Исправление маршрутизации — изоляция коридоров + координаты + сглаживание пути

**Приоритет:** Критический  
**Предыдущие тикеты:** 19 (граф), 20 (A*), 21 (MORPH_OPEN — не сработал)  
**Три проблемы в одном тикете:**
- **A.** Маршрут идёт сквозь стены (неверное определение коридоров)
- **B.** Маршрут в 3D отображается не в том месте (координатная трансформация)
- **C.** Маршрут кривой и извилистый (пиксельный шум скелета)

**Затрагиваемые файлы:**

Backend:
- `backend/app/processing/nav_graph.py` — переписать `extract_corridor_mask()`, добавить `simplify_path()`, исправить `transform_2d_to_3d()`
- `backend/app/services/nav_service.py` — debug-сохранение, интеграция simplify
- `backend/tests/processing/test_nav_graph.py` — новые тесты

---

## ЧАСТЬ A: Изоляция дверных проёмов — правильное определение коридоров

### Проблема

MORPH_OPEN (тикет 21) разрезал коридоры на фрагменты. Без MORPH_OPEN — скелет проходит через все комнаты. Корневая причина: комнаты соединены с коридорами через **дверные проёмы** (узкие щели 5–15px в стенах). Пока щели открыты — свободное пространство единый кусок, скелет идёт повсюду.

### Решение

«Захлопнуть» дверные проёмы дилатацией стен → свободное пространство распадается на изолированные области → самая большая = коридор.

### Алгоритм:

```
Шаг 1: free_space = bitwise_not(wall_mask)
        → белое=свободно, чёрное=стена

Шаг 2: dilated_walls = dilate(wall_mask, kernel(7,7), iterations=2)
        → стены «разбухают» на ~14px
        → дверные проёмы (5-15px) закрываются
        → коридоры (30-60px) сужаются, но не исчезают

Шаг 3: closed_free = bitwise_not(dilated_walls)
        → свободное пространство с «захлопнутыми» дверями
        → комнаты = отдельные изолированные области

Шаг 4: connectedComponentsWithStats(closed_free)
        → самый большой компонент по площади = КОРИДОР

Шаг 5: corridor_rough = (labels == biggest_label) * 255
        → грубая маска коридора (сужена дилатацией)

Шаг 6: corridor_expanded = dilate(corridor_rough, same_kernel)
        corridor_mask = bitwise_and(free_space, corridor_expanded)
        → расширяем обратно и пересекаем с оригиналом
        → точные границы коридора без артефактов

Шаг 7: Вычитаем вручную размеченные комнаты (room, staircase, elevator)
```

### Реализация — заменить `extract_corridor_mask()` в `nav_graph.py`:

```python
def extract_corridor_mask(
    wall_mask: np.ndarray,
    rooms: list[dict],
    mask_width: int,
    mask_height: int,
    dilate_kernel_size: int = 7,
    dilate_iterations: int = 2,
) -> np.ndarray:
    """
    Извлекает маску коридоров через изоляцию дверных проёмов.
    
    Дилатация стен «захлопывает» дверные проёмы → connectedComponents 
    разделяет свободное пространство на изолированные области → 
    самая большая = коридор.
    
    Параметры дилатации:
        kernel=7, iterations=2 → расширение ~14px
        Дверной проём 5-12px → закроется
        Коридор 30-60px → сузится до 16-46px, не исчезнет
    """
    t0 = time.perf_counter()
    
    # 1. Свободное пространство
    free_space = cv2.bitwise_not(wall_mask)
    
    # 2. Дилатация стен — закрываем дверные проёмы
    dilate_kernel = np.ones((dilate_kernel_size, dilate_kernel_size), np.uint8)
    dilated_walls = cv2.dilate(wall_mask, dilate_kernel, iterations=dilate_iterations)
    
    # 3. Свободное пространство с закрытыми дверями
    closed_free = cv2.bitwise_not(dilated_walls)
    
    # 4. Связные компоненты
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        closed_free, connectivity=8
    )
    
    # 5. Самый большой компонент = коридор (label=0 это фон)
    biggest_label = -1
    biggest_area = 0
    for label_id in range(1, num_labels):
        area = stats[label_id, cv2.CC_STAT_AREA]
        if area > biggest_area:
            biggest_area = area
            biggest_label = label_id
    
    if biggest_label == -1:
        logger.warning("extract_corridor_mask: no free space found")
        return np.zeros_like(wall_mask)
    
    # Грубая маска коридора
    corridor_rough = np.zeros_like(wall_mask)
    corridor_rough[labels == biggest_label] = 255
    
    # 6. Расширяем обратно → пересекаем с оригиналом → точные границы
    corridor_expanded = cv2.dilate(corridor_rough, dilate_kernel, iterations=dilate_iterations)
    corridor_mask = cv2.bitwise_and(free_space, corridor_expanded)
    
    # 7. Вычитаем размеченные комнаты (страховка)
    room_types_to_subtract = {'room', 'staircase', 'elevator'}
    manual_subtracted = 0
    for room in rooms:
        if room.get('room_type', 'room') in room_types_to_subtract:
            x = int(room['x'] * mask_width)
            y = int(room['y'] * mask_height)
            w = int(room['width'] * mask_width)
            h = int(room['height'] * mask_height)
            cv2.rectangle(corridor_mask, (x, y), (x + w, y + h), 0, -1)
            manual_subtracted += 1
    
    logger.info(
        "extract_corridor_mask: %dx%d, dilate=%dx iter=%d, "
        "components=%d, biggest=%.0f%%, manual_sub=%d, %.1fms",
        mask_width, mask_height,
        dilate_kernel_size, dilate_iterations,
        num_labels - 1,
        biggest_area / max(1, np.sum(free_space > 0)) * 100,
        manual_subtracted,
        (time.perf_counter() - t0) * 1000,
    )
    
    return corridor_mask
```

---

## ЧАСТЬ B: Координатная трансформация 2D→3D

### Проблема

Маршрут в 3D-viewer отображается со смещением относительно стен. Формула `transform_2d_to_3d` не совпадает с тем, как `mesh_builder.py` генерирует GLB-модель.

### Диагностика

**Перед реализацией** Claude Code ОБЯЗАН выполнить Research:

```
1. Открой backend/app/processing/mesh_builder.py
2. Найди функцию build_mesh_from_mask (или аналогичную)
3. Найди:
   a) Какой scale_factor используется (0.05? другой? вычисляется динамически?)
   b) Как центрируется меш — формулу трансформации координат:
      - Есть ли сдвиг на -W/2, -H/2?
      - Какая ось = X, какая = Y, какая = Z?
      - Инвертируется ли Y или Z?
   c) Используется ли trimesh.apply_transform() или ручная трансформация?
4. Запиши найденные формулы
5. Сравни с текущей transform_2d_to_3d:
      x_3d = (x_pix - W/2) * S
      y_3d = Y_offset
      z_3d = (y_pix - H/2) * S
6. Определи расхождения
```

### Возможные расхождения (исправить после Research):

**Проблема B1: Другой scale_factor**

`mesh_builder` может использовать не 0.05, а другое значение. Или вычислять его динамически из размеров маски. Решение: в `nav_service.py` при построении графа читать scale_factor из того же источника, что и mesh_builder.

```python
# В nav_service.py → build_graph():
# Импортировать scale_factor из mesh_builder или вычислить так же
from app.processing.mesh_builder import SCALE_FACTOR  # или как он там называется
```

**Проблема B2: Инвертированная ось**

Three.js: Y вверх, Z к наблюдателю. Если mesh_builder использует Z вверх (как в trimesh по умолчанию), то нужно поменять оси:

```python
# Вариант 1: mesh_builder use Y-up (Three.js стандарт)
x_3d = (x_pix - W/2) * S
y_3d = Y_offset          # высота
z_3d = (y_pix - H/2) * S

# Вариант 2: mesh_builder инвертирует Z
z_3d = -(y_pix - H/2) * S  # минус!

# Вариант 3: mesh_builder не центрирует (начало координат в углу)
x_3d = x_pix * S
z_3d = y_pix * S
```

**Проблема B3: Центрирование через trimesh bounds**

`mesh_builder` может центрировать меш через `mesh.bounds` или `mesh.centroid`, а не через `W/2, H/2`. В этом случае:

```python
# Нужно использовать те же bounds что и mesh_builder
# Сохранить их в _nav.json при генерации графа
```

### Реализация — исправить `transform_2d_to_3d()`:

После Research — привести формулу к точному соответствию с mesh_builder. Общий шаблон:

```python
def transform_2d_to_3d(
    coords_2d: list[tuple[float, float]],
    mask_width: int,
    mask_height: int,
    scale_factor: float,
    y_offset: float = 0.1,
    # Параметры из mesh_builder (определяются при Research):
    center_x: float | None = None,  # Если mesh_builder центрирует иначе
    center_z: float | None = None,
    invert_z: bool = False,
) -> list[list[float]]:
    """
    Преобразует 2D пиксели в 3D координаты.
    Формула ДОЛЖНА совпадать с mesh_builder.py.
    """
    cx = center_x if center_x is not None else mask_width / 2.0
    cz = center_z if center_z is not None else mask_height / 2.0
    
    coords_3d = []
    for (x_pix, y_pix) in coords_2d:
        x_3d = (x_pix - cx) * scale_factor
        y_3d = y_offset
        z_3d = (y_pix - cz) * scale_factor
        if invert_z:
            z_3d = -z_3d
        coords_3d.append([round(x_3d, 4), round(y_3d, 4), round(z_3d, 4)])
    
    return coords_3d
```

### Сохранение параметров трансформации в `_nav.json`:

В `serialize_nav_graph()` добавить:

```python
"metadata": {
    "mask_width": mask_width,
    "mask_height": mask_height,
    "scale_factor": scale_factor,
    # НОВОЕ — из mesh_builder Research:
    "center_x": ...,
    "center_z": ...,
    "invert_z": ...,
}
```

---

## ЧАСТЬ C: Сглаживание маршрута (Douglas-Peucker + фильтрация)

### Проблема

Скелет (медиальная ось) повторяет каждый пиксельный зубчик неровных стен. Стены неровные из-за threshold → скелет вихляет → маршрут вихляет. Хочется прямой, чистый маршрут как в 2ГИС.

### Как работают 2ГИС / Яндекс Карты

Работают с **векторными** дорогами (прямые отрезки из OpenStreetMap). Граф изначально состоит из прямых линий. У нас — пиксельный скелет, поэтому нужно **постпроцессить** маршрут, превращая зигзаги в прямые отрезки.

### Решение: 3 этапа упрощения

#### C1. Douglas-Peucker — основное упрощение

Классический алгоритм упрощения ломаных линий. Удаляет точки, отклоняющиеся от прямой менее чем на `epsilon` пикселей.

```
До:   ~~~\/\/\/~~~~/\~~~~~/\/\~~~  (200 точек)
После: ────────────/──────────────  (15 точек)
```

Одна строка OpenCV:

```python
simplified = cv2.approxPolyDP(np.array(coords), epsilon=3.0, closed=False)
```

**epsilon=3.0** означает: если точка отклоняется от прямой менее чем на 3 пикселя — убрать. Для маски 800×400px это незаметно визуально, но превращает зигзаги в прямые.

#### C2. Коллинеарная фильтрация — выпрямление длинных участков

Если три последовательные точки почти на одной прямой (угол между отрезками < 5°) — убрать среднюю. Это выпрямляет длинные коридоры, которые Douglas-Peucker оставил с лёгким изгибом.

```python
def filter_collinear(coords, angle_threshold_deg=5.0):
    """Убирает точки, которые почти на одной прямой с соседями."""
    if len(coords) < 3:
        return coords
    
    threshold_rad = math.radians(angle_threshold_deg)
    result = [coords[0]]
    
    for i in range(1, len(coords) - 1):
        prev = result[-1]
        curr = coords[i]
        next_pt = coords[i + 1]
        
        # Вектора
        v1 = (curr[0] - prev[0], curr[1] - prev[1])
        v2 = (next_pt[0] - curr[0], next_pt[1] - curr[1])
        
        # Длины
        len1 = math.hypot(v1[0], v1[1])
        len2 = math.hypot(v2[0], v2[1])
        
        if len1 < 1e-6 or len2 < 1e-6:
            continue  # Совпадающие точки — пропустить
        
        # Угол между векторами
        cos_angle = (v1[0]*v2[0] + v1[1]*v2[1]) / (len1 * len2)
        cos_angle = max(-1.0, min(1.0, cos_angle))  # Защита от float ошибок
        angle = math.acos(cos_angle)
        
        # Если угол > порога — точка значимая (поворот), оставляем
        if angle > threshold_rad:
            result.append(curr)
    
    result.append(coords[-1])
    return result
```

#### C3. Минимальная дистанция — убрать слишком близкие точки

Точки ближе 5px друг к другу — убрать. Предотвращает кластеризацию и артефакты CatmullRomCurve3.

```python
def filter_min_distance(coords, min_dist=5.0):
    """Убирает точки ближе min_dist к предыдущей."""
    if len(coords) < 2:
        return coords
    
    result = [coords[0]]
    for pt in coords[1:-1]:  # Всегда сохраняем первую и последнюю
        prev = result[-1]
        if math.hypot(pt[0] - prev[0], pt[1] - prev[1]) >= min_dist:
            result.append(pt)
    result.append(coords[-1])
    return result
```

### Общая функция `simplify_path()` — добавить в `nav_graph.py`:

```python
def simplify_path(
    coords_2d: list[tuple[float, float]],
    dp_epsilon: float = 3.0,
    angle_threshold_deg: float = 5.0,
    min_point_distance: float = 5.0,
) -> list[tuple[float, float]]:
    """
    Упрощает маршрут из пиксельного зигзага в гладкую ломаную.
    
    Три этапа:
    1. Douglas-Peucker (cv2.approxPolyDP) — основное упрощение
    2. Коллинеарная фильтрация — выпрямление длинных участков
    3. Минимальная дистанция — удаление слишком близких точек
    
    Args:
        coords_2d: список (x, y) пиксельных координат маршрута
        dp_epsilon: порог Douglas-Peucker в пикселях (чем больше — тем прямее)
        angle_threshold_deg: порог угла для коллинеарности (градусы)
        min_point_distance: минимальное расстояние между точками (пиксели)
    
    Returns:
        Упрощённый список (x, y)
    
    Визуально:
        До:   ~~~\\/\\/\\/~~~~/\\~~~~~/\\/\\~~~  (200 точек)
        После: ────────────/──────────────────  (12 точек)
    """
    t0 = time.perf_counter()
    original_count = len(coords_2d)
    
    if len(coords_2d) < 3:
        return coords_2d
    
    # Этап 1: Douglas-Peucker
    points_array = np.array(coords_2d, dtype=np.float32).reshape(-1, 1, 2)
    simplified = cv2.approxPolyDP(points_array, epsilon=dp_epsilon, closed=False)
    coords = [(float(pt[0][0]), float(pt[0][1])) for pt in simplified]
    
    # Этап 2: Коллинеарная фильтрация
    coords = _filter_collinear(coords, angle_threshold_deg)
    
    # Этап 3: Минимальная дистанция
    coords = _filter_min_distance(coords, min_point_distance)
    
    logger.info("simplify_path: %d → %d points (%.0f%% reduction), %.1fms",
                original_count, len(coords),
                (1 - len(coords) / max(1, original_count)) * 100,
                (time.perf_counter() - t0) * 1000)
    
    return coords


def _filter_collinear(
    coords: list[tuple[float, float]],
    angle_threshold_deg: float = 5.0,
) -> list[tuple[float, float]]:
    """Убирает точки, которые почти на одной прямой с соседями."""
    if len(coords) < 3:
        return coords
    
    threshold_rad = math.radians(angle_threshold_deg)
    result = [coords[0]]
    
    for i in range(1, len(coords) - 1):
        prev = result[-1]
        curr = coords[i]
        next_pt = coords[i + 1]
        
        v1 = (curr[0] - prev[0], curr[1] - prev[1])
        v2 = (next_pt[0] - curr[0], next_pt[1] - curr[1])
        
        len1 = math.hypot(v1[0], v1[1])
        len2 = math.hypot(v2[0], v2[1])
        
        if len1 < 1e-6 or len2 < 1e-6:
            continue
        
        cos_angle = (v1[0]*v2[0] + v1[1]*v2[1]) / (len1 * len2)
        cos_angle = max(-1.0, min(1.0, cos_angle))
        angle = math.acos(cos_angle)
        
        if angle > threshold_rad:
            result.append(curr)
    
    result.append(coords[-1])
    return result


def _filter_min_distance(
    coords: list[tuple[float, float]],
    min_dist: float = 5.0,
) -> list[tuple[float, float]]:
    """Убирает точки ближе min_dist пикселей к предыдущей."""
    if len(coords) < 2:
        return coords
    
    result = [coords[0]]
    for pt in coords[1:-1]:
        prev = result[-1]
        if math.hypot(pt[0] - prev[0], pt[1] - prev[1]) >= min_dist:
            result.append(pt)
    result.append(coords[-1])  # Последнюю всегда сохраняем
    return result
```

### Интеграция в `find_route()`:

В функции `find_route()` в `nav_graph.py`, **после** дедупликации и **перед** return:

```python
    # Дедупликация (уже есть)
    deduped = [path_coords_2d[0]] if path_coords_2d else []
    for pt in path_coords_2d[1:]:
        if pt != deduped[-1]:
            deduped.append(pt)
    
    # НОВОЕ: Упрощение маршрута
    simplified = simplify_path(
        deduped,
        dp_epsilon=3.0,         # 3px — баланс между гладкостью и точностью
        angle_threshold_deg=5.0, # Углы < 5° = прямая
        min_point_distance=5.0,  # Точки ближе 5px — убрать
    )
    
    return {
        "path_nodes": path_nodes,
        "path_coords_2d": simplified,  # ← Было deduped
        "total_distance_px": total_distance,
    }
```

### Визуальный эффект:

```
Этап                     Точек    Вид маршрута
─────────────────────    ─────    ─────────────
Сырой из скелета         ~300     ~~~\/\/\/~~~~~/\~~~~~~
После Douglas-Peucker    ~25      ──────/────────────
После коллинеарной       ~15      ──────/───────────
После min_distance       ~12      ─────/──────────

+ CatmullRomCurve3       →200     ═══════╮═══════════
(фронтенд, сплайн)               (плавные повороты)
```

Результат: прямые участки коридоров = прямые линии. Повороты = гладкие кривые. Как в 2ГИС.

---

## Debug-сохранение в `nav_service.py`

В `build_graph()` — сохранить промежуточные маски для визуальной проверки:

```python
debug_dir = os.path.dirname(mask_path)
prefix = mask_file_id

# 1. Свободное пространство
cv2.imwrite(f'{debug_dir}/{prefix}_1_free.png', cv2.bitwise_not(wall_mask))

# 2. Дилатированные стены
dilate_kernel = np.ones((7, 7), np.uint8)
dilated = cv2.dilate(wall_mask, dilate_kernel, iterations=2)
cv2.imwrite(f'{debug_dir}/{prefix}_2_dilated_walls.png', dilated)

# 3. Закрытое свободное (после дилатации)
cv2.imwrite(f'{debug_dir}/{prefix}_3_closed_free.png', cv2.bitwise_not(dilated))

# 4. Коридорная маска (результат extract_corridor_mask)
cv2.imwrite(f'{debug_dir}/{prefix}_4_corridor.png', corridor_mask)

# 5. Скелет
cv2.imwrite(f'{debug_dir}/{prefix}_5_skeleton.png', skeleton)

# 6. Overlay — граф поверх маски
overlay = cv2.cvtColor(wall_mask, cv2.COLOR_GRAY2BGR)
overlay[corridor_mask > 0] = [180, 80, 0]
overlay[skeleton > 0] = [0, 255, 255]
for node_id, data in G.nodes(data=True):
    pos = data.get('pos', (0, 0))
    x, y = int(pos[0]), int(pos[1])
    if 0 <= x < w and 0 <= y < h:
        color = {
            'room': (0, 0, 255),
            'door': (0, 255, 0),
            'corridor_entry': (255, 128, 0),
            'corridor_node': (128, 128, 128),
        }.get(data.get('type', ''), (200, 200, 200))
        radius = 6 if data.get('type') in ('room', 'door') else 3
        cv2.circle(overlay, (x, y), radius, color, -1)
cv2.imwrite(f'{debug_dir}/{prefix}_6_overlay.png', overlay)

logger.info("Debug: 6 images saved to %s", debug_dir)
```

---

## Тесты

```python
class TestExtractCorridorMaskDoorwayIsolation:
    def test_isolates_rooms_via_doorways(self):
        """Комнаты за дверными проёмами изолируются от коридора."""
        mask = np.ones((200, 400), dtype=np.uint8) * 255  # Стены
        
        # Коридор (20px высота)
        mask[90:110, 10:390] = 0
        
        # Комната слева (60x60) + дверь (8px)
        mask[30:90, 30:90] = 0
        mask[86:94, 55:63] = 0  # Дверной проём
        
        # Комната справа + дверь
        mask[30:90, 310:370] = 0
        mask[86:94, 335:343] = 0
        
        corridor = extract_corridor_mask(mask, [], 400, 200)
        
        assert corridor[100, 200] == 255, "Corridor center should be white"
        assert corridor[60, 60] == 0, "Left room should be isolated"
        assert corridor[60, 340] == 0, "Right room should be isolated"

    def test_corridor_stays_connected(self):
        """Длинный коридор не фрагментируется."""
        mask = np.ones((100, 500), dtype=np.uint8) * 255
        mask[40:60, 10:490] = 0  # Коридор 20px
        
        corridor = extract_corridor_mask(mask, [], 500, 100)
        num_labels, _ = cv2.connectedComponents(corridor)
        assert num_labels <= 3, f"Fragmented into {num_labels - 1} parts"

    def test_wide_opening_not_closed(self):
        """Широкий проём (>14px) не закрывается — допустимо для MVP."""
        mask = np.ones((200, 400), dtype=np.uint8) * 255
        mask[90:110, 10:390] = 0  # Коридор
        mask[30:90, 30:90] = 0    # Комната
        mask[80:110, 50:70] = 0   # Широкий проём 20px
        
        corridor = extract_corridor_mask(mask, [], 400, 200)
        # Комната может попасть в коридор — это OK для MVP
        # Главное что коридор не разорван


class TestSimplifyPath:
    def test_reduces_zigzag(self):
        """Зигзагообразный путь упрощается."""
        # 100 точек с зигзагом ±2px
        coords = [(float(i), 50.0 + (i % 3 - 1) * 2) for i in range(100)]
        simplified = simplify_path(coords, dp_epsilon=3.0)
        assert len(simplified) < len(coords) / 3, \
            f"Expected significant reduction, got {len(simplified)}/{len(coords)}"

    def test_preserves_turns(self):
        """Реальные повороты (90°) сохраняются."""
        coords = [(float(i), 50.0) for i in range(50)]  # Горизонтальный
        coords += [(50.0, 50.0 + float(i)) for i in range(50)]  # Вертикальный
        simplified = simplify_path(coords, dp_epsilon=3.0)
        # Поворот должен сохраниться (минимум 3 точки: начало, угол, конец)
        assert len(simplified) >= 3

    def test_preserves_endpoints(self):
        """Первая и последняя точки всегда сохраняются."""
        coords = [(float(i), float(i % 5)) for i in range(50)]
        simplified = simplify_path(coords)
        assert simplified[0] == coords[0]
        assert simplified[-1] == coords[-1]

    def test_short_path_unchanged(self):
        """Путь из 2 точек не меняется."""
        coords = [(0.0, 0.0), (100.0, 100.0)]
        simplified = simplify_path(coords)
        assert simplified == coords


class TestTransform2dTo3d:
    def test_center_maps_to_origin(self):
        """Центр маски → начало координат."""
        coords = transform_2d_to_3d([(500, 250)], 1000, 500, 0.05)
        assert abs(coords[0][0]) < 0.01
        assert abs(coords[0][2]) < 0.01

    def test_y_offset(self):
        """Y_offset применяется."""
        coords = transform_2d_to_3d([(0, 0)], 100, 100, 0.05, y_offset=0.15)
        assert coords[0][1] == 0.15
```

---

## Порядок реализации

### Фаза 1: Research (ОБЯЗАТЕЛЬНО перед кодом)
1. Открыть `mesh_builder.py` — найти scale_factor и формулу трансформации
2. Сравнить с `transform_2d_to_3d`
3. Записать расхождения

### Фаза 2: Backend — extract_corridor_mask (Часть A)
4. Заменить `extract_corridor_mask()` на алгоритм дилатации + connectedComponents
5. Добавить debug-сохранение промежуточных масок
6. Визуально проверить `_4_corridor.png` — коридоры белые, комнаты чёрные

### Фаза 3: Backend — simplify_path (Часть C)
7. Добавить `simplify_path()`, `_filter_collinear()`, `_filter_min_distance()`
8. Интегрировать в `find_route()` после дедупликации

### Фаза 4: Backend — transform_2d_to_3d (Часть B)
9. Исправить формулу на основе Research из шага 1
10. Обновить `serialize_nav_graph()` с правильными параметрами

### Фаза 5: Тесты
11. Все новые тесты
12. `pytest` — pass

### Фаза 6: Проверка
13. Построить граф на реальном плане → проверить debug-изображения
14. Построить маршрут → проверить в 3D:
    - Маршрут идёт по коридорам (не через стены)
    - Маршрут совпадает с 3D-моделью (не смещён)
    - Маршрут прямой и гладкий (не зигзагообразный)
15. `npx tsc --noEmit`

---

## Чеклист после реализации

**Часть A (коридоры):**
- [ ] `extract_corridor_mask` использует дилатацию + connectedComponents
- [ ] `_4_corridor.png`: коридоры белые, комнаты чёрные, двери закрыты
- [ ] Скелет проходит ТОЛЬКО по коридорам
- [ ] Граф связный (1–3 компонента скелета, не 34 или 72)
- [ ] A* находит маршрут между комнатами
- [ ] Маршрут не пересекает стены

**Часть B (координаты):**
- [ ] Research: формула из mesh_builder записана
- [ ] `transform_2d_to_3d` использует те же параметры что mesh_builder
- [ ] Маршрут в 3D совпадает со стенами (не смещён)

**Часть C (сглаживание):**
- [ ] `simplify_path` применяется в `find_route()`
- [ ] Douglas-Peucker убирает пиксельные зигзаги
- [ ] Коллинеарная фильтрация выпрямляет длинные участки
- [ ] Повороты 90° сохраняются
- [ ] Итоговый маршрут: 10–30 точек вместо 200–300
- [ ] С CatmullRomCurve3 на фронтенде — плавный как в 2ГИС

**Общее:**
- [ ] Debug-изображения (6 шт) сохраняются при каждой генерации графа
- [ ] `pytest` — pass
- [ ] `npx tsc --noEmit` — без ошибок