# Тикет 27: Чёрный монолит + смещение маршрута — диагностика и комплексный фикс

## Статус: TODO
## Приоритет: КРИТИЧЕСКИЙ
## Тип: Регрессия после тикетов 23-26 + координатное несовпадение

---

## Две проблемы

### Проблема A: Чёрный монолит вместо стен здания (РЕГРЕССИЯ)

На шаге 5 вместо стен 3D-модели отображается сплошной чёрный блок, по форме напоминающий **свободное пространство** этажа (коридоры + комнаты), а не стены.

**Причина:** `mesh_builder.py → build_mesh_from_mask()` ожидает маску где **белый (255) = стены**, **чёрный (0) = пустота**. Если маска инвертирована (белый = свободное пространство), `cv2.findContours` извлекает контуры свободного пространства и экструдирует их в 3D как монолитный блок.

**Вероятный источник:** При исправлении тикетов 23-26 что-то изменилось в пайплайне маски. Одно из следующего:

1. `mesh_builder.py` или `mesh_generator.py` — добавлена инверсия маски
2. `reconstruction_service.py` — маска инвертируется перед передачей в `build_mesh_from_mask`
3. `nav_service.py` → `build_graph()` — сохраняет corridor_mask поверх оригинальной маски
4. Маска с шага 3 (WallEditorCanvas) сохраняется инвертированной

### Проблема B: Маршрут смещён относительно 3D-модели

Бирюзовая линия маршрута находится в нижнем левом углу, оторвана от модели. Это **координатное несовпадение** между формулой `transform_2d_to_3d` и тем, как Three.js размещает GLB-модель в сцене.

---

## Порядок исправления

### ШАГ 1: ДИАГНОСТИКА — найти все изменения после тикетов 23-26

```bash
# Посмотреть все изменённые файлы в git
git diff --name-only HEAD~5
# Или если нет git:
git log --oneline -10

# Критические файлы для проверки:
cat backend/app/processing/mesh_builder.py
cat backend/app/processing/mesh_generator.py
cat backend/app/processing/nav_graph.py
cat backend/app/services/nav_service.py
cat backend/app/services/reconstruction_service.py
cat backend/app/api/reconstruction.py
```

Искать:
- `bitwise_not`, `cv2.bitwise_not`, `255 -`, `~ mask`, `invert` — любую инверсию маски
- Изменения в `build_mesh_from_mask` или `contours_to_polygons`
- Изменения в API endpoints, которые передают маску в mesh builder

### ШАГ 2: ПОЧИНИТЬ ЧЁРНЫЙ МОНОЛИТ (Проблема A)

**Принцип:** `build_mesh_from_mask()` ДОЛЖЕН получать маску где **белый = стены**. Это та же маска, которую рисует WallEditorCanvas (белые стены на чёрном фоне).

**Проверка:** Добавить временный debug-вывод:
```python
# В build_mesh_from_mask(), после получения mask:
h, w = mask.shape[:2]
white_ratio = np.sum(mask > 127) / (h * w)
logger.info(f"build_mesh_from_mask: white_ratio={white_ratio:.2%}")
# Если white_ratio > 50% — маска инвертирована!
# Стены обычно занимают 10-30% площади, не 70-90%
```

**Если маска инвертирована — найти где происходит инверсия и УБРАТЬ её.** Не добавлять обратную инверсию — найти и удалить причину.

**Контрольные файлы (сравнить с оригиналом):**
- `mesh_builder.py` — строка `contours_raw, _ = cv2.findContours(mask.copy(), ...)` — mask НЕ должен быть инвертирован перед этим вызовом
- `mesh_generator.py → contours_to_polygons()` — не должно быть инверсий
- `reconstruction_service.py` — маска, передаваемая в build_mesh_from_mask, НЕ должна инвертироваться

### ШАГ 3: ПОЧИНИТЬ КООРДИНАТЫ МАРШРУТА (Проблема B)

Это самая коварная часть. Формула `transform_2d_to_3d` должна **точно совпадать** с тем, как координаты маски превращаются в координаты 3D-модели на экране.

**3a. Определить формулу mesh_generator:**
```bash
cat backend/app/processing/mesh_generator.py | grep -A 20 "def contours_to_polygons"
```

Найти формулу конвертации пиксельных координат. Записать её:
```python
# Ожидаемый вид:
x_mesh = (x_pix - ???) / pixels_per_meter
y_mesh = (??? - y_pix) / pixels_per_meter   # Y-flip
```

**3b. Определить центрирование в MeshViewer:**
```bash
cat frontend/src/components/MeshViewer.tsx | grep -i "center\|position\|bounds\|box\|offset"
# Или прочитать весь файл:
cat frontend/src/components/MeshViewer.tsx
```

Найти: есть ли `<Center>` из @react-three/drei? Есть ли ручное центрирование mesh? Есть ли сдвиг позиции группы?

**3c. Выбрать ПРАВИЛЬНУЮ формулу на основе результатов:**

| mesh_generator | MeshViewer | Формула transform_2d_to_3d |
|---|---|---|
| Без центрирования | Без центрирования | `x = x_pix × S, z = (y_pix - H) × S` |
| Без центрирования | С `<Center>` | `x = (x_pix - W/2) × S, z = (y_pix - H/2) × S` |
| С центрированием W/2, H/2 | Без центрирования | `x = (x_pix - W/2) × S, z = (y_pix - H/2) × S` |

**ВАЖНО:** Не гадать! Посмотреть реальный код обоих файлов и выбрать формулу, которая СОВПАДАЕТ.

**3d. Применить формулу:**

**Файл:** `backend/app/processing/nav_graph.py`
**Функция:** `transform_2d_to_3d()` (строки ~529-550)

Заменить формулу на ту, что определена в шаге 3c. Обновить docstring.

### ШАГ 4: СКВОЗНАЯ ПРОВЕРКА

```bash
# 1. Тесты
pytest
npx tsc --noEmit

# 2. Проверить что маска правильная
python3 -c "
import cv2, numpy as np
mask = cv2.imread('uploads/masks/<LATEST_ID>.png', cv2.IMREAD_GRAYSCALE)
h, w = mask.shape
white = np.sum(mask > 127) / (h * w)
print(f'White ratio: {white:.1%}')
assert white < 0.5, f'Маска инвертирована! white={white:.1%}'
print('✅ Маска корректна (белый = стены)')
"

# 3. Проверить nav.json
python3 -c "
import json, glob, os
files = sorted(glob.glob('uploads/masks/*_nav.json'), key=os.path.getmtime)
data = json.load(open(files[-1]))
sf = data['metadata']['scale_factor']
print(f'scale_factor: {sf}')
assert sf == 0.02, f'scale_factor={sf}!'
print('✅ scale_factor=0.02')
"

# 4. Визуальная проверка в UI
# Шаг 3 → ПОСТРОИТЬ ГРАФ → ПОСТРОИТЬ 3D → НАЙТИ МАРШРУТ
# - Модель: стены здания (НЕ чёрный монолит)
# - Маршрут: бирюзовая линия ВНУТРИ стен, по коридорам
```

---

## Чего НЕ делать

- **НЕ инвертировать маску** «для компенсации» — найти и убрать источник инверсии
- **НЕ менять** `MeshViewer.tsx` — он работает правильно
- **НЕ менять** `WallEditorCanvas.tsx` — canvas экспортирует маску корректно
- **НЕ менять** `extract_corridor_mask()` — она теперь работает правильно
- **НЕ менять** `pixels_per_meter=50` в mesh_builder
- **НЕ менять** `integrate_semantics`, `build_skeleton`, `prune_dendrites`
- **НЕ угадывать** формулу центрирования — прочитать mesh_generator.py и MeshViewer.tsx

---

## Бонус: Улучшение качества маршрута (после фикса багов)

После того как маршрут совпадёт со стенами, зигзаги маршрута в широких пространствах можно убрать **без смены архитектуры**. Добавить Line-of-Sight (LOS) пранинг в `find_route()` после A*:

```python
def los_prune(coords_2d: list, wall_mask: np.ndarray) -> list:
    """
    Удаляет промежуточные точки, если между start и end 
    можно провести прямую без пересечения стен.
    """
    if len(coords_2d) < 3:
        return coords_2d
    
    result = [coords_2d[0]]
    i = 0
    
    while i < len(coords_2d) - 1:
        # Пытаемся провести прямую от i к самой дальней точке
        best_j = i + 1
        for j in range(len(coords_2d) - 1, i + 1, -1):
            if _line_of_sight(coords_2d[i], coords_2d[j], wall_mask):
                best_j = j
                break
        result.append(coords_2d[best_j])
        i = best_j
    
    return result


def _line_of_sight(p1, p2, wall_mask) -> bool:
    """Проверяет, что прямая p1→p2 не пересекает стены (белые пиксели)."""
    x1, y1 = int(p1[0]), int(p1[1])
    x2, y2 = int(p2[0]), int(p2[1])
    
    # Bresenham line
    points = []
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx - dy
    
    h, w = wall_mask.shape[:2]
    while True:
        if 0 <= y1 < h and 0 <= x1 < w:
            if wall_mask[y1, x1] > 127:  # белый = стена
                return False
        if x1 == x2 and y1 == y2:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x1 += sx
        if e2 < dx:
            err += dx
            y1 += sy
    
    return True
```

Вызов в `nav_service.py → find_route()` после получения route:
```python
# После simplified = simplify_path(...)
wall_mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
smoothed = los_prune(simplified, wall_mask)
```

Это даст прямые участки вместо зигзагов, без переписывания архитектуры.

---

## Связанные тикеты
- Тикет 23: corridor_mask экстерьер→интерьер (✅)
- Тикет 25: scale_factor 0.05→0.02 (✅)
- Тикет 26: Центрирование W/2, H/2 (⚠️ вероятно сломал mesh — нужна диагностика)