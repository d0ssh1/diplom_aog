# Тикет 25: ФИНАЛЬНЫЙ — scale_factor=0.05 персистирует в nav.json, маршрут смещён ×2.5

## Статус: TODO
## Приоритет: КРИТИЧЕСКИЙ — единственный оставшийся баг навигации
## Тип: Координатное смещение маршрута

---

## Текущее состояние (что уже работает)

✅ Коридорная маска — правильная (внутренние помещения, не экстерьер)
✅ Скелет — идёт по коридорам внутри здания
✅ Snap дверей — разумные расстояния (14-39px)
✅ A* маршрут — топологически правильный (комната → дверь → коридор → дверь → комната)
✅ Формула `transform_2d_to_3d` — математически корректная
✅ Сигнатура `build_graph()` в nav_service.py — уже `scale_factor=0.02`

## Что сломано

❌ Сгенерированный `_nav.json` содержит `"scale_factor": 0.05` (проверено в 3 последних билдах)
❌ Маршрут в 3D смещён в 2.5 раза относительно стен

### Доказательство

Маска 863×368. Bounding box 3D-модели (mesh_builder, scale=0.02): **x=[0, 17.26], z=[−7.36, 0]**

Маршрут A* (11 узлов, 310 2D-координат):
```
Route bbox при scale=0.05 (ТЕКУЩЕЕ):  x=[14.18, 29.74]  z=[−15.25, −11.03]  ← ВСЁ ЗА ПРЕДЕЛАМИ МОДЕЛИ
Route bbox при scale=0.02 (НУЖНОЕ):   x=[ 5.67, 11.90]  z=[ −6.10,  −4.41]  ← ВНУТРИ МОДЕЛИ ✓
```

---

## Диагноз

Сигнатура `build_graph()` в `nav_service.py` **уже** содержит `scale_factor: float = 0.02` (строка 44). Но JSON-файл **всё равно** записывается с `0.05`. Это значит что `0.05` передаётся **явно при вызове** откуда-то из другого файла.

---

## Инструкция по исправлению

### Шаг 1: НАЙТИ ВСЕ ИСТОЧНИКИ 0.05 (КРИТИЧЕСКИ ВАЖНО)

Выполнить полный поиск по ВСЕМ файлам бэкенда:

```bash
# Поиск ВСЕХ упоминаний 0.05 в бэкенде
grep -rn "0\.05" backend/

# Поиск всех вызовов build_graph с аргументами
grep -rn "build_graph" backend/

# Поиск всех упоминаний scale_factor
grep -rn "scale_factor" backend/
```

### Шаг 2: ЗАМЕНИТЬ ВСЕ НАЙДЕННЫЕ 0.05 → 0.02

Вот известные места, но **поиск из шага 1 может найти больше**:

#### Место 1: nav_service.py → find_route() (строка ~127)
```python
# БЫЛО:
scale_factor = metadata.get('scale_factor', 0.05)
# СТАЛО:
scale_factor = metadata.get('scale_factor', 0.02)
```

#### Место 2: НЕИЗВЕСТНЫЙ ФАЙЛ → вызов build_graph()
Скорее всего один из:
- `backend/app/api/reconstruction.py`
- `backend/app/services/reconstruction_service.py`  
- Роутер FastAPI

Ищи паттерн вида:
```python
# Что-то вроде:
await nav_service.build_graph(mask_id, rooms, doors, scale_factor=0.05)
# или
await nav_service.build_graph(mask_id, rooms, doors, 0.05)
# или
SCALE_FACTOR = 0.05
await nav_service.build_graph(mask_id, rooms, doors, SCALE_FACTOR)
```

Заменить `0.05` → `0.02` или убрать явную передачу (чтобы использовался дефолт `0.02`).

#### Место 3: Любые конфиги/константы
```bash
grep -rn "SCALE" backend/
grep -rn "scale" backend/app/core/ backend/app/config*
```

### Шаг 3: ВЕРИФИКАЦИЯ ПОСЛЕ ИСПРАВЛЕНИЯ

```bash
# 1. Запустить тесты
pytest
npx tsc --noEmit

# 2. Перестроить граф через UI (шаг 3 → ПОСТРОИТЬ ГРАФ)

# 3. Проверить scale_factor в новом JSON
python3 -c "
import json, glob
files = sorted(glob.glob('uploads/masks/*_nav.json'), key=lambda f: __import__('os').path.getmtime(f))
if files:
    data = json.load(open(files[-1]))
    sf = data['metadata']['scale_factor']
    print(f'scale_factor: {sf}')
    assert sf == 0.02, f'ОШИБКА: scale_factor={sf}, должен быть 0.02!'
    print('✅ scale_factor корректен')
"

# 4. Проверить координаты маршрута через API
# POST /api/v1/reconstructions/{id}/route с from/to room IDs
# Все x координаты должны быть в [0, 17.26] (для маски 863px)
# Все z координаты должны быть в [-7.36, 0] (для маски 368px)
# Если x > 20 — scale всё ещё 0.05
```

---

## Почему именно 0.02

```
mesh_builder.py: pixels_per_meter = 50.0
scale = 1 / pixels_per_meter = 1/50 = 0.02

Формула mesh_builder (через contours_to_polygons + rotation -π/2 X):
  x_3d = x_pix / 50 = x_pix × 0.02
  z_3d = (y_pix - H) / 50 = (y_pix - H) × 0.02

Формула transform_2d_to_3d:
  x_3d = x_pix × scale_factor
  z_3d = (y_pix - H) × scale_factor

→ scale_factor ДОЛЖЕН быть 0.02 для совпадения
```

---

## Чего НЕ делать

- **НЕ менять** `extract_corridor_mask()` — работает правильно
- **НЕ менять** `transform_2d_to_3d()` — формула правильная
- **НЕ менять** `mesh_builder.py`, `pixels_per_meter`
- **НЕ менять** фронтенд (MeshViewer, NavigationPath, RoutePanel)
- **НЕ менять** `build_skeleton`, `integrate_semantics`, `prune_dendrites`
- **НЕ добавлять** центрирование `(x - W/2)` — mesh_builder не центрирует по X
- **НЕ менять** сигнатуру `build_graph()` — дефолт уже 0.02, проблема в ВЫЗЫВАЮЩЕМ коде