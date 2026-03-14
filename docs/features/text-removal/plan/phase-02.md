# Phase 2: Service Integration

phase: 2
layer: service
depends_on: phase-01
design: ../README.md

## Goal

Интегрировать `remove_colored_elements()`, `text_detect()`, `remove_text_regions()` в `MaskService.calculate_mask()` и сохранять текстовые блоки в JSON.

## Context

Phase 1 добавила в `processing/pipeline.py` три новые функции:
- `remove_green_elements(image) -> np.ndarray`
- `remove_red_elements(image) -> np.ndarray`
- `remove_colored_elements(image) -> np.ndarray`

Существующие функции (уже в `pipeline.py`, но не вызываются):
- `text_detect(image, binary_mask) -> List[TextBlock]`
- `remove_text_regions(binary_mask, text_blocks, image_size) -> np.ndarray`

## Files to Modify

### `backend/app/services/mask_service.py`

**What changes:** Обновить `calculate_mask()` — добавить шаги color removal и text removal.

**Implementation details:**

1. **Imports** — добавить:
   ```python
   import json
   from app.processing.pipeline import (
       color_filter,
       normalize_brightness,
       remove_colored_elements,  # NEW
       text_detect,              # ACTIVATE
       remove_text_regions,      # ACTIVATE
   )
   ```

2. **Сигнатура `calculate_mask()`** — добавить параметры:
   ```python
   async def calculate_mask(
       self,
       file_id: str,
       crop: dict | None = None,
       rotation: int = 0,
       enable_normalize: bool = False,
       enable_color_filter: bool = False,
       enable_color_removal: bool = True,   # NEW — включён по умолчанию
       enable_text_removal: bool = True,     # NEW — включён по умолчанию
   ) -> str:
   ```

3. **Новый пайплайн** (порядок шагов из `02-behavior.md`):
   ```
   load → rotate → [normalize OFF] → color_removal → crop → binarize → morphClose → text_detect → text_removal → save mask + save text.json
   ```

4. **Color removal step** — вставить ПОСЛЕ `enable_color_filter` блока (line ~76), ПЕРЕД crop (line ~79):
   ```python
   # Step 2b: Color removal (enabled by default — removes green arrows, red symbols)
   if enable_color_removal:
       img = remove_colored_elements(img)
   ```

5. **Text removal step** — вставить ПОСЛЕ morphClose (line ~105), ПЕРЕД save (line ~108):
   ```python
   # Step 5: Text detection + removal
   text_blocks = []
   if enable_text_removal:
       # text_detect needs original BGR (after crop, before binarization)
       # We need to keep a reference to the cropped BGR image
       text_blocks = text_detect(cropped_bgr, mask)
       if text_blocks:
           mask = remove_text_regions(mask, text_blocks, (cropped_bgr.shape[1], cropped_bgr.shape[0]))
   ```

   **IMPORTANT:** Нужно сохранить ссылку на `cropped_bgr` — BGR изображение после crop, но до grayscale/binarization. `text_detect` принимает оригинальное BGR для OCR.

6. **Save text.json** — после save mask:
   ```python
   # Save text blocks
   if text_blocks:
       text_json_path = os.path.join(self._masks_dir, f"{file_id}_text.json")
       text_data = [
           {
               "text": tb.text,
               "center": {"x": tb.center.x, "y": tb.center.y},
               "confidence": tb.confidence,
               "is_room_number": tb.is_room_number,
           }
           for tb in text_blocks
       ]
       with open(text_json_path, "w", encoding="utf-8") as f:
           json.dump(text_data, f, ensure_ascii=False, indent=2)
       logger.info("Text blocks saved: %s (%d blocks)", text_json_path, len(text_blocks))
   ```

**Ref:** `02-behavior.md` → Use Case 1 sequence diagram, `06-pipeline-spec.md` → pipeline order.

**Key constraint:** `reconstruction_service.py:124-137` уже загружает `{file_id}_text.json` — формат JSON должен совпадать с тем, что ожидает `reconstruction_service`.

## Verification
- [ ] `python -m py_compile backend/app/services/mask_service.py` passes
- [ ] Пайплайн: load → rotate → [normalize] → color_removal → crop → binarize → morphClose → text_detect → text_removal → save
- [ ] `cropped_bgr` сохраняется до binarization для передачи в `text_detect`
- [ ] `text.json` формат совместим с `reconstruction_service.py`
- [ ] `enable_color_removal=True` по умолчанию
- [ ] `enable_text_removal=True` по умолчанию
