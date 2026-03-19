# Тикет 26: Маршрут смещён — transform_2d_to_3d не центрирует координаты (а mesh центрирован)

## Статус: TODO
## Приоритет: КРИТИЧЕСКИЙ — последний баг навигации
## Затрагиваемые файлы:
- `backend/app/processing/nav_graph.py` → функция `transform_2d_to_3d()` — **2 строки**

---

## Текущее состояние

✅ scale_factor = 0.02 (совпадает с mesh_builder)
✅ Коридорная маска — внутренние коридоры
✅ Скелет, snap дверей, A* маршрут — всё правильно
❌ Маршрут смещён вправо и назад в 3D-сцене

---

## Корневая причина

**mesh_builder.py** генерирует GLB-модель с координатами от (0,0) до (W×0.02, H×0.02). Когда Three.js загружает GLB, он **автоцентрирует** модель — сдвигает так, чтобы центр bounding box оказался в (0,0,0). Это стандартное поведение.

**transform_2d_to_3d** генерирует координаты маршрута **без центрирования** — относительно угла маски. В результате маршрут смещён на (W/2 × S, H/2 × S).

### Доказательство (маска 1170×540, scale=0.02)

Mesh bbox как сгенерирован: **x=[0, 23.4]  z=[−10.8, 0]**
Mesh bbox как отображён в Three.js (центрирован): **x=[−11.7, 11.7]  z=[−5.4, 5.4]**

| Узел | Pixel | Текущий 3D (угол) | Правильный 3D (центр) |
|------|-------|-------------------|----------------------|
| Комната 1 | (787, 213) | **(15.75, −6.54)** | **(4.05, −1.14)** |
| Комната 2 | (350, 149) | **(7.00, −7.82)** | **(−4.70, −2.42)** |

Текущие координаты (15.75, −6.54) выходят за пределы центрированного меша [−11.7, 11.7]×[−5.4, 5.4].
Исправленные координаты (4.05, −1.14) — точно внутри.

**Смещение = (W/2 × S, H/2 × S) = (11.7, 5.4) — ровно центр меша.**

---

## Исправление: 2 строки в transform_2d_to_3d

**Файл:** `backend/app/processing/nav_graph.py`
**Функция:** `transform_2d_to_3d()` (строки ~529-550)

**БЫЛО:**
```python
def transform_2d_to_3d(
    coords_2d: list[tuple[float, float]],
    mask_width: int,
    mask_height: int,
    scale_factor: float,
    y_offset: float = 0.1,
) -> list[list[float]]:
    coords_3d = []
    for (x_pix, y_pix) in coords_2d:
        x_3d = x_pix * scale_factor                          # ← от угла
        y_3d = y_offset
        z_3d = (y_pix - mask_height) * scale_factor           # ← от угла
        coords_3d.append([round(x_3d, 4), round(y_3d, 4), round(z_3d, 4)])
    return coords_3d
```

**СТАЛО:**
```python
def transform_2d_to_3d(
    coords_2d: list[tuple[float, float]],
    mask_width: int,
    mask_height: int,
    scale_factor: float,
    y_offset: float = 0.1,
) -> list[list[float]]:
    coords_3d = []
    for (x_pix, y_pix) in coords_2d:
        x_3d = (x_pix - mask_width / 2) * scale_factor        # ← от центра
        y_3d = y_offset
        z_3d = (y_pix - mask_height / 2) * scale_factor        # ← от центра
        coords_3d.append([round(x_3d, 4), round(y_3d, 4), round(z_3d, 4)])
    return coords_3d
```

**Изменено только 2 строки:**
- `x_pix * scale_factor` → `(x_pix - mask_width / 2) * scale_factor`
- `(y_pix - mask_height) * scale_factor` → `(y_pix - mask_height / 2) * scale_factor`

---

## Почему W/2 и H/2

Three.js (react-three-fiber) при загрузке GLB автоматически центрирует модель. mesh_builder генерирует координаты от (0,0), но Three.js сдвигает центр bounding box в origin:

```
Исходный mesh:    x ∈ [0, W×S]        → центр = W×S/2
Центрированный:   x ∈ [−W×S/2, W×S/2] → центр = 0

Маршрут должен совпадать:
  x_3d = x_pix × S − W×S/2 = (x_pix − W/2) × S

Аналогично для Z:
  z_3d = (y_pix − H) × S − (−H×S/2) = (y_pix − H + H/2) × S = (y_pix − H/2) × S
```

---

## Чего НЕ делать

- **НЕ менять** `mesh_builder.py` — координаты меша правильные, Three.js их центрирует
- **НЕ менять** `MeshViewer.tsx` — это ожидаемое поведение Three.js
- **НЕ менять** `scale_factor` — 0.02 уже правильный
- **НЕ менять** `extract_corridor_mask`, `integrate_semantics`, `find_route`
- **НЕ менять** `NavigationPath.tsx` — CatmullRomCurve3 получает координаты из бэкенда

---

## Верификация

### 0. Подтвердить формулу mesh_generator (ПЕРВЫМ ДЕЛОМ)

Перед применением фикса **проверить** что в `mesh_generator.py` → `contours_to_polygons()` действительно есть центрирование:

```bash
grep -n "width\|height\|W\|H\|center\|/ 2\|/2" backend/app/processing/mesh_generator.py
cat backend/app/processing/mesh_generator.py
```

Найти формулу конвертации пиксельных координат. Она должна выглядеть примерно как:
```python
x = (x_pix - W/2) / pixels_per_meter   # или x_pix / ppm - W/(2*ppm)
y = (H/2 - y_pix) / pixels_per_meter   # или (H - y_pix) / ppm - ...
```

Если центрирования нет — значит Three.js/MeshViewer делает это. Проверить `MeshViewer.tsx`:
```bash
grep -n "center\|position\|bounds\|box" frontend/src/components/MeshViewer.tsx
```

В любом случае, итоговая формула в `transform_2d_to_3d` должна совпадать с тем, как модель **реально отображается** в Three.js. Текущий визуальный результат однозначно показывает смещение вправо+назад.

### 1. Перестроить граф и маршрут

Вернуться на шаг 3 → разметить комнаты/двери → ПОСТРОИТЬ ГРАФ → ПОСТРОИТЬ 3D → выбрать маршрут.

### 2. Проверить координаты через API

Для маски 1170×540 координаты маршрута должны быть:
- x: примерно в диапазоне **[−11.7, 11.7]** (а НЕ [0, 23.4])
- z: примерно в диапазоне **[−5.4, 5.4]** (а НЕ [−10.8, 0])

### 3. Визуально

Бирюзовая линия маршрута должна проходить **по коридорам внутри** 3D-модели, совпадая со стенами.

### 4. Тесты
```bash
pytest
npx tsc --noEmit
```

---

## Связанные тикеты
- Тикет 25: scale_factor=0.05→0.02 (✅ ИСПРАВЛЕН)
- Тикет 23: corridor_mask экстерьер→интерьер (✅ ИСПРАВЛЕН)