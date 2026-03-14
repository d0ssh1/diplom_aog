# Phase 3: Processing Tests

phase: 3
layer: tests
depends_on: phase-01
design: ../README.md

## Goal

Добавить 30 тестов в `test_pipeline.py` для новых color removal функций и существующих (но непокрытых) `text_detect()` / `remove_text_regions()`.

## Context

Phase 1 добавила в `processing/pipeline.py`:
- `remove_green_elements(image) -> np.ndarray`
- `remove_red_elements(image) -> np.ndarray`
- `remove_colored_elements(image) -> np.ndarray`

Существующие функции (pipeline.py:193-322):
- `text_detect(image, binary_mask) -> List[TextBlock]`
- `remove_text_regions(binary_mask, text_blocks, image_size) -> np.ndarray`

## Files to Modify

### `backend/tests/processing/test_pipeline.py`

**What changes:** Добавить фикстуры и 30 тестов. Добавить импорты новых функций.

**Imports to add:**
```python
from app.processing.pipeline import (
    # ... existing imports ...
    remove_green_elements,
    remove_red_elements,
    remove_colored_elements,
)
```

**Fixtures to add** (ref: `04-testing.md` → Test Fixtures):

```python
@pytest.fixture
def image_with_green_arrows() -> np.ndarray
@pytest.fixture
def image_with_red_symbols() -> np.ndarray
@pytest.fixture
def image_with_walls_and_colors() -> np.ndarray
@pytest.fixture
def grayscale_image() -> np.ndarray
@pytest.fixture
def binary_mask_with_text() -> np.ndarray
@pytest.fixture
def sample_text_blocks() -> list
```

**Tests from 04-testing.md to implement here:**

#### Color Removal — remove_green_elements (7 tests)
1. `test_remove_green_elements_valid_image_returns_same_shape` — shape и dtype сохраняются
2. `test_remove_green_elements_green_patch_removed` — зелёные пиксели заменены (HSV check: mean green hue уменьшился)
3. `test_remove_green_elements_empty_image_raises` — `None` → `ImageProcessingError`
4. `test_remove_green_elements_wrong_dtype_raises` — `float64` → `ImageProcessingError`
5. `test_remove_green_elements_grayscale_raises` — `(H,W)` shape → `ImageProcessingError`
6. `test_remove_green_elements_no_green_returns_unchanged` — белое изображение → `np.array_equal(result, input)`
7. `test_remove_green_elements_does_not_mutate_input` — `original = image.copy()`, вызов, `np.array_equal(image, original)`

#### Color Removal — remove_red_elements (7 tests)
8. `test_remove_red_elements_valid_image_returns_same_shape`
9. `test_remove_red_elements_red_patch_removed`
10. `test_remove_red_elements_empty_image_raises`
11. `test_remove_red_elements_wrong_dtype_raises`
12. `test_remove_red_elements_grayscale_raises`
13. `test_remove_red_elements_no_red_returns_unchanged`
14. `test_remove_red_elements_does_not_mutate_input`

#### Color Removal — remove_colored_elements (5 tests)
15. `test_remove_colored_elements_removes_both_colors` — изображение с зелёным и красным → оба удалены
16. `test_remove_colored_elements_preserves_walls` — чёрные стены остаются чёрными
17. `test_remove_colored_elements_empty_image_raises`
18. `test_remove_colored_elements_wrong_dtype_raises`
19. `test_remove_colored_elements_grayscale_raises`

#### Text Detection — text_detect (7 tests)
20. `test_text_detect_valid_image_returns_text_blocks` — mock pytesseract, проверить что возвращает List[TextBlock]
21. `test_text_detect_empty_image_raises` — `None` → `ImageProcessingError`
22. `test_text_detect_no_tesseract_returns_empty` — mock `_TESSERACT_AVAILABLE = False` → `[]`
23. `test_text_detect_ocr_error_returns_empty` — mock pytesseract.image_to_data raises → `[]`
24. `test_text_detect_coordinates_normalized` — mock OCR data, проверить `0 <= center.x <= 1` и `0 <= center.y <= 1`
25. `test_text_detect_room_numbers_flagged` — mock OCR с текстом "1103" → `is_room_number=True`
26. `test_text_detect_grayscale_raises` — `(H,W)` shape → `ImageProcessingError`

#### Text Removal — remove_text_regions (4 tests)
27. `test_remove_text_regions_removes_text_area` — маска с текстом + text_blocks → область текста очищена
28. `test_remove_text_regions_empty_mask_raises` — `None` → `ImageProcessingError`
29. `test_remove_text_regions_empty_blocks_returns_unchanged` — `text_blocks=[]` → маска без изменений
30. `test_remove_text_regions_does_not_mutate_input` — `original = mask.copy()`, вызов, `np.array_equal(mask, original)`

**Key testing patterns (ref: `prompts/testing.md`):**
- AAA: Arrange → Act → Assert
- Naming: `test_{function}_{condition}_{expected}`
- Processing tests: no DB, no HTTP — only numpy/cv2
- Mock pytesseract for text_detect tests (OCR не нужен в unit tests)
- Synthetic images generated programmatically

**Mocking strategy for text_detect:**
```python
# Mock pytesseract.image_to_data to return controlled OCR data
@patch("app.processing.pipeline.pytesseract")
def test_text_detect_valid_image_returns_text_blocks(mock_tess, white_image):
    mock_tess.Output.DICT = "dict"
    mock_tess.image_to_data.return_value = {
        "text": ["101", ""],
        "conf": [90, -1],
        "left": [50, 0],
        "top": [50, 0],
        "width": [30, 0],
        "height": [15, 0],
    }
    # Also need to ensure _TESSERACT_AVAILABLE is True
    ...
```

## Verification
- [ ] `python -m pytest backend/tests/processing/test_pipeline.py -v` — all 30 new tests pass
- [ ] Existing tests in test_pipeline.py still pass (no regressions)
- [ ] No DB or HTTP calls in tests
- [ ] All text_detect tests mock pytesseract (no real OCR dependency)
