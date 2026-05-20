# TICKET: stitching-plans — Сшивание планов этажа из нескольких секций

## Метаданные

- **Приоритет:** Высокий
- **Тип:** Новая фича (research + design + implementation)
- **Затрагивает:** Frontend + Backend + Processing
- **Ветка:** `feature/stitching-plans`
- **Зависит от:** refactor-core (должен быть завершён)

---

## Бизнес-контекст

Один этаж здания часто покрыт несколькими планами эвакуации (левое крыло, правое крыло, разные секции). Каждый план загружается и обрабатывается отдельно — бинаризация, векторизация, разметка кабинетов, дверей. Но для построения полной 3D-модели этажа и сквозной навигации (A*) нужна единая карта.

**Фича "Сшивание планов"** позволяет:
1. Выбрать ≥2 уже обработанных плана одного этажа
2. Разместить их на общем холсте, совмещая по стенам и коридорам
3. Обрезать зоны перекрытия и лишние элементы (рамки, легенды)
4. Объединить в одну реконструкцию с сохранением ВСЕХ размеченных кабинетов, дверей, стен

Результат — новая реконструкция. Исходные планы не изменяются.

---

## Пользовательский флоу (4 шага)

### Шаг 1 — Форма выбора (отдельная страница до холста)

Пользователь попадает сюда через пункт меню **"Сшивание планов"**.

**Что на странице:**
- Dropdown "Здание" — выбор из существующих зданий
- Поле "Номер этажа" — числовой ввод
- Список доступных планов — карточки с превью (только реконструкции, прошедшие полный пайплайн: бинаризация + векторизация + разметка кабинетов). Каждая карточка: миниатюра плана, название реконструкции, дата создания. Чекбокс для выбора.
- Кнопка "> Далее" — активна только при выбранных ≥2 планах

**Граничные случаи:**
- Если готовых планов < 2: сообщение "Для сшивания нужно минимум 2 обработанных плана" + кнопка "Загрузить план" → редирект на AddReconstructionPage
- Если зданий нет: возможность создать новое (inline-поле или модалка)

### Шаг 2 — Редактор сшивания (основной экран)

Полноэкранный редактор. Структура экрана:
- **Сверху:** степпер-точки (прогресс по шагам)
- **Основная область (слева):** холст Fabric.js
- **Правая панель (260px):** инструменты, слои, свойства
- **Снизу:** кнопки "Назад" / "> СШИТЬ"

Подробное описание каждого элемента — ниже в разделе "Детальное описание UI".

### Шаг 3 — Подтверждение сшивания

При нажатии "> СШИТЬ":
- Фронт собирает трансформации и clip-полигоны всех слоёв
- Отправляет POST на бэкенд
- Показывает индикатор обработки
- При успехе — редирект на страницу новой реконструкции

### Шаг 4 — Построение 3D

На странице новой реконструкции пользователь видит объединённую векторную маску. Кнопка "Построить граф" → навигационный граф → кнопка "Построить 3D" → 3D-модель. Стандартный флоу, как при загрузке плана.

---

## Детальное описание UI редактора сшивания

### КРИТИЧЕСКИ ВАЖНО: Стиль

Интерфейс редактора сшивания должен **точно повторять** стиль существующего редактора стен (EditReconstructionPage):

- **Тёмная тема:** фон `#1e1e1e`, панель `#1e1e1e`, холст `#2a2a2a`
- **Оранжевый акцент:** `#E8593C` для активных элементов, кнопки "> СШИТЬ", рамки выделения
- **Секции правой панели:** заголовки в формате `// ЗАГОЛОВОК` (uppercase, letter-spacing: 3px, цвет #888)
- **Кнопки инструментов:** крупные карточки с иконкой (SVG, 18px) + текст, фон `#2a2a2a`, border `#444`, активная — border `#E8593C`, текст `#E8593C`
- **Нижняя панель:** "Назад" (чёрная `#111`) слева, "> СШИТЬ" (оранжевая) справа — как "Назад" / "> Далее" в существующем UI
- **Степпер-точки:** вверху по центру, оранжевые = пройдены, белая = текущий, серые = впереди

**Reference-файлы для стиля:**
- `frontend/src/pages/EditReconstructionPage.tsx` — общий layout
- `frontend/src/pages/AddReconstructionPage.tsx` — форма выбора, степпер
- `frontend/src/components/Editor/` — компоненты панели инструментов
- `frontend/src/components/MaskEditor.tsx` — работа с Fabric.js canvas

НЕ изобретать новый дизайн. Брать стили, компоненты и паттерны из существующего кода.

### Правая панель — три секции

#### Секция 1: `// ИНСТРУМЕНТЫ`

Четыре кнопки-инструмента (вертикальный список, иконка + текст):

1. **Перемещение** (иконка: стрелки в 4 стороны) — режим по умолчанию. Выбранный план можно перетаскивать.
2. **Вращение** (иконка: круговая стрелка) — клик по плану и drag = свободное вращение. Shift+drag = шаг 15°.
3. **Кадрирование** (иконка: прямоугольник пунктиром) — прямоугольный crop. Пользователь тянет прямоугольную область на выбранном плане, нажимает Enter или кнопку "Обрезать" — всё снаружи прямоугольника удаляется.
4. **Полигон. обрезка** (иконка: замкнутый многоугольник с точками) — полигональный crop. Пользователь ставит точки кликами. Последний клик на первую точку = замыкание полигона. После замыкания: **всё внутри полигона удаляется**. Используется для вырезания зон перекрытия и ненужных элементов.

Активный инструмент выделен оранжевой рамкой (как "Нарисовать стену" на скриншоте).

#### Секция 2: `// СЛОИ`

Карточка на каждый план. Внутри карточки:

- **Цветная метка** (8x8px квадрат) — уникальный цвет для каждого плана (первый — оранжевый `#E8593C`, второй — синий `#5b9bd5`, третий — зелёный `#5fba7d`, и т.д.). Тот же цвет используется для рамки плана на холсте, для стен в маске, для дверей.
- **Название** — из исходной реконструкции, сокращённое
- **Стрелки вверх/вниз** — кнопки для изменения z-order (какой план рисуется поверх какого)
- **Grip-ручка** (три горизонтальных полоски) — drag-and-drop для перетаскивания слоёв между собой (альтернатива стрелкам)
- **Размер** — "1200 x 900 px"
- **Ползунок "Маска"** — прозрачность векторной маски для этого плана (0% = маска не видна, 100% = полностью непрозрачна). По умолчанию 50-60%.
- **Тоггл "Показать маску"** — вкл/выкл наложение векторной маски целиком (для того чтобы видеть чистое растровое изображение под ней)

Выбранный слой — оранжевая рамка. Клик по слою = выделение на холсте.

#### Секция 3: `// СВОЙСТВА СЛОЯ`

Отображает и позволяет редактировать параметры выбранного (активного) слоя:

- **X** — горизонтальная позиция (ползунок + числовое значение)
- **Y** — вертикальная позиция (ползунок + числовое значение)
- **Угол** (иконка вращения) — ползунок 0°–360° + числовое значение
- **Масштаб** (иконка %) — ползунок 50%–200% + числовое значение

Изменение значений в этой секции мгновенно обновляет план на холсте (и наоборот — перетаскивание на холсте обновляет значения).

### Холст (основная область)

#### Что на холсте

Каждый выбранный план отображается как **группа из двух слоёв**:
1. **Растровое изображение** (фото исходного плана эвакуации) — всегда видно
2. **Векторная маска поверх** — полупрозрачное наложение: линии стен, контуры комнат, подписи кабинетов (A301, 1103 и т.д.), точки дверей. Цвет маски = уникальный цвет слоя. Прозрачность управляется ползунком в панели слоёв.

Рамка плана на холсте — пунктирная линия цвета слоя.

#### Взаимодействие на холсте

**Перемещение плана:** drag по любой точке плана (в режиме "Перемещение").

**Масштабирование:** 4 угловых ручки. Тянешь за ручку = resize. Shift+drag = пропорциональное масштабирование.

**Вращение через углы (как в Photoshop):** Когда курсор находится рядом с угловой ручкой, но чуть снаружи (~15px зона), он превращается в иконку вращения (закруглённая стрелка). Зажатие мыши в этой зоне = вращение вокруг центра плана. Shift = привязка к шагу 15° (0°, 15°, 30°, 45°, ...). Это стандартное поведение Fabric.js — нужно настроить `cornerStyle`, `rotatingPointOffset`, и кастомный cursor через `cursorStyleHandler`.

**Zoom холста:** колёсико мыши (с Ctrl или без — решить по аналогии с MaskEditor). Кнопки +/- в правом нижнем углу. Кнопка "Вписать все" (fit all).

**Pan холста:** зажать Пробел + мышь = перемещение (подсказка вверху холста: "Пробел + мышь = перемещение холста").

#### Undo/Redo

Кнопки в левом верхнем углу холста (иконки стрелки назад/вперёд).

Горячие клавиши: **Ctrl+Z** = undo, **Ctrl+Shift+Z** = redo.

Стек состояний хранит snapshot после каждого действия:
- Перемещение плана → сохранить
- Вращение → сохранить
- Масштабирование → сохранить
- Crop (прямоугольный или полигональный) → сохранить
- Изменение z-order → сохранить

Каждый snapshot содержит:
```typescript
interface StitchingSnapshot {
  layers: Array<{
    reconstructionId: string;
    transform: { x: number; y: number; scaleX: number; scaleY: number; angle: number };
    clipPaths: ClipPath[];  // все обрезки, применённые к этому слою
    zIndex: number;
  }>;
}
```

Максимум snapshots: 50 (FIFO — самые старые удаляются при переполнении).

---

## API: Контракт между фронтом и бэкендом

### GET /api/v1/reconstructions/?status=ready_for_stitching

Возвращает список реконструкций, у которых есть готовая векторная модель с размеченными кабинетами. Используется для шага 1 (выбор планов).

Фильтрация: только реконструкции со статусом, подтверждающим завершение разметки (или наличие wall_data + rooms). Точную логику фильтрации определить по текущей модели данных.

### POST /api/v1/stitching/

**Request:**
```json
{
  "name": "Этаж 3 — полный план",
  "building_id": "uuid-building",
  "floor_number": 3,
  "source_plans": [
    {
      "reconstruction_id": "uuid-plan-A",
      "transform": {
        "translate_x": 0.0,
        "translate_y": 0.0,
        "scale_x": 1.0,
        "scale_y": 1.0,
        "rotation_deg": 0.0
      },
      "clip_polygons": [
        {
          "type": "subtract",
          "points": [[x1, y1], [x2, y2], [x3, y3], ...]
        }
      ],
      "rect_crop": {
        "x": 10,
        "y": 20,
        "width": 500,
        "height": 400
      } | null,
      "image_width_px": 1200,
      "image_height_px": 900,
      "z_index": 0
    },
    {
      "reconstruction_id": "uuid-plan-B",
      "transform": {
        "translate_x": 450.0,
        "translate_y": 12.0,
        "scale_x": 1.02,
        "scale_y": 1.02,
        "rotation_deg": 0.0
      },
      "clip_polygons": [
        {
          "type": "subtract",
          "points": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
        }
      ],
      "rect_crop": null,
      "image_width_px": 1180,
      "image_height_px": 880,
      "z_index": 1
    }
  ]
}
```

**Пояснение полей:**
- `transform` — позиция, масштаб и поворот плана на холсте (из Fabric.js: `left`, `top`, `scaleX`, `scaleY`, `angle`)
- `clip_polygons` — массив полигонов для обрезки. `type: "subtract"` = удалить внутри. Координаты в пространстве холста (пиксели).
- `rect_crop` — прямоугольная обрезка (если была). Координаты в пространстве исходного изображения.
- `image_width_px`, `image_height_px` — размер исходного изображения (нужен для денормализации координат из [0,1])
- `z_index` — порядок наложения (0 = нижний слой)

**Response (201 Created):**
```json
{
  "id": "uuid-new-reconstruction",
  "name": "Этаж 3 — полный план",
  "status": "stitched",
  "source_reconstruction_ids": ["uuid-plan-A", "uuid-plan-B"],
  "building_id": "uuid-building",
  "floor_number": 3,
  "rooms_count": 12,
  "walls_count": 45
}
```

---

## Бэкенд: Алгоритм слияния (processing pipeline)

### Общий порядок

```
Для каждого source_plan:
  1. Загрузить векторную модель из БД (стены, комнаты, двери)
  2. Применить rect_crop (если есть) — обрезать в пространстве изображения
  3. Денормализация координат [0,1] → пиксели исходного изображения
  4. Аффинная трансформация (scale → rotate → translate) — перевод в пространство холста
  5. Применить clip_polygons (вычесть зоны обрезки)
  6. Проверить комнаты/двери: попали ли в зону обрезки → отбросить

Затем:
  7. Объединить все стены, комнаты, двери в единые массивы
  8. Проверка на дубликаты (одинаковые названия комнат рядом)
  9. Вычислить bounding box объединённой модели
  10. Перенормализация всех координат к [0, 1] относительно bounding box
  11. Сохранить как новую реконструкцию
```

### Шаг 1 — Загрузка моделей

Через `ReconstructionRepository`: для каждого `reconstruction_id` достать:
- `walls` — массив полилиний (каждая полилиния = массив точек [x, y] в [0, 1])
- `rooms` — массив: `{ name, room_type, center: [x, y], polygon: [[x, y], ...] }` в [0, 1]
- `doors` — массив: `{ position: [x, y], orientation? }` в [0, 1]

### Шаг 2 — Прямоугольная обрезка (rect_crop)

Если `rect_crop` не null — это обрезка в пространстве исходного изображения (до трансформации).

```python
def apply_rect_crop(
    walls: list[Polyline],
    rooms: list[Room],
    doors: list[Door],
    crop: RectCrop,
    image_size: tuple[int, int],
) -> tuple[list[Polyline], list[Room], list[Door]]:
    """Обрезать модель прямоугольником в пространстве изображения.
    
    crop — координаты в пикселях изображения.
    Нормализованные координаты сначала денормализуются,
    потом обрезаются, потом нормализуются к новому размеру.
    """
```

### Шаг 3 — Денормализация

```python
# Координаты [0,1] → пиксели исходного изображения
x_px = x_norm * image_width_px
y_px = y_norm * image_height_px
```

### Шаг 4 — Аффинная трансформация

**Порядок: scale → rotate → translate.** Это соответствует тому, как Fabric.js применяет трансформации.

```python
import numpy as np

def build_affine_matrix(
    scale_x: float,
    scale_y: float,
    rotation_deg: float,
    translate_x: float,
    translate_y: float,
) -> np.ndarray:
    """Построить матрицу аффинной трансформации 3x3.
    
    Порядок: scale → rotate → translate.
    
    Returns:
        np.ndarray shape (3, 3)
    """
    theta = np.radians(rotation_deg)
    cos_t, sin_t = np.cos(theta), np.sin(theta)
    
    # Scale
    S = np.array([
        [scale_x, 0,       0],
        [0,       scale_y, 0],
        [0,       0,       1],
    ])
    
    # Rotate
    R = np.array([
        [cos_t, -sin_t, 0],
        [sin_t,  cos_t, 0],
        [0,      0,     1],
    ])
    
    # Translate
    T = np.array([
        [1, 0, translate_x],
        [0, 1, translate_y],
        [0, 0, 1],
    ])
    
    return T @ R @ S


def apply_affine_to_point(matrix: np.ndarray, x: float, y: float) -> tuple[float, float]:
    """Применить аффинную матрицу к точке."""
    pt = np.array([x, y, 1.0])
    result = matrix @ pt
    return float(result[0]), float(result[1])


def apply_affine_to_polygon(matrix: np.ndarray, points: list[list[float]]) -> list[list[float]]:
    """Применить аффинную матрицу ко всем точкам полигона."""
    return [list(apply_affine_to_point(matrix, p[0], p[1])) for p in points]
```

**Одна матрица на весь план** — одна и та же матрица применяется к стенам, комнатам (и их центрам, и их полигонам), дверям. Это гарантирует, что взаимное расположение объектов внутри плана не нарушится.

### Шаг 5 — Clip polygons (вычитание зон обрезки)

Используем Shapely. Координаты clip-полигонов приходят в пространстве холста (уже трансформированном).

```python
from shapely.geometry import Polygon, LineString, MultiLineString, Point

def clip_walls(
    walls: list[Polyline],
    clip_polygon: Polygon,
) -> list[Polyline]:
    """Вычесть clip_polygon из стен.
    
    Стены, целиком внутри clip_polygon — удаляются.
    Стены, пересекающие границу — подрезаются.
    Стены, целиком снаружи — остаются без изменений.
    """
    result = []
    for wall in walls:
        line = LineString(wall.points)
        diff = line.difference(clip_polygon)
        if diff.is_empty:
            continue
        if isinstance(diff, LineString):
            result.append(Polyline(points=list(diff.coords)))
        elif isinstance(diff, MultiLineString):
            for part in diff.geoms:
                result.append(Polyline(points=list(part.coords)))
    return result


def clip_rooms(
    rooms: list[Room],
    clip_polygon: Polygon,
) -> list[Room]:
    """Отбросить комнаты, чей центр попал внутрь clip-зоны.
    
    Если центр внутри clip_polygon — комната удаляется.
    Если полигон комнаты частично пересекает clip — подрезаем полигон,
    пересчитываем центр. Название и тип сохраняются.
    """
    result = []
    for room in rooms:
        center_pt = Point(room.center)
        if clip_polygon.contains(center_pt):
            continue  # Комната в зоне обрезки — отбрасываем
        
        room_poly = Polygon(room.polygon)
        if clip_polygon.intersects(room_poly):
            # Подрезаем полигон комнаты
            clipped = room_poly.difference(clip_polygon)
            if clipped.is_empty:
                continue
            new_center = [clipped.centroid.x, clipped.centroid.y]
            new_polygon = list(clipped.exterior.coords)
            result.append(Room(
                name=room.name,
                room_type=room.room_type,
                center=new_center,
                polygon=new_polygon,
            ))
        else:
            result.append(room)
    return result


def clip_doors(
    doors: list[Door],
    clip_polygon: Polygon,
) -> list[Door]:
    """Отбросить двери, попавшие внутрь clip-зоны."""
    return [
        door for door in doors
        if not clip_polygon.contains(Point(door.position))
    ]
```

### Шаг 6-7 — Объединение

Конкатенация всех трансформированных и обрезанных моделей:

```python
merged_walls = plan_a_walls + plan_b_walls + ...
merged_rooms = plan_a_rooms + plan_b_rooms + ...
merged_doors = plan_a_doors + plan_b_doors + ...
```

### Шаг 8 — Проверка дубликатов

```python
def check_duplicate_rooms(rooms: list[Room], distance_threshold: float = 30.0) -> list[str]:
    """Найти комнаты с одинаковыми названиями, расположенные рядом.
    
    Если две комнаты имеют одинаковое name и расстояние между центрами
    < distance_threshold пикселей — это значит, пользователь не до конца
    обрезал зону перекрытия.
    
    Returns:
        Список предупреждений (пустой, если дубликатов нет).
    """
```

Если дубликаты найдены — включить `warnings` в ответ API (не блокировать, просто предупредить).

### Шаг 9-10 — Bounding box + перенормализация

```python
def normalize_to_bounding_box(
    walls: list[Polyline],
    rooms: list[Room],
    doors: list[Door],
) -> tuple[list[Polyline], list[Room], list[Door]]:
    """Перенормализовать все координаты к [0, 1] относительно bounding box.
    
    1. Найти min_x, min_y, max_x, max_y по всем точкам всех стен
    2. Для каждой точки: x_norm = (x - min_x) / (max_x - min_x)
    3. Применить ко всем стенам, центрам комнат, полигонам комнат, позициям дверей
    """
```

### Шаг 11 — Сохранение

Создать новую запись Reconstruction в БД:
- `name` из запроса
- `building_id`, `floor_number` из запроса
- `status` = "stitched" (или новый статус, если нужно)
- `source_reconstruction_ids` = массив id исходных планов (для трассировки)
- `walls`, `rooms`, `doors` = объединённые данные

Растровое изображение для сшитой реконструкции: сшить растровые изображения исходных планов с применением тех же трансформаций (для превью и для дальнейшей работы). Использовать OpenCV `warpAffine` + наложение.

---

## Структура новых файлов

### Backend

```
backend/app/
├── api/
│   └── stitching.py                      ← Роутер: POST /api/v1/stitching/
├── models/
│   └── stitching.py                      ← Pydantic: StitchingRequest, StitchingResponse,
│                                            SourcePlanInput, TransformInput, ClipPolygonInput
├── services/
│   └── stitching_service.py              ← Оркестрация: загрузка → трансформация → clip → merge → сохранение
├── processing/
│   └── stitching/
│       ├── __init__.py                   ← Экспорт: build_affine_matrix, apply_affine, clip_walls, ...
│       ├── transform.py                  ← Чистые функции: build_affine_matrix, apply_affine_to_point,
│       │                                   apply_affine_to_polygon
│       ├── clip.py                       ← Чистые функции: clip_walls, clip_rooms, clip_doors
│       │                                   (Shapely: difference, contains, intersects)
│       ├── merge.py                      ← Чистые функции: merge_models, normalize_to_bounding_box,
│       │                                   check_duplicate_rooms
│       └── image_stitch.py              ← Чистая функция: stitch_raster_images
│                                           (OpenCV warpAffine + наложение)
└── db/
    └── repositories/
        └── (использовать существующий ReconstructionRepository)
```

### Frontend

```
frontend/src/
├── pages/
│   └── StitchingPage.tsx                 ← Страница-компоновщик: шаг 1 (форма) → шаг 2 (редактор)
├── components/
│   └── Stitching/
│       ├── PlanSelectionStep.tsx          ← Шаг 1: форма выбора (здание, этаж, карточки планов)
│       ├── StitchingCanvas.tsx           ← Холст Fabric.js (основная логика canvas)
│       ├── LayerPanel.tsx                ← Секция "// СЛОИ": карточки слоёв, drag-and-drop, z-order
│       ├── ToolPanel.tsx                 ← Секция "// ИНСТРУМЕНТЫ": кнопки инструментов
│       ├── PropertiesPanel.tsx           ← Секция "// СВОЙСТВА СЛОЯ": X, Y, угол, масштаб
│       └── StitchingSidebar.tsx          ← Сборка правой панели (ToolPanel + LayerPanel + PropertiesPanel)
├── hooks/
│   ├── useStitching.ts                   ← Основная логика: загрузка планов, состояние, API-вызов
│   ├── useStitchingCanvas.ts             ← Логика работы с Fabric.js canvas
│   └── useStitchingHistory.ts            ← Undo/redo стек
├── types/
│   └── stitching.ts                      ← TypeScript типы: StitchingState, LayerData,
│                                           TransformData, ClipPolygon, StitchingRequest, ...
└── api/
    └── (добавить методы в apiService.ts) ← getReadyReconstructions(), postStitching()
```

### Роутинг

Добавить в `App.tsx`:
```tsx
<Route path="/stitching" element={<StitchingPage />} />
```

Добавить пункт "Сшивание планов" в меню/sidebar (рядом с существующими пунктами).

---

## Взаимодействие Fabric.js — детали реализации

### Инициализация canvas

```typescript
const canvas = new fabric.Canvas('stitching-canvas', {
  backgroundColor: '#2a2a2a',
  selection: false,             // Отключить групповое выделение
  preserveObjectStacking: true, // z-order управляется вручную
});
```

### Загрузка плана на canvas

Каждый план — `fabric.Group`, содержащий:
1. `fabric.Image` (растровое изображение)
2. Набор `fabric.Line` / `fabric.Polyline` (стены маски)
3. Набор `fabric.Text` (названия кабинетов)
4. Набор `fabric.Circle` (точки дверей)

Маска (пп. 2-4) окрашена в уникальный цвет слоя. Прозрачность маски управляется через `opacity` этих объектов.

```typescript
function loadPlanToCanvas(
  canvas: fabric.Canvas,
  imageUrl: string,
  vectorModel: VectorModel,
  layerColor: string,
  maskOpacity: number,
): fabric.Group {
  // 1. Загрузить растр
  // 2. Создать объекты маски из vectorModel
  // 3. Объединить в fabric.Group
  // 4. Настроить controls (cornerStyle, rotatingPointOffset)
  // 5. Добавить на canvas
}
```

### Вращение через углы (Photoshop-style)

```typescript
// Fabric.js поддерживает это нативно.
// Когда курсор снаружи угла — автоматически режим вращения.
// Нужно только настроить:

group.set({
  cornerStyle: 'circle',       // Круглые ручки
  cornerSize: 8,
  cornerColor: '#1e1e1e',
  cornerStrokeColor: layerColor,
  borderColor: layerColor,
  borderDashArray: [5, 3],
  transparentCorners: false,
  // Rotate cursor появляется автоматически снаружи углов
});

// Привязка к 15° при Shift
canvas.on('object:rotating', (e) => {
  if (e.e.shiftKey) {
    const angle = Math.round(e.target.angle / 15) * 15;
    e.target.angle = angle;
  }
});

// Пропорциональное масштабирование при Shift
canvas.on('object:scaling', (e) => {
  if (e.e.shiftKey) {
    e.target.scaleY = e.target.scaleX;
  }
});
```

### clipPath для полигональной обрезки

```typescript
function applyPolygonClip(group: fabric.Group, points: {x: number, y: number}[]) {
  // Инвертированный clip: вырезать внутри полигона
  // Fabric.js clipPath показывает то что ВНУТРИ, нам нужно наоборот
  // Решение: создать большой прямоугольник с вырезанным полигоном

  const outerRect = new fabric.Rect({
    left: -10000, top: -10000,
    width: 20000, height: 20000,
  });

  const hole = new fabric.Polygon(points, {
    absolutePositioned: true,
  });

  // Использовать SVG path с evenodd fill-rule для вырезания
  // Или использовать inverted clipPath (Fabric.js 5+ поддерживает inverted: true)
  const clipPath = new fabric.Polygon(points, {
    absolutePositioned: true,
    inverted: true,  // Fabric.js 5+: инвертировать — скрыть внутри, показать снаружи
  });

  // Если уже есть clipPaths — объединить (intersection)
  group.clipPath = clipPath;
  canvas.renderAll();
}
```

### Undo/Redo

```typescript
interface HistoryState {
  layers: Array<{
    id: string;
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
    angle: number;
    clipPaths: SerializedClipPath[];
    zIndex: number;
  }>;
}

function useStitchingHistory(maxSteps = 50) {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const pushState = (state: HistoryState) => {
    // Отрезать "будущее" если были undo
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(state);
    // FIFO: удалить самые старые если > maxSteps
    if (newHistory.length > maxSteps) newHistory.shift();
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
  };

  const undo = () => { /* currentIndex-- и применить state */ };
  const redo = () => { /* currentIndex++ и применить state */ };
  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  return { pushState, undo, redo, canUndo, canRedo };
}
```

---

## Тесты

### Backend: processing/stitching/

Обязательные тесты (в `backend/tests/processing/stitching/`):

**transform.py:**
- `test_identity_transform` — нулевая трансформация (0 translate, 1.0 scale, 0° rotate) не меняет координаты
- `test_translation_only` — точка (0, 0) + translate (100, 50) → (100, 50)
- `test_scale_only` — точка (10, 20) + scale (2.0, 2.0) → (20, 40)
- `test_rotation_90` — точка (10, 0) + rotate 90° → (0, 10) (с погрешностью float)
- `test_combined_transform` — scale + rotate + translate в правильном порядке
- `test_polygon_transform` — все точки полигона трансформируются одинаково

**clip.py:**
- `test_wall_fully_inside_clip` — стена целиком внутри clip → удалена
- `test_wall_fully_outside_clip` — стена целиком снаружи → осталась без изменений
- `test_wall_partially_clipped` — стена пересекает clip → подрезана (2 сегмента)
- `test_room_center_inside_clip` — комната отброшена
- `test_room_center_outside_clip` — комната осталась
- `test_room_polygon_partially_clipped` — полигон подрезан, центр пересчитан
- `test_door_inside_clip` — дверь отброшена
- `test_door_outside_clip` — дверь осталась

**merge.py:**
- `test_merge_two_models` — стены + комнаты + двери объединены, длины массивов = сумма
- `test_normalization` — после нормализации все координаты в [0, 1]
- `test_duplicate_rooms_detected` — две комнаты "A304" рядом → warning
- `test_no_false_duplicate` — две комнаты "A304" далеко друг от друга → нет warning

**КРИТИЧЕСКИЙ тест — end-to-end:**
- `test_room_names_preserved_after_full_pipeline` — создать 2 модели с комнатами (A301, A302) и (A303, A304), применить трансформации, merge, нормализовать. Проверить, что все 4 комнаты присутствуют, названия совпадают, координаты в [0, 1].
- `test_door_positions_match_walls_after_transform` — после трансформации двери по-прежнему находятся на стенах (а не внутри или снаружи)

---

## Порядок реализации (рекомендуемый)

### Фаза 1: Backend processing (чистые функции)

1. Создать `processing/stitching/transform.py` + тесты
2. Создать `processing/stitching/clip.py` + тесты
3. Создать `processing/stitching/merge.py` + тесты
4. Проверить: `pytest tests/processing/stitching/ -v`

### Фаза 2: Backend API

5. Создать `models/stitching.py` (Pydantic)
6. Создать `services/stitching_service.py`
7. Создать `api/stitching.py` (роутер)
8. Зарегистрировать роутер в `main.py`
9. Проверить: `python -c "from app.main import app"` + ручной тест через Swagger

### Фаза 3: Frontend — шаг 1 (выбор планов)

10. Создать `types/stitching.ts`
11. Добавить API-методы в `apiService.ts`
12. Создать `PlanSelectionStep.tsx`
13. Создать `StitchingPage.tsx` (пока только шаг 1)
14. Добавить роут + пункт меню
15. Проверить: `npx tsc --noEmit`

### Фаза 4: Frontend — шаг 2 (редактор)

16. Создать `useStitchingHistory.ts`
17. Создать `useStitchingCanvas.ts`
18. Создать `StitchingCanvas.tsx`
19. Создать `ToolPanel.tsx`, `LayerPanel.tsx`, `PropertiesPanel.tsx`
20. Создать `StitchingSidebar.tsx`
21. Создать `useStitching.ts` (объединение)
22. Собрать всё в `StitchingPage.tsx` (шаг 1 → шаг 2)
23. Проверить: `npx tsc --noEmit` + ручное тестирование

### Фаза 5: Сшивание растрового изображения

24. Создать `processing/stitching/image_stitch.py` — OpenCV `warpAffine` для сшивания растров
25. Интегрировать в `stitching_service.py` — сохранять сшитое растровое изображение для превью

---

## Общие правила (из ONBOARDING.md, соблюдать ВЕЗДЕ)

### Backend
- `processing/stitching/` — **ЧИСТЫЕ функции**: нет DB, нет HTTP, нет file I/O, нет state
- **Не мутировать** входные `np.ndarray` и списки — `.copy()` перед изменением
- **Type hints** на всех функциях (аргументы + return)
- **Docstrings** на всех публичных функциях
- **`logging`** вместо `print()`
- **Pydantic v2** для Request/Response
- Тонкий роутер → сервис → репозиторий (как после рефакторинга)
- DI через `Depends()` (не singleton)

### Frontend
- TypeScript **strict mode**, **`any` запрещён**
- Логика в **hooks**, компоненты — только рендеринг
- Three.js объекты (если используются) — **`dispose()` cleanup** при unmount
- Fabric.js canvas — **`dispose()`** при unmount компонента
- Все типы — **явные interface** (не `Record<string, unknown>` без нужды)
- Стили — **точно как в существующем UI** (EditReconstructionPage, MaskEditor)

### Git
- Коммит после каждой фазы
- Коммиты **на русском**
- **НЕ добавлять `Co-authored-by: Claude`**

---

## Что НЕ входит в этот тикет

- Многоэтажная навигация (отдельный тикет: pathfinding-astar)
- Автоматическое выравнивание планов (image registration / feature matching) — может быть добавлено позже как улучшение
- Автоматическое определение зон перекрытия — пользователь обрезает вручную
- Редактирование сшитой модели (правка стен, кабинетов) — используется существующий редактор