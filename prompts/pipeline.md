# Pipeline: Обработка изображений

## Общий пайплайн

```
RAW IMAGE
    ↓
[1] Preprocessing        → нормализованное grayscale изображение
    ↓
[2] Text Removal         → изображение без текста и символов
    ↓
[3] Wall Vectorization   → список полилиний стен (JSON)
    ↓
[4] FloorPlan Assembly   → доменная модель FloorPlan
    ↓
[5] 3D Build             → Three.js совместимый JSON (geometry)
```

Каждый шаг — независимая функция/класс. Выход одного = вход следующего.

---

## Шаг 1: Preprocessing (`processing/preprocessor.py`)

**Вход**: `np.ndarray` — BGR изображение  
**Выход**: `np.ndarray` — бинарное изображение (uint8, 0 или 255)

Операции:
1. Конвертация в grayscale
2. Gaussian blur для шумоподавления
3. Adaptive threshold (Otsu или adaptive)
4. Морфологические операции (dilate/erode для закрытия разрывов)

```python
def preprocess(image: np.ndarray) -> np.ndarray:
    """BGR → binary (walls=255, background=0)"""
```

---

## Шаг 2: Text Removal (`processing/text_remover.py`)

**Вход**: `np.ndarray` — бинарное изображение  
**Выход**: `np.ndarray` — бинарное изображение без текстовых регионов

Подходы (в порядке предпочтения):
1. EasyOCR / Tesseract — детектируем bounding boxes текста, inpaint
2. Contour filtering — удаляем контуры с aspect ratio символов
3. Ручная маска (fallback, если автоматика не справилась)

Сохраняем оригинал и маску текста для возможности отката.

---

## Шаг 3: Wall Vectorization (`processing/vectorizer.py`)

**Вход**: `np.ndarray` — бинарное изображение без текста  
**Выход**: `VectorizationResult` — датакласс с полилиниями

```python
@dataclass
class VectorizationResult:
    """Полный структурированный результат векторизации (расширенная версия)."""
    # Структурные элементы
    walls: List[Wall]              # стены с толщиной
    rooms: List[Room]              # комнаты с полигонами, центрами, типами
    doors: List[Door]              # двери между комнатами
    text_blocks: List[TextBlock]   # распознанный текст (включая номера кабинетов)

    # Метаданные изображения
    image_size_original: Tuple[int, int]  # (width, height) до кропа
    image_size_cropped: Tuple[int, int]   # (width, height) после кропа
    crop_rect: Optional[dict]             # {x, y, width, height} нормализованный [0,1]
    crop_applied: bool                    # был ли применён кроп
    rotation_angle: int                   # угол поворота 0/90/180/270 (для building-assembly)

    # Масштаб и геометрия
    wall_thickness_px: float              # медианная толщина стен в пикселях
    estimated_pixels_per_meter: float     # оценка масштаба (для pathfinding)

    # Статистика
    rooms_with_names: int                 # сколько комнат получили номер из OCR
    corridors_count: int                  # сколько коридоров найдено
    doors_count: int                      # сколько дверей найдено
```

Алгоритм:
1. Contour detection (cv2.findContours)
2. Douglas-Peucker approximation для упрощения
3. Фильтрация шума (минимальная длина полилинии)
4. Нормализация координат в диапазон [0, 1]

---

## Шаг 4: FloorPlan Assembly (`services/floor_plan_assembler.py`)

**Вход**: `VectorizationResult` + метаданные (имя, этаж)  
**Выход**: `FloorPlan` — доменная модель

Операции:
- Преобразование полилиний в `Wall` объекты
- Детектирование замкнутых контуров → `Room` объекты
- Назначение ID каждому элементу

---

## Шаг 5: 3D Build (`services/builder_3d.py`)

**Вход**: `FloorPlan`  
**Выход**: `ThreeJSGeometry` — JSON для Three.js

```python
@dataclass
class ThreeJSGeometry:
    vertices: List[float]    # плоский список x,y,z
    faces: List[int]         # индексы вершин
    wall_height: float       # высота экструзии стен (default: 3.0м)
```

Алгоритм:
- Экструзия стен (полилиния → прямоугольный параллелепипед)
- Генерация пола (polygon → flat mesh)
- Координаты: X,Z — план, Y — высота

---

## Форматы данных между фронтом и бэком

### Upload response
```json
{
  "floor_plan_id": "uuid",
  "status": "processing | ready | failed",
  "preview_url": "string"
}
```

### FloorPlan data (для редактора)
```json
{
  "id": "uuid",
  "image_size": {"width": 1920, "height": 1080},
  "walls": [
    {"id": "uuid", "points": [{"x": 0.1, "y": 0.2}, ...]}
  ],
  "rooms": [
    {"id": "uuid", "name": "Аудитория 301", "polygon": [...]}
  ]
}
```

### 3D Geometry
```json
{
  "vertices": [0.0, 0.0, 0.0, ...],
  "faces": [0, 1, 2, ...],
  "wall_height": 3.0
}
```

---

## Правила для агентов при работе с pipeline

1. Никогда не модифицировать входной `np.ndarray` — всегда `.copy()`
2. Каждая функция логирует время выполнения (`time.perf_counter`)
3. При ошибке в любом шаге — кидать `ImageProcessingError` с указанием шага
4. Промежуточные результаты сохраняются в `tmp/` для отладки (configurable)
5. Все координаты после vectorization нормализованы в [0, 1]
