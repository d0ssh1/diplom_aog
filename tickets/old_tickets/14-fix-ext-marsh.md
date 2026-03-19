# Тикет 23: Маршрут идёт вокруг здания снаружи — corridor_mask выбирает экстерьер

## Статус: TODO
## Приоритет: КРИТИЧЕСКИЙ (блокирует всю навигацию)
## Затрагиваемые файлы:
- `backend/app/processing/nav_graph.py` → функция `extract_corridor_mask()` (основной фикс)
- `backend/app/services/nav_service.py` → фоллбэк `scale_factor` (минорный фикс)

---

## Симптомы

1. В 3D-сцене (шаг 5) бирюзовая линия маршрута проходит **вокруг здания снаружи**, а не по внутренним коридорам
2. На overlay-дебаге (`_6_overlay.png`) синяя область corridor_mask покрывает **всё пространство вне здания**
3. Скелет (жёлтые линии) идёт по **внешнему периметру** стен здания
4. Все corridor_node лежат на периметре: (23,169), (857,195), (860,266), (79,317)...
5. Двери привязываются к скелету экстерьера на огромных расстояниях:
   - Дверь 1: pos=(564, 146) → entry=(564, **19**) — snap distance **127px вверх**
   - Дверь 2: pos=(281, 75) → entry=(281, **20**) — snap distance **55px вверх**

## Корневая причина

### Баг в `extract_corridor_mask()` (nav_graph.py, строки ~48-59)

Текущий алгоритм:
```python
# 4. Связные компоненты
num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(closed_free, connectivity=8)

# 5. Самый большой компонент = коридор (label=0 это фон)
biggest_label = -1
biggest_area = 0
for label_id in range(1, num_labels):
    area = stats[label_id, cv2.CC_STAT_AREA]
    if area > biggest_area:
        biggest_area = area
        biggest_label = label_id
```

**Проблема:** После инверсии маски и дилатации стен, `connectedComponentsWithStats` находит связные области свободного пространства. Самая большая область — это **ВСЕГДА экстерьер** (пространство вне здания), потому что оно занимает всё до краёв изображения. Внутренний коридор — вторая или третья по размеру область, но алгоритм берёт первую.

### Цепочка последствий:
```
extract_corridor_mask → выбирает ЭКСТЕРЬЕР как "коридор"
  → build_skeleton → скелетонизирует ЭКСТЕРЬЕР  
    → скелет идёт по внешнему периметру здания
      → integrate_semantics → двери snap'ятся к периметру (127px!)
        → find_route → маршрут идёт по периметру
          → transform_2d_to_3d → бирюзовая линия вокруг здания
```

### Второстепенный баг: scale_factor в JSON

Новый `_nav.json` всё ещё содержит `"scale_factor": 0.05` вместо `0.02`. Это проблема из тикета 22 — либо фикс `build_graph(scale_factor=0.02)` не применён, либо фоллбэк в `find_route` перезаписывает значение. Но это **вторичная** проблема — даже с правильным scale маршрут будет идти снаружи.

---

## Исправление

### Часть A: Исключить экстерьер из corridor_mask (ОСНОВНОЙ ФИКС)

**Файл:** `backend/app/processing/nav_graph.py`
**Функция:** `extract_corridor_mask()`
**Место:** после `connectedComponentsWithStats`, перед выбором `biggest_label` (строки ~48-59)

**Логика:** Экстерьер ВСЕГДА касается границ изображения (строка 0, строка H-1, столбец 0, столбец W-1). Внутренние коридоры обычно не касаются. Нужно исключить все компоненты, пиксели которых попадают на границу маски, и выбрать самый большой из оставшихся.

**Было (строки ~48-59):**
```python
# 4. Связные компоненты
num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
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
```

**Стало:**
```python
# 4. Связные компоненты
num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
    closed_free, connectivity=8
)

# 5. Определить компоненты, касающиеся границ изображения (= экстерьер)
h_mask, w_mask = closed_free.shape[:2]
border_labels = set()
border_labels.update(labels[0, :].flat)           # верхняя строка
border_labels.update(labels[h_mask - 1, :].flat)   # нижняя строка
border_labels.update(labels[:, 0].flat)             # левый столбец
border_labels.update(labels[:, w_mask - 1].flat)    # правый столбец
border_labels.discard(0)                            # фон не считается

# 6. Самый большой ВНУТРЕННИЙ компонент = коридор
biggest_label = -1
biggest_area = 0
for label_id in range(1, num_labels):
    if label_id in border_labels:
        continue  # пропускаем экстерьер
    area = stats[label_id, cv2.CC_STAT_AREA]
    if area > biggest_area:
        biggest_area = area
        biggest_label = label_id

# 7. Фоллбэк: если ВСЕ компоненты касаются границ,
#    берём самый большой из всех (старое поведение)
if biggest_label == -1:
    logger.warning("extract_corridor_mask: all components touch border, using biggest overall")
    for label_id in range(1, num_labels):
        area = stats[label_id, cv2.CC_STAT_AREA]
        if area > biggest_area:
            biggest_area = area
            biggest_label = label_id
```

**Важно:** Остальной код функции (строки после выбора biggest_label — создание corridor_rough, расширение обратно, вычитание комнат) — **НЕ МЕНЯТЬ**. Меняется только логика выбора `biggest_label`.

