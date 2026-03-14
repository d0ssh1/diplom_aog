# Phase 4: Service Tests

phase: 4
layer: tests
depends_on: phase-02
design: ../README.md

## Goal

Добавить 9 тестов в `test_mask_service.py` для обновлённого `MaskService.calculate_mask()` с color removal и text removal.

## Context

Phase 2 обновила `MaskService.calculate_mask()`:
- Добавлены параметры `enable_color_removal=True`, `enable_text_removal=True`
- Пайплайн: load → rotate → color_removal → crop → binarize → text_detect → text_removal → save mask + text.json
- Текстовые блоки сохраняются в `{file_id}_text.json`

Существующие тесты в `test_mask_service.py` (4 теста):
- `test_calculate_mask_valid_file_returns_filename`
- `test_calculate_mask_default_pipeline_produces_visible_walls`
- `test_calculate_mask_no_auto_crop_when_crop_is_none`
- `test_calculate_mask_missing_file_raises_not_found`

## Files to Modify

### `backend/tests/services/test_mask_service.py`

**What changes:** Добавить 9 новых тестов. Добавить необходимые imports и fixtures.

**Imports to add:**
```python
from unittest.mock import patch
from app.core.exceptions import ImageProcessingError
```

**Tests from 04-testing.md to implement here:**

1. `test_calculate_mask_calls_color_removal` — mock `remove_colored_elements`, вызвать `calculate_mask()` с дефолтами, assert mock called
2. `test_calculate_mask_calls_text_removal` — mock `text_detect` + `remove_text_regions`, вызвать с дефолтами, assert mocks called
3. `test_calculate_mask_color_removal_disabled` — `enable_color_removal=False`, mock `remove_colored_elements`, assert NOT called
4. `test_calculate_mask_text_removal_disabled` — `enable_text_removal=False`, mock `text_detect`, assert NOT called
5. `test_calculate_mask_saves_text_json` — mock `text_detect` → return [TextBlock(...)], проверить что `{file_id}_text.json` создан и содержит корректный JSON
6. `test_calculate_mask_no_tesseract_still_works` — mock `text_detect` → return [], проверить что маска создаётся, `_text.json` не создаётся
7. `test_calculate_mask_missing_file_raises_storage_error` — уже есть как `test_calculate_mask_missing_file_raises_not_found`, но проверить что тест покрывает `FileStorageError`
8. `test_calculate_mask_corrupt_file_raises_processing_error` — создать файл с невалидным содержимым (не изображение), проверить `ImageProcessingError`
9. `test_calculate_mask_empty_after_crop_raises_processing_error` — создать маленькое изображение, передать crop с нулевой площадью, проверить `ImageProcessingError`

**Mocking strategy:**
```python
@pytest.mark.asyncio
@patch("app.services.mask_service.remove_colored_elements")
async def test_calculate_mask_calls_color_removal(mock_color_rm, ascii_tmp_dir):
    # Arrange: create plan image
    img = np.ones((100, 100, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (10, 10), (90, 90), (0, 0, 0), thickness=3)
    plan_path = os.path.join(ascii_tmp_dir, "plans", "test-color.jpg")
    cv2.imwrite(plan_path, img)
    mock_color_rm.return_value = img  # pass-through

    # Act
    svc = MaskService(upload_dir=ascii_tmp_dir)
    await svc.calculate_mask("test-color")

    # Assert
    mock_color_rm.assert_called_once()
```

**Key testing patterns:**
- Используем существующую фикстуру `ascii_tmp_dir` (Windows cv2.imread Unicode workaround)
- Mock processing functions через `@patch("app.services.mask_service.{function}")`
- Async tests: `@pytest.mark.asyncio`
- Проверяем side effects: файлы на диске, mock calls

**Note:** Тест #7 (`missing_file_raises_storage_error`) уже существует как `test_calculate_mask_missing_file_raises_not_found` — проверить что он покрывает `FileStorageError`. Если да — не дублировать, просто отметить в coverage.

## Verification
- [ ] `python -m pytest backend/tests/services/test_mask_service.py -v` — all new tests pass
- [ ] Existing 4 tests still pass (no regressions)
- [ ] All mocks target `app.services.mask_service.*` (not `app.processing.pipeline.*`)
- [ ] No real OCR calls in tests
- [ ] `_text.json` format matches what `reconstruction_service.py` expects
