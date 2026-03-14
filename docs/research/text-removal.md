# Research: Text & Color Removal from Evacuation Plans
date: 2026-03-14

## Summary

Система уже содержит функции для удаления цветных элементов (`color_filter`) и текста (`text_detect` + `remove_text_regions`) в `processing/pipeline.py`, но они **не интегрированы** в текущий пайплайн маски. `color_filter` был отключён из-за слишком агрессивного порога (saturation=50), а text detection убран из-за отсутствия pytesseract. Однако pytesseract **установлен** (requirements.txt), просто не был доступен в runtime.

Ключевая проблема: на планах эвакуации присутствуют зелёные стрелки (пути эвакуации), красные символы (огнетушители, пожарные краны), текст и числа (номера кабинетов). После перехода на адаптивную бинаризацию все эти элементы стали хорошо видны в маске — раньше Otsu их терял вместе со стенами.

Особый случай: красные элементы (огнетушители) могут находиться прямо на стене. Простой inpaint может разорвать стену. Нужна стратегия восстановления стен после удаления цветных элементов.

## Architecture — Current State

### Backend: Existing Functions (orphaned — not called from pipeline)

- `pipeline.py:86-119` — `color_filter(image, saturation_threshold=50, inpaint_radius=3)` → BGR→HSV, маска по S-каналу, cv2.inpaint(TELEA). Проблема: порог 50 слишком низкий, захватывает стены.
- `pipeline.py:193-263` — `text_detect(image, binary_mask, confidence_threshold=60)` → pytesseract OCR (rus+eng, PSM 6), возвращает List[TextBlock] с нормализованными координатами и флагом is_room_number.
- `pipeline.py:270-322` — `remove_text_regions(binary_mask, text_blocks, image_size, inpaint_radius=5)` → строит маску из bounding boxes текста, inpaint на бинарной маске.

### Backend: Current Mask Pipeline (mask_service.py:34-112)

```
load → rotate → [normalize_brightness OFF] → [color_filter OFF] → crop
    → grayscale → GaussianBlur(3,3) → adaptiveThreshold(blockSize=15, C=10, BINARY_INV)
    → morphClose(3x3, iter=1) → save
```

Text detection и removal **не вызываются**.

### Backend: Domain Models (models/domain.py)

- `TextBlock` (line 18-23): text, center: Point2D, confidence, is_room_number
- `VectorizationResult` (line 52-74): включает text_blocks: List[TextBlock]
- Room number patterns (pipeline.py:26-29): `^\d{3,4}[А-Яа-яA-Za-z]?$`, `^[A-ZА-Я]\d{3,4}$`

### Frontend: Mask Display

- `MaskEditor.tsx` — отображает маску, нет визуализации обнаруженного текста
- `AddReconstructionPage.tsx` — отправляет file_id, crop, rotation. Нет параметров для text/color removal
- Нет UI для включения/выключения шагов пайплайна

### Dependencies

- pytesseract 0.3.10 — **установлен** в requirements.txt
- easyocr — **не установлен**
- Tesseract binary — нужно проверить наличие в системе

## Closest Analog Feature

`color_filter()` — ближайший аналог. Использует HSV saturation mask + inpaint. Паттерн:
1. Конвертация в цветовое пространство (HSV)
2. Выделение маски по каналу (S > threshold)
3. Inpaint для заполнения удалённых областей

Data flow: `POST /reconstruction/initial-masks` → `MaskService.calculate_mask()` → pipeline functions → save mask → return URL

## Existing Patterns to Reuse

- `cv2.inpaint(src, mask, radius, cv2.INPAINT_TELEA)` — pipeline.py:115, pipeline.py:315
- HSV saturation extraction — pipeline.py:111-114
- Connected components — pipeline.py:382-384 (room_detect)
- Contour filtering by area — pipeline.py:388-389
- Morphological operations — binarization.py:149-170
- Point-in-polygon test — pipeline.py:595-612 (assign_room_numbers)

## Integration Points

- **Database**: VectorizationResult хранится в `reconstructions.vectorization_data` (Text/JSON). Включает text_blocks.
- **File storage**: Маски в `{upload_dir}/masks/{file_id}.png`. Text blocks могут сохраняться в `{file_id}_text.json`.
- **API**: `POST /reconstruction/initial-masks` — единственный эндпоинт для маски. Не принимает параметры пайплайна.
- **Pipeline**: Удаление цвета/текста должно происходить **до бинаризации** (на цветном изображении), а удаление текстовых регионов из маски — **после бинаризации**.

## Gaps (what's missing)

1. **Порядок операций не определён** — удалять цвет до или после бинаризации? Текущий color_filter работает на BGR (до), но портит изображение для Otsu. С адаптивной бинаризацией может работать лучше.
2. **Нет стратегии восстановления стен** — если красный элемент на стене, inpaint может разорвать стену. Нужен dilate стен перед inpaint или восстановление после.
3. **Нет раздельной фильтрации по цвету** — текущий color_filter убирает ВСЕ цветные пиксели. Нужно: зелёный отдельно (стрелки), красный отдельно (символы), с разными стратегиями.
4. **Нет контроля с фронтенда** — пользователь не может включить/выключить шаги или настроить пороги.
5. **Tesseract binary** — нужно проверить, установлен ли Tesseract в системе (pytesseract — только обёртка).
6. **Нет тестов на реальных планах** — только синтетические тесты с прямоугольниками.

## Key Files

- `backend/app/services/mask_service.py` — оркестрация пайплайна маски
- `backend/app/processing/pipeline.py` — все функции обработки (color_filter, text_detect, remove_text_regions)
- `backend/app/processing/binarization.py` — BinarizationService
- `backend/app/models/domain.py` — TextBlock, VectorizationResult
- `backend/app/api/reconstruction.py` — API эндпоинт маски
- `frontend/src/components/MaskEditor.tsx` — отображение маски
- `frontend/src/pages/AddReconstructionPage.tsx` — страница создания реконструкции

## Ключевые вопросы для design_feature

1. **Порядок**: color removal → binarization → text removal? Или color removal → text removal → binarization?
2. **Стратегия для красных элементов на стенах**: dilate стен перед удалением? Или удалять только "свободные" красные элементы (не касающиеся стен)?
3. **Зелёный vs красный**: одинаковая стратегия или разная? Зелёные стрелки обычно в коридорах (безопасно удалять), красные символы могут быть на стенах.
4. **Текст**: OCR (pytesseract) или морфологический подход (по размеру connected components)?
5. **Фронтенд**: нужен ли UI для настройки параметров сейчас, или достаточно хороших дефолтов?