### Часть B: Исправить фоллбэк scale_factor (МИНОРНЫЙ ФИКС)

**Файл:** `backend/app/services/nav_service.py`
**Метод:** `find_route()` (примерно строка 98)

**Было:**
```python
scale_factor = metadata.get('scale_factor', 0.05)
```

**Стало:**
```python
scale_factor = metadata.get('scale_factor', 0.02)
```

### Часть C: Убедиться что build_graph передаёт scale_factor=0.02

**Файл:** `backend/app/services/nav_service.py`
**Метод:** `build_graph()` (сигнатура)

Проверить что в сигнатуре стоит `scale_factor: float = 0.02`. Если стоит `0.05` — заменить на `0.02`.

---

## Чего НЕ делать

- **НЕ менять** логику дилатации стен (kernel=7, iterations=2) — она работает правильно
- **НЕ менять** `build_skeleton()`, `build_topology_graph()`, `integrate_semantics()` — алгоритмы корректны, проблема только на входе (corridor_mask)
- **НЕ менять** `transform_2d_to_3d()` — формула правильная
- **НЕ менять** `mesh_builder.py`, `MeshViewer.tsx`, `NavigationPath.tsx`, `apiService.ts`
- **НЕ менять** `prune_dendrites()` — параметры пранинга не связаны с этим багом
- **НЕ менять** порядок шагов 6-7 (corridor_rough → расширение → bitwise_and) после выбора biggest_label — эта часть работает правильно, просто получала неверный label на входе
- **НЕ добавлять** дополнительную морфологию (MORPH_OPEN, erosion и т.д.) — проблема не в шуме

---

## Верификация

### 1. Визуальная проверка debug-изображений

После фикса перестроить граф и проверить 6 debug-изображений:

- **`_4_corridor.png`** — должна показывать **ВНУТРЕННИЕ** коридоры (горизонтальный проход в нижней части плана), а **НЕ** пространство вокруг здания
- **`_5_skeleton.png`** — скелет должен идти **внутри** коридора, а не по периметру
- **`_6_overlay.png`** — синяя зона (коридор) внутри здания; жёлтый скелет внутри коридора; красные/зелёные точки (комнаты/двери) связаны с скелетом на разумных расстояниях (< 30px)

### 2. Проверка snap-расстояний

В логах `integrate_semantics` (или вручную через debug) snap-расстояние дверь→entry должно быть **< 50px**. Если > 100px — двери привязываются к неверному скелету.

### 3. Проверка nav.json

```bash
cat uploads/masks/<id>_nav.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('scale_factor:', data['metadata']['scale_factor'])  # должен быть 0.02

for n in data['graph']['nodes']:
    if n['type'] == 'corridor_node':
        x, y = n['pos']
        # Для маски 863x368: внутренний коридор примерно y=200-350, x=80-800
        # Если все узлы на краях (x<30 или x>830 или y<30) — экстерьер (баг)
        print(f'{n[\"id\"]:>4} pos=({x:.0f},{y:.0f})')
"
```

Corridor_node должны быть **внутри здания** (для данного плана: примерно x=80-830, y=200-350 для нижнего коридора). Если узлы на краях маски — фикс не сработал.

### 4. Маршрут в 3D

Построить маршрут между двумя комнатами. Бирюзовая линия должна идти:
- Из центра комнаты → через дверь → по коридору → через дверь → в центр комнаты
- **Внутри** 3D-модели, а не вокруг неё

### 5. Тесты

```bash
pytest
npx tsc --noEmit
```

---

## Контекст: почему экстерьер всегда побеждает

```
Маска стен (белый = стены):
┌─────────────────────────────┐
│         ████████████        │  ← внешние стены
│         █  комн  █          │
│         █        █  ← внутренние стены
│         ████ ██████         │
│         █ коридор █         │  ← ВНУТРЕННИЙ коридор (~15% площади)
│         ████████████        │
│                             │  ← ЭКСТЕРЬЕР (~70% площади)
└─────────────────────────────┘

Инверсия (свободное пространство):
┌─────────────────────────────┐
│ XXXXXXXX          XXXXXXXXX │  ← экстерьер (X) — САМЫЙ БОЛЬШОЙ
│ XXXXXXXX  комн    XXXXXXXXX │
│ XXXXXXXX          XXXXXXXXX │
│ XXXXXXXX    XXXXXX XXXXXXXX │
│ XXXXXXXX коридор  XXXXXXXXX │  ← коридор — ВТОРОЙ по размеру
│ XXXXXXXX          XXXXXXXXX │
│ XXXXXXXXXXXXXXXXXXXXXXXXXXX │
└─────────────────────────────┘

connectedComponentsWithStats берёт biggest → X (экстерьер) → БАГ
```

Фикс: собрать label'ы из 4 границ изображения → это экстерьер → пропустить → взять самый большой из оставшихся = коридор.

---

## Связанные тикеты
- Тикет 22: Изоляция дверных проёмов + координаты (✅ — ввёл дилатацию, но не учёл экстерьер)
- Тикет 20: A* поиск пути + визуализация (✅)
- Тикет 19: Навигационный граф: генерация + экран (✅)