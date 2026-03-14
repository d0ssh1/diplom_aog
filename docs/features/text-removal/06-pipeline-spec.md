# Pipeline Specification: Text & Color Removal

## Logging

Все новые функции используют модульный логгер, уже определённый в `processing/pipeline.py:21`:
```python
logger = logging.getLogger(__name__)
```
Каждая функция логирует время выполнения через `time.perf_counter()` + `logger.info()`.

## Where in the Pipeline

```
[1] Load + Rotate
    ↓
[2] [Normalize brightness OFF]
    ↓
[3] ★ Color Removal (NEW — replaces disabled color_filter)
    ↓
[4] Crop
    ↓
[5] Binarization (grayscale → blur → adaptiveThreshold → morphClose)
    ↓
[6] ★ Text Detection (ACTIVATE — already implemented, not called)
    ↓
[7] ★ Text Removal (ACTIVATE — already implemented, not called)
    ↓
[8] Save mask + Save text.json
```

## Step 3: Color Removal (NEW)

### remove_green_elements()

**Input:** `np.ndarray` — BGR image (H, W, 3), dtype=uint8
**Output:** `np.ndarray` — BGR image (H, W, 3), dtype=uint8 — green elements replaced via inpaint

**Algorithm:**
1. `result = image.copy()` — никогда не мутируем входной массив
2. Convert BGR → HSV: `hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV)`
3. Create green mask: `H ∈ [35, 85], S > 40, V > 40`
4. Dilate mask (3×3, 1 iteration) — захватить края зелёных элементов
5. `start = time.perf_counter()` перед шагом 6
6. Inpaint: `result = cv2.inpaint(result, green_mask, radius=3, cv2.INPAINT_TELEA)`
7. `logger.info("remove_green_elements completed in %.3fs", time.perf_counter() - start)`
8. Return result

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| hue_low | int | 35 | Lower bound of green hue (OpenCV: 0-180) |
| hue_high | int | 85 | Upper bound of green hue |
| sat_min | int | 40 | Minimum saturation to be considered "green" |
| val_min | int | 40 | Minimum value to be considered "green" |
| inpaint_radius | int | 3 | Inpainting radius (pixels) |

**HSV диапазон обоснование:**
- OpenCV Hue: 0-180 (не 0-360)
- Зелёный: H=35-85 (60° ± 25° в OpenCV scale)
- S>40 отсекает серые/белые пиксели
- V>40 отсекает тёмные пиксели

### remove_red_elements()

**Input:** `np.ndarray` — BGR image (H, W, 3), dtype=uint8
**Output:** `np.ndarray` — BGR image (H, W, 3), dtype=uint8 — red elements replaced via inpaint + wall repair

**Algorithm:**
1. `result = image.copy()` — никогда не мутируем входной массив
2. Convert BGR → HSV: `hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV)`
3. Create red mask (два диапазона, т.к. красный на границе H):
   - Mask1: `H ∈ [0, 10], S > 50, V > 50`
   - Mask2: `H ∈ [170, 180], S > 50, V > 50`
   - `red_mask = mask1 | mask2`
4. Dilate mask (3×3, 1 iteration)
5. `start = time.perf_counter()` перед inpaint
6. Inpaint: `result = cv2.inpaint(result, red_mask, radius=3, cv2.INPAINT_TELEA)`
7. `logger.info("remove_red_elements completed in %.3fs", time.perf_counter() - start)`
8. Return result

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| hue_low1 | int | 0 | Lower red hue range start |
| hue_high1 | int | 10 | Lower red hue range end |
| hue_low2 | int | 170 | Upper red hue range start |
| hue_high2 | int | 180 | Upper red hue range end |
| sat_min | int | 50 | Minimum saturation |
| val_min | int | 50 | Minimum value |
| inpaint_radius | int | 3 | Inpainting radius |

**Почему S>50 и V>50 (строже чем для зелёного):**
- Красные символы на планах обычно яркие и насыщенные
- Более строгий порог уменьшает риск захвата стен (которые могут иметь слабый красноватый оттенок при плохом освещении)

### remove_colored_elements()

**Input:** `np.ndarray` — BGR image (H, W, 3), dtype=uint8
**Output:** `np.ndarray` — BGR image (H, W, 3), dtype=uint8

**Algorithm:**
1. `start = time.perf_counter()`
2. `img = remove_green_elements(image)` — сначала зелёные (стрелки в коридорах, безопасно). `remove_green_elements` делает `.copy()` внутри
3. `img = remove_red_elements(img)` — затем красные (символы, могут быть на стенах). `remove_red_elements` делает `.copy()` внутри
4. `logger.info("remove_colored_elements completed in %.3fs", time.perf_counter() - start)`
5. Return img

Это оркестратор — вызывает две функции последовательно. Порядок важен: зелёные элементы могут перекрывать красные.

## Step 6: Text Detection (existing — pipeline.py:193-263)

**Input:**
- `image: np.ndarray` — BGR image (H, W, 3), dtype=uint8 (оригинал после crop, ДО бинаризации)
- `binary_mask: np.ndarray` — binary mask (H, W), dtype=uint8

**Output:** `List[TextBlock]` — текстовые блоки с нормализованными координатами

Функция уже реализована. Без изменений. Вызывается из `MaskService` после бинаризации.

Важно: `text_detect` принимает оригинальное BGR изображение (после crop, но до бинаризации) — OCR работает лучше на цветном/grayscale изображении, чем на бинарной маске.

## Step 7: Text Removal (existing — pipeline.py:270-322)

**Input:**
- `binary_mask: np.ndarray` — binary mask (H, W), dtype=uint8
- `text_blocks: List[TextBlock]` — обнаруженные текстовые блоки
- `image_size: Tuple[int, int]` — (width, height)

**Output:** `np.ndarray` — cleaned binary mask (H, W), dtype=uint8

Функция уже реализована. Без изменений. Строит bounding boxes вокруг текстовых центров, inpaint на бинарной маске.

## Error Handling

| Condition | Exception | Message |
|-----------|-----------|---------|
| Empty image (None or size==0) | ImageProcessingError | "[step_name] Empty image" |
| Wrong dtype (not uint8) | ImageProcessingError | "[step_name] Expected uint8, got {dtype}" |
| Wrong shape (not 3-channel for BGR) | ImageProcessingError | "[step_name] Expected BGR (H,W,3), got shape {shape}" |
| Tesseract not available | — (no exception) | logger.warning, return [] |
| OCR runtime error | — (no exception) | logger.warning, return [] |

## Performance Expectations

| Step | Expected Time (3000×2000 image) | Notes |
|------|--------------------------------|-------|
| remove_green_elements | ~100-200ms | HSV conversion + inpaint |
| remove_red_elements | ~100-200ms | HSV conversion + inpaint |
| text_detect (OCR) | ~2-5s | pytesseract is slow, depends on text density |
| remove_text_regions | ~50-100ms | Inpaint on small regions |
| **Total added** | **~2.5-5.5s** | Dominated by OCR |
