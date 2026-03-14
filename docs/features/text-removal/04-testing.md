# Testing Strategy: Text & Color Removal

## Test Rules

Ref: `prompts/testing.md`
- AAA pattern (Arrange → Act → Assert)
- Naming: `test_{что}_{условие}_{ожидаемый_результат}`
- Processing тесты не используют БД — только numpy/cv2
- Каждая новая функция → минимум 2 теста (happy path + error)
- Тестовые изображения генерируются программно (не из файлов)

## Test Structure

```
backend/tests/
├── processing/
│   └── test_pipeline.py          ← добавляем тесты для новых функций
├── services/
│   └── test_mask_service.py      ← добавляем тесты для обновлённого пайплайна
└── conftest.py
```

Новые тестовые файлы не создаём — добавляем в существующие `test_pipeline.py` и `test_mask_service.py`.

## Coverage Mapping

### Processing Function Coverage — Color Removal (test_pipeline.py)

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| `remove_green_elements()` | Удаляет зелёные пиксели из BGR | `test_remove_green_elements_valid_image_returns_same_shape` |
| `remove_green_elements()` | Зелёный патч заменяется inpaint | `test_remove_green_elements_green_patch_removed` |
| `remove_green_elements()` | Пустое изображение → ошибка | `test_remove_green_elements_empty_image_raises` |
| `remove_green_elements()` | Неправильный dtype → ошибка | `test_remove_green_elements_wrong_dtype_raises` |
| `remove_green_elements()` | Grayscale (не 3-channel) → ошибка | `test_remove_green_elements_grayscale_raises` |
| `remove_green_elements()` | Изображение без зелёного → без изменений | `test_remove_green_elements_no_green_returns_unchanged` |
| `remove_green_elements()` | Не мутирует входной массив | `test_remove_green_elements_does_not_mutate_input` |
| `remove_red_elements()` | Удаляет красные пиксели из BGR | `test_remove_red_elements_valid_image_returns_same_shape` |
| `remove_red_elements()` | Красный патч заменяется inpaint | `test_remove_red_elements_red_patch_removed` |
| `remove_red_elements()` | Пустое изображение → ошибка | `test_remove_red_elements_empty_image_raises` |
| `remove_red_elements()` | Неправильный dtype → ошибка | `test_remove_red_elements_wrong_dtype_raises` |
| `remove_red_elements()` | Grayscale (не 3-channel) → ошибка | `test_remove_red_elements_grayscale_raises` |
| `remove_red_elements()` | Изображение без красного → без изменений | `test_remove_red_elements_no_red_returns_unchanged` |
| `remove_red_elements()` | Не мутирует входной массив | `test_remove_red_elements_does_not_mutate_input` |
| `remove_colored_elements()` | Удаляет и зелёное и красное | `test_remove_colored_elements_removes_both_colors` |
| `remove_colored_elements()` | Сохраняет чёрные стены | `test_remove_colored_elements_preserves_walls` |
| `remove_colored_elements()` | Пустое изображение → ошибка | `test_remove_colored_elements_empty_image_raises` |
| `remove_colored_elements()` | Неправильный dtype → ошибка | `test_remove_colored_elements_wrong_dtype_raises` |
| `remove_colored_elements()` | Grayscale (не 3-channel) → ошибка | `test_remove_colored_elements_grayscale_raises` |

### Processing Function Coverage — Text Detection & Removal (test_pipeline.py)

| Function | Business Rule | Test Name |
|----------|--------------|-----------|
| `text_detect()` | Возвращает List[TextBlock] для изображения с текстом | `test_text_detect_valid_image_returns_text_blocks` |
| `text_detect()` | Пустое изображение → ошибка | `test_text_detect_empty_image_raises` |
| `text_detect()` | Без pytesseract → возвращает [] | `test_text_detect_no_tesseract_returns_empty` |
| `text_detect()` | OCR runtime error → возвращает [] (graceful) | `test_text_detect_ocr_error_returns_empty` |
| `text_detect()` | Координаты нормализованы в [0, 1] | `test_text_detect_coordinates_normalized` |
| `text_detect()` | Номера кабинетов помечены is_room_number=True | `test_text_detect_room_numbers_flagged` |
| `text_detect()` | Grayscale (не 3-channel) → ошибка | `test_text_detect_grayscale_raises` |
| `remove_text_regions()` | Удаляет текстовые области из бинарной маски | `test_remove_text_regions_removes_text_area` |
| `remove_text_regions()` | Пустая маска → ошибка | `test_remove_text_regions_empty_mask_raises` |
| `remove_text_regions()` | Пустой список text_blocks → маска без изменений | `test_remove_text_regions_empty_blocks_returns_unchanged` |
| `remove_text_regions()` | Не мутирует входной массив | `test_remove_text_regions_does_not_mutate_input` |

### Service Coverage (test_mask_service.py)

| Method | Scenario | Test Name |
|--------|----------|-----------|
| `calculate_mask()` | Color removal включён по умолчанию | `test_calculate_mask_calls_color_removal` |
| `calculate_mask()` | Text removal включён по умолчанию | `test_calculate_mask_calls_text_removal` |
| `calculate_mask()` | Color removal можно отключить | `test_calculate_mask_color_removal_disabled` |
| `calculate_mask()` | Text removal можно отключить | `test_calculate_mask_text_removal_disabled` |
| `calculate_mask()` | Text blocks сохраняются в JSON | `test_calculate_mask_saves_text_json` |
| `calculate_mask()` | Без tesseract — маска генерируется | `test_calculate_mask_no_tesseract_still_works` |
| `calculate_mask()` | Файл не найден → FileStorageError | `test_calculate_mask_missing_file_raises_storage_error` |
| `calculate_mask()` | cv2.imread возвращает None → ImageProcessingError | `test_calculate_mask_corrupt_file_raises_processing_error` |
| `calculate_mask()` | Пустое изображение после crop → ImageProcessingError | `test_calculate_mask_empty_after_crop_raises_processing_error` |

### Test Count Summary

| Layer | Tests |
|-------|-------|
| Processing — color removal (new) | 19 |
| Processing — text detect/remove (existing, first-time coverage) | 11 |
| Service (updated pipeline) | 9 |
| **TOTAL** | **39** |

## Edge Cases — Not Unit-Testable

| Edge Case (from 02-behavior.md) | Why | Validation |
|----------------------------------|-----|------------|
| Красный элемент на стене → morphClose восстанавливает стену | Результат зависит от реального плана, синтетический тест ненадёжен | Интеграционное/ручное тестирование на реальных планах |
| Очень большое изображение (>5000px) → медленный OCR | Зависит от железа и Tesseract, нестабильно в CI | Логируем `time.perf_counter()` в каждой функции, проверяем вручную |
| Acceptance criterion 7: color <1s, text <5s | Зависит от CPU, нестабильно в CI | Логируем время в production, мониторим. Не unit-тест |

## Test Fixtures

```python
# Фикстуры для тестов color removal (добавить в test_pipeline.py)

@pytest.fixture
def image_with_green_arrows() -> np.ndarray:
    """Белое изображение с зелёными линиями (имитация стрелок эвакуации)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    # Зелёная стрелка
    cv2.arrowedLine(img, (20, 100), (180, 100), (0, 200, 0), thickness=3)
    return img

@pytest.fixture
def image_with_red_symbols() -> np.ndarray:
    """Белое изображение с красным кругом (имитация символа огнетушителя)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.circle(img, (100, 100), 15, (0, 0, 200), thickness=-1)
    return img

@pytest.fixture
def image_with_walls_and_colors() -> np.ndarray:
    """Изображение с чёрными стенами, зелёными стрелками и красными символами."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    # Чёрные стены
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), thickness=3)
    # Зелёная стрелка в коридоре
    cv2.arrowedLine(img, (50, 100), (150, 100), (0, 200, 0), thickness=2)
    # Красный символ на стене
    cv2.circle(img, (20, 100), 8, (0, 0, 200), thickness=-1)
    return img

@pytest.fixture
def grayscale_image() -> np.ndarray:
    """Grayscale изображение (H, W) — для тестов wrong shape."""
    return np.ones((200, 200), dtype=np.uint8) * 128

# Фикстуры для тестов text detection/removal

@pytest.fixture
def binary_mask_with_text() -> np.ndarray:
    """Бинарная маска (H, W) с имитацией текста — белые пиксели в центре."""
    mask = np.zeros((200, 200), dtype=np.uint8)
    # Стены
    cv2.rectangle(mask, (20, 20), (180, 180), 255, thickness=3)
    # Имитация текста (мелкие белые пиксели)
    cv2.putText(mask, "101", (80, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 255, 1)
    return mask

@pytest.fixture
def sample_text_blocks() -> list:
    """Список TextBlock для тестов remove_text_regions."""
    from app.models.domain import Point2D, TextBlock
    return [
        TextBlock(text="101", center=Point2D(x=0.5, y=0.5), confidence=90.0, is_room_number=True),
    ]
```
