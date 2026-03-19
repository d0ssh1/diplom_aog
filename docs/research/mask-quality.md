# Research: mask-quality
date: 2026-03-18

## Summary

Текущий пайплайн маски реализован в двух местах: `MaskService.preview_mask` и `MaskService.calculate_mask` (оба в `backend/app/services/mask_service.py`). Оба метода используют одну и ту же логику бинаризации: `GaussianBlur(3,3)` → `adaptiveThreshold(GAUSSIAN_C, THRESH_BINARY_INV, blockSize, C)` → `MORPH_CLOSE(3,3, iter=1)`. Параметры `block_size` (default=15) и `threshold_c` (default=10) передаются с фронта через слайдеры.

CLAHE уже реализован в `pipeline.py` как `normalize_brightness()` (шаг 1), но в `MaskService` он **отключён по умолчанию** (`enable_normalize=False`) с комментарием "corrupts Otsu threshold". Это означает R2 (CLAHE) уже существует в коде, но не используется в пайплайне маски. Функция применяет CLAHE на L-канале LAB, а не на grayscale — это более корректный подход.

Ни один из подходов R1 (multi-pass threshold), R3 (Canny fusion), R4 (directional morph), R5 (Sauvola), R6 (Hough) не реализован. Тесты для `MaskService` существуют (`test_mask_service.py`) и покрывают основной флоу, но нет тестов на качество захвата тонких линий.

## Architecture — Current State

### Backend Structure

- `backend/app/services/mask_service.py:23` — `class MaskService` — сервис-класс (не pure functions, нарушает стандарт `processing/`)
- `backend/app/services/mask_service.py:39` — `async preview_mask(file_id, crop, rotation, block_size=15, threshold_c=10) -> bytes` — генерирует PNG bytes без сохранения
- `backend/app/services/mask_service.py:92` — `async calculate_mask(file_id, crop, rotation, block_size=15, threshold_c=10, enable_normalize=False, enable_color_filter=False, enable_color_removal=True, enable_text_removal=True) -> str` — полный пайплайн, сохраняет маску на диск
- `backend/app/processing/pipeline.py:41` — `normalize_brightness(image, clip_limit=2.0, tile_size=8) -> np.ndarray` — CLAHE на L-канале LAB (уже реализован, не используется в маске)
- `backend/app/processing/pipeline.py:86` — `color_filter(image, saturation_threshold=50, inpaint_radius=3) -> np.ndarray`
- `backend/app/processing/pipeline.py:126` — `remove_green_elements(image, hue_low=35, hue_high=85, sat_min=40, ...) -> np.ndarray`
- `backend/app/processing/pipeline.py:178` — `remove_red_elements(image, ...) -> np.ndarray`
- `backend/app/processing/pipeline.py:243` — `remove_colored_elements(image) -> np.ndarray` — оркестратор green+red
- `backend/app/processing/binarization.py:18` — `class BinarizationService` — используется только для `to_grayscale()` в MaskService; содержит `apply_morphology()` с MORPH_OPEN (запрещён по тикету)

### API Endpoints

- `backend/app/api/reconstruction.py:38` — `POST /initial-masks` — принимает `CalculateMaskRequest`, вызывает `svc.calculate_mask()`
- `backend/app/api/reconstruction.py:72` — `POST /mask-preview` — принимает `MaskPreviewRequest`, возвращает PNG bytes напрямую

### Pydantic Models

- `backend/app/models/reconstruction.py:32` — `CalculateMaskRequest`: `file_id: str`, `crop: Optional[CropRect]`, `rotation: int = 0`, `block_size: int = 15`, `threshold_c: int = 10`
- `backend/app/models/reconstruction.py:41` — `MaskPreviewRequest`: те же поля что и `CalculateMaskRequest`
- `backend/app/models/reconstruction.py:61` — `CalculateMaskResponse`: `id: str`, `source_upload_file_id: str`, `url: str`, `created_at`, `created_by`

### Frontend Structure

- `frontend/src/components/Wizard/StepPreprocess.tsx` — компонент шага предобработки (слайдеры Чувствительность/Контраст — точные имена параметров не найдены в grep по `blockSize/threshold_c`, нужна дополнительная проверка)
- `frontend/src/components/Wizard/StepUpload.tsx` — загрузка файла, preview изображения

## Closest Analog Feature

**Ближайший аналог**: `calculate_mask` / `preview_mask` — это и есть исследуемая фича.

Поток данных:
```
POST /mask-preview
  → MaskPreviewRequest (file_id, crop, rotation, block_size, threshold_c)
  → MaskService.preview_mask()
    → cv2.imread → rotate → remove_colored_elements
    → BinarizationService.to_grayscale → GaussianBlur(3,3)
    → adaptiveThreshold(GAUSSIAN_C, THRESH_BINARY_INV, blockSize, C)
    → MORPH_CLOSE(3,3, iter=1)
    → cv2.imencode('.png') → bytes
```

## Existing Patterns to Reuse

- `normalize_brightness()` — `pipeline.py:41` — CLAHE уже реализован (R2), нужно только включить в `preview_mask` и `calculate_mask`
- `time.perf_counter()` + `logger.info()` — паттерн замера времени используется во всех функциях `pipeline.py`
- `image.copy()` перед модификацией — соблюдается в `remove_green_elements:161`, `remove_red_elements:219`
- `ImageProcessingError(step, message)` — `core/exceptions.py` — стандартный способ бросать ошибки
- Тестовые фикстуры в `tests/processing/conftest.py` и `test_pipeline.py` — паттерн `make_*_image()` для синтетических изображений

## Integration Points

### Database
- Маска сохраняется как файл, не в БД напрямую
- `CalculateMaskResponse` содержит `url` на файл маски

### File Storage
- Планы: `uploads/plans/{file_id}.*`
- Маски: `uploads/masks/{file_id}.png`
- Текстовые блоки: `uploads/masks/{file_id}_text.json`
- `MaskService._find_file()` ищет по glob-паттерну `{file_id}.*`

### API
- Frontend отправляет `block_size` и `threshold_c` как числа
- `mask-preview` возвращает `image/png` bytes напрямую (не JSON)
- `initial-masks` возвращает `CalculateMaskResponse` с `url`

### Processing Pipeline — текущий порядок в `calculate_mask`
```
1. cv2.imread
2. rotate (если rotation != 0)
3. normalize_brightness (ОТКЛЮЧЕНО, enable_normalize=False)
4. color_filter (ОТКЛЮЧЕНО, enable_color_filter=False)
5. remove_colored_elements (включено по умолчанию)
6. crop (если crop != None)
7. BinarizationService.to_grayscale → GaussianBlur(3,3)
8. adaptiveThreshold(GAUSSIAN_C, THRESH_BINARY_INV, blockSize=15, C=10)
9. MORPH_CLOSE(3,3, iter=1)
10. text_detect → remove_text_regions (включено по умолчанию)
11. cv2.imwrite → return filename
```

### Ограничения из тикета (НЕ МЕНЯТЬ)
- HSV диапазоны в `remove_green_elements`: `sat_min=40` — не расширять
- `apiService.ts` — не менять
- Никаких MORPH_OPEN, connected components filtering, aspect ratio filtering

## Gaps (что отсутствует для улучшения маски)

- **R1 (multi-pass threshold)** — не реализован. Нет функции объединения нескольких проходов adaptive threshold через `bitwise_OR`
- **R2 (CLAHE)** — реализован в `normalize_brightness()`, но **отключён** в `preview_mask` (метод не принимает `enable_normalize`). В `calculate_mask` есть флаг, но default=False. Нужно включить и протестировать влияние на тонкие линии
- **R3 (Canny fusion)** — не реализован. Нет функции детекции краёв + объединения с threshold маской
- **R4 (directional MORPH_CLOSE)** — не реализован. Текущий `MORPH_CLOSE(3,3)` использует квадратное ядро, скругляет углы
- **R5 (Sauvola)** — не реализован. `scikit-image` не в зависимостях
- **R6 (Hough)** — не реализован
- **preview_mask не имеет флага `enable_normalize`** — в отличие от `calculate_mask`, `preview_mask` не принимает этот параметр, поэтому CLAHE нельзя протестировать через preview API
- **Нет тестов на качество захвата тонких линий** — `test_mask_service.py` проверяет только `white_ratio > 0.03`, не проверяет сохранение тонких структур
- **`BinarizationService.apply_morphology()` содержит MORPH_OPEN** — `binarization.py:163` — запрещённая операция по тикету, но не используется в текущем пайплайне маски

## Key Files

- `backend/app/services/mask_service.py` — основной файл для изменений (preview_mask + calculate_mask)
- `backend/app/processing/pipeline.py` — здесь добавлять новые pure functions (multi_pass_threshold, canny_fusion, directional_morph_close)
- `backend/app/models/reconstruction.py:32` — Pydantic модели запросов (если нужны новые параметры)
- `backend/app/api/reconstruction.py:72` — endpoint mask-preview (если нужно добавить параметры)
- `backend/tests/services/test_mask_service.py` — тесты сервиса (добавить тесты на тонкие линии)
- `backend/tests/processing/test_pipeline.py` — тесты pipeline functions (добавить тесты новых функций)
