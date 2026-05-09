# Pipeline Specification: Wall Extraction for Floor Schema

## Where in the Pipeline

Эта фича вводит **новое использование существующего CV-пайплайна** для отдельной задачи — извлечение стен с фото-схемы целого этажа (а не отдельного плана отсека).

```
[FloorEditor шаг 3] → load schema_image → apply crop_bbox + rotation → preprocess → binarize → contour → vectorize → store wall_polygons
                                                                          (re-use processing/)
```

**Это не часть CV-пайплайна обработки плана отсека** (тот идёт в wizard загрузки плана: upload → preprocess → wall vectorize → 3D build). Здесь — отдельный entry point с теми же функциями.

## Reuse vs New

**Re-используется (без изменений):**
- `backend/app/processing/preprocessor.py` — функция предобработки: grayscale, denoise, threshold
- `backend/app/processing/binarization.py` — функция Otsu binarization
- `backend/app/processing/contours.py` — функция findContours + иерархия
- `backend/app/processing/vectorizer.py` — Douglas-Peucker simplification → polygons

**Новое (тонкая обёртка):**
- `backend/app/services/floor_schema_service.py` — orchestrator: load image → apply crop+rotation → call processing → save

## Input / Output

**Input:**
- `Floor.schema_image_id: str` (UUID) — UploadedFile с фото-схемой
- `Floor.schema_crop_bbox: dict | None` — `{x, y, width, height, rotation}` в нормализованных [0,1] координатах от исходного image. `rotation` ∈ {0,90,180,270}.

**Output:**
- `wall_polygons: list[list[tuple[float, float]]]` — список полигонов; каждый полигон — список (x,y) в нормализованных [0,1] координатах **от cropped image** (не от исходного).

**Side effect:** `Floor.wall_polygons` сохраняется в БД (Phase 04 — `FloorSchemaService.extract_walls`).

## Algorithm

```python
def extract_walls_for_floor(floor: Floor) -> list[Polygon]:
    # 1. Load original image
    image_path = file_storage.get_path(floor.schema_image_id)
    image = cv2.imread(image_path)  # BGR

    # 2. Apply crop_bbox (denormalize coordinates)
    if floor.schema_crop_bbox:
        bbox = floor.schema_crop_bbox
        h, w = image.shape[:2]
        x0 = int(bbox['x'] * w); y0 = int(bbox['y'] * h)
        x1 = int((bbox['x'] + bbox['width']) * w)
        y1 = int((bbox['y'] + bbox['height']) * h)
        image = image[y0:y1, x0:x1]

        # 3. Apply rotation (multiples of 90)
        if bbox['rotation']:
            k = bbox['rotation'] // 90
            image = np.rot90(image, k=k)

    # 4. Existing CV pipeline (reuse)
    preprocessed = preprocess_image(image)        # processing/preprocessor.py
    binary = binarize_otsu(preprocessed)          # processing/binarization.py
    contours = detect_contours(binary)            # processing/contours.py
    polygons = vectorize(contours, epsilon=0.005) # processing/vectorizer.py — Douglas-Peucker

    # 5. Normalize to [0,1] относительно cropped+rotated image
    h, w = image.shape[:2]
    normalized = [
        [(x/w, y/h) for x, y in poly]
        for poly in polygons
    ]

    # 6. Filter — drop tiny artifacts (< 1% диагонали изображения)
    diagonal = math.sqrt(2.0)  # normalized
    min_perimeter = 0.01 * diagonal
    return [poly for poly in normalized if perimeter(poly) >= min_perimeter]
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `epsilon` (Douglas-Peucker) | float | 0.005 | Чем больше — тем грубее упрощение. 0.005 хорошо для архитектурных схем |
| `min_perimeter_ratio` | float | 0.01 | Порог отбрасывания мелких артефактов (доля диагонали) |
| `binarize_method` | str | "otsu" | Используется существующий метод |

**Note:** в первой итерации параметры не вынесены в API/UI. Если admin не доволен результатом — корректирует вручную через инструменты «Выделение стен» / «Прямоугольник» / «Очистить всё» на шаге 3.

## Error Handling

| Условие | Exception | Message |
|---------|-----------|---------|
| `schema_image_id is None` | `FloorSchemaError` | "Floor schema image not uploaded" |
| Файл не найден на диске | `FileNotFoundError` → `FloorSchemaError` | "Schema image file missing" |
| `cv2.imread` вернул None | `ImageProcessingError` | "Failed to read image (corrupt file?)" |
| Нулевой crop area (width=0 или height=0) | `ImageProcessingError` | "Invalid crop region" |
| Polygon validation на выходе | — | Пустой массив возвращается; UI шага 3 показывает «Стены не найдены, нарисуйте вручную» |

## Coordinate Spaces

Понимание **трёх уровней координат** критично:

1. **Original image pixels** — координаты исходного загруженного фото (например, 4000×3000)
2. **Cropped image pixels** — после применения `schema_crop_bbox` (например, 3400×2100 после crop)
3. **Normalized [0,1]** — относительно cropped+rotated image. **Это финальный формат** для `Floor.wall_polygons` и `Section.geometry`.

Все координаты в БД и API — нормализованные. Пиксельные — только внутри функций processing/.

**Согласованность с end-user UI:** `wall_polygons` рисуются на мини-карте в нормализованных координатах от cropped image. End-user mini-map применяет `schema_crop_bbox` к `schema_image_url` (показывает cropped+rotated версию) и рендерит полигоны поверх.

## Performance

**Ожидаемое время для типового изображения (3000×2000, ~5MB):**
- preprocess: ~200ms
- binarize: ~100ms
- contour detection: ~500ms
- vectorize (Douglas-Peucker): ~100ms
- **Total: ~1 сек**

**Для большого изображения (8000×6000, 20MB):**
- Ожидается ~5-10 сек

**Решение по UX:** sync-вызов с frontend spinner «Обработка стен...» (R-12). Если станет > 30 сек на типичном железе — переехать в Celery (out of scope первой итерации).

## Тесты (входят в `backend/tests/processing/test_floor_schema_walls.py`)

- `test_extract_walls_simple_rectangle_image_returns_one_polygon` — синтетический image с одним прямоугольником, ожидаем 1 polygon с 4 точками
- `test_extract_walls_blank_image_returns_empty_list` — белое изображение без линий → []
- `test_extract_walls_applies_crop_bbox_correctly` — image с прямоугольником в верхней половине, crop=top_half → polygon смещён в верхнюю часть нормализованных координат
- `test_extract_walls_applies_rotation_90` — image rotated 90° → polygons тоже повёрнуты

(Эти 3-4 теста учтены в `04-testing.md §Test Count Summary` строкой "Processing (CV integration) | 3" — округлено до 3 base + 1 covered by service test.)
