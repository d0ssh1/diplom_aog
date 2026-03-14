# Text-Removal Implementation Patterns — Research Report

**Date:** 2026-03-14
**Task:** Find implementation patterns for text/color removal from evacuation plan images
**Scope:** Colored elements (green arrows, red fire symbols) + text/numbers removal

---

## 1. CLOSEST ANALOG — Existing Color/Text Removal Features

### 1.1 Color Filtering (Step 2 of Pipeline)

**File:** `backend/app/processing/pipeline.py:86-119`

```python
def color_filter(
    image: np.ndarray,
    saturation_threshold: int = 50,
    inpaint_radius: int = 3,
) -> np.ndarray:
    """
    Remove colored elements (green arrows, red symbols) via HSV saturation mask + inpaint.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        saturation_threshold: pixels with S > threshold are colored
        inpaint_radius: inpainting radius (pixels)

    Returns:
        Filtered BGR image (H, W, 3), dtype=uint8
    """
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    _, s_ch, _ = cv2.split(hsv)

    mask = (s_ch > saturation_threshold).astype(np.uint8) * 255
    filtered = cv2.inpaint(image, mask, inpaint_radius, cv2.INPAINT_TELEA)

    return filtered
```

**Key Details:**
- **HSV color space conversion:** `cv2.cvtColor(image, cv2.COLOR_BGR2HSV)` at line 111
- **Saturation channel extraction:** `cv2.split(hsv)` at line 112, uses S channel
- **Mask creation:** Binary mask where `S > saturation_threshold` at line 114
- **Inpainting algorithm:** `cv2.INPAINT_TELEA` at line 115 (Telea's fast marching method)
- **Default parameters:** `saturation_threshold=50`, `inpaint_radius=3`
- **Timing:** Logs elapsed time with `time.perf_counter()` at lines 109, 117-118
- **Error handling:** Raises `ImageProcessingError` for empty/invalid input at lines 102-107

**Data Flow:**
1. HTTP request → `MaskService.calculate_mask()` (line 34 in `mask_service.py`)
2. Optional color filtering enabled via `enable_color_filter=False` parameter (line 40)
3. If enabled: `color_filter(img)` called at line 76 in `mask_service.py`
4. Output fed to binarization pipeline

**Test Coverage:** `backend/tests/processing/test_pipeline.py:141-169`
- `test_color_filter_valid_image_returns_same_shape` (line 141)
- `test_color_filter_removes_colored_pixels` (line 158) — creates green patch, verifies inpainting changes it

---

### 1.2 Text Detection (Step 5 of Pipeline)

**File:** `backend/app/processing/pipeline.py:193-263`

```python
def text_detect(
    image: np.ndarray,
    binary_mask: np.ndarray,
    confidence_threshold: int = 60,
) -> List[TextBlock]:
    """
    Detect text via OCR, mark room numbers.

    Args:
        image: BGR image (H, W, 3), dtype=uint8 (original, before binarization)
        binary_mask: binary mask (H, W), dtype=uint8
        confidence_threshold: minimum OCR confidence (0-100)

    Returns:
        List of TextBlock with coordinates and room number flag.
        Empty list if pytesseract is not installed.
    """
    if not _TESSERACT_AVAILABLE:
        logger.warning("pytesseract not available, skipping text detection")
        return []

    data = pytesseract.image_to_data(
        image, lang="rus+eng", config="--psm 6", output_type=pytesseract.Output.DICT
    )

    # Extract text blocks with normalized coordinates [0, 1]
    for i in range(n_boxes):
        text = data["text"][i].strip()
        conf = int(data["conf"][i])
        if conf < confidence_threshold:
            continue

        bx, by, bw, bh = int(data["left"][i]), int(data["top"][i]), ...
        cx = (bx + bw / 2) / w  # normalize to [0, 1]
        cy = (by + bh / 2) / h

        text_blocks.append(TextBlock(
            text=text,
            center=Point2D(x=cx, y=cy),
            confidence=float(conf),
            is_room_number=_is_room_number(text),
        ))
```

**Key Details:**
- **OCR library:** pytesseract (optional, graceful fallback at line 213-215)
- **OCR config:** `lang="rus+eng"`, `--psm 6` (assume single text block per region)
- **Confidence filtering:** `confidence_threshold=60` (0-100 scale)
- **Room number detection:** Regex patterns at lines 26-29 (GOST standard: `^\d{3,4}[А-Яа-яA-Za-z]?$`)
- **Coordinate normalization:** Pixel coords → [0, 1] at lines 244-247
- **Output model:** `TextBlock` domain model (file: `backend/app/models/domain.py:18-23`)

**TextBlock Model:**
```python
class TextBlock(BaseModel):
    """Распознанный текстовый блок (OCR)."""
    text: str
    center: Point2D
    confidence: float = Field(0.0, ge=0.0, le=100.0)
    is_room_number: bool = False
```

**Test Coverage:** `backend/tests/processing/test_pipeline.py:213-230`
- `test_text_detect_no_tesseract_returns_empty` (line 220) — mocks unavailable pytesseract
- `test_text_detect_returns_text_blocks` (line 226) — verifies list return type

---

### 1.3 Text Removal from Binary Mask (Step 6 of Pipeline)

**File:** `backend/app/processing/pipeline.py:270-322`

```python
def remove_text_regions(
    binary_mask: np.ndarray,
    text_blocks: List[TextBlock],
    image_size: Tuple[int, int],
    inpaint_radius: int = 5,
    text_height_px: int = 20,
    char_width_px: int = 10,
) -> np.ndarray:
    """
    Remove text regions from binary mask via inpainting.

    Args:
        binary_mask: binary mask (H, W), dtype=uint8
        text_blocks: detected text blocks
        image_size: (width, height) of the image used for denormalization
        inpaint_radius: inpainting radius
        text_height_px: estimated text height in pixels
        char_width_px: estimated character width in pixels

    Returns:
        Cleaned binary mask (H, W), dtype=uint8
    """
    if not text_blocks:
        return binary_mask  # early return — no mutation

    removal_mask = np.zeros((binary_mask.shape[0], binary_mask.shape[1]), dtype=np.uint8)

    for tb in text_blocks:
        cx_px = int(tb.center.x * w)
        cy_px = int(tb.center.y * h)
        text_w = max(len(tb.text) * char_width_px, char_width_px)
        text_h = text_height_px

        x1 = max(0, cx_px - text_w // 2)
        y1 = max(0, cy_px - text_h // 2)
        x2 = min(w, cx_px + text_w // 2)
        y2 = min(h, cy_px + text_h // 2)

        cv2.rectangle(removal_mask, (x1, y1), (x2, y2), 255, -1)

    cleaned = cv2.inpaint(binary_mask, removal_mask, inpaint_radius, cv2.INPAINT_TELEA)

    return cleaned
```

**Key Details:**
- **Bounding box calculation:** Text center + estimated dimensions (lines 305-311)
- **Bounding box formula:** `text_w = len(text) * char_width_px` (line 305)
- **Mask drawing:** `cv2.rectangle(removal_mask, (x1, y1), (x2, y2), 255, -1)` at line 313 (filled rectangle)
- **Inpainting:** Same `cv2.INPAINT_TELEA` algorithm at line 315
- **Default parameters:** `inpaint_radius=5`, `text_height_px=20`, `char_width_px=10`
- **Coordinate denormalization:** `cx_px = int(tb.center.x * w)` at line 303
- **Bounds checking:** `max(0, ...)` and `min(w, ...)` at lines 308-311

**Test Coverage:** `backend/tests/processing/test_pipeline.py:237-260`
- `test_remove_text_regions_no_blocks_returns_same` (line 243) — verifies early return
- `test_remove_text_regions_with_blocks_returns_cleaned` (line 249) — verifies output shape/dtype

**Integration Test:** `backend/tests/integration/test_vectorization_integration.py:89-114`
- `test_pipeline_steps_5_6_chain` (line 89) — chains `text_detect` → `remove_text_regions`

---

## 2. REUSABLE COMPONENTS — CV2 Operations

### 2.1 Inpainting (cv2.inpaint)

**Usage Locations:**
- `pipeline.py:115` — color filtering
- `pipeline.py:315` — text removal

**Algorithm:** `cv2.INPAINT_TELEA` (Telea's fast marching method)

**Signature:**
```python
cv2.inpaint(src, inpaintMask, inpaintRadius, flags)
```

**Parameters:**
- `src`: Input image (BGR or grayscale)
- `inpaintMask`: Binary mask (255 = region to inpaint, 0 = preserve)
- `inpaintRadius`: Radius of circular neighborhood (pixels)
- `flags`: `cv2.INPAINT_TELEA` or `cv2.INPAINT_NS`

**Typical values in codebase:**
- Color filtering: `inpaint_radius=3` (line 89 in `pipeline.py`)
- Text removal: `inpaint_radius=5` (line 274 in `pipeline.py`)

---

### 2.2 HSV Color Space Operations

**Usage:** `pipeline.py:111-114` (color_filter)

```python
hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
_, s_ch, _ = cv2.split(hsv)
mask = (s_ch > saturation_threshold).astype(np.uint8) * 255
```

**HSV Channels:**
- H (Hue): 0-180 in OpenCV
- S (Saturation): 0-255
- V (Value): 0-255

**Saturation threshold:** Default 50 (line 88 in `pipeline.py`)
- Pixels with S > 50 are considered "colored"
- Low saturation = grayscale (text, walls)
- High saturation = colored (arrows, symbols)

---

### 2.3 Morphological Operations

**File:** `backend/app/processing/binarization.py:130-170`

**Operations used:**
- `cv2.MORPH_CLOSE` (closing): Fills small holes
- `cv2.MORPH_OPEN` (opening): Removes small noise

**Kernel creation:**
```python
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
```

**Usage in pipeline:**
- `preprocessor.py:76-77` — closing with (3,3) kernel, 2 iterations
- `mask_service.py:104-105` — closing with (3,3) kernel, 1 iteration
- `binarization.py:155-168` — closing then opening

**Parameters in codebase:**
- Kernel size: 3x3 (most common)
- Iterations: 1-2

---

### 2.4 Connected Components Analysis

**File:** `backend/app/processing/preprocessor.py:80-86`

```python
num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(morph, connectivity=8)

mask = np.zeros_like(morph)
for i in range(1, num_labels):  # label 0 is background
    area = stats[i, cv2.CC_STAT_AREA]
    if area > 50:
        mask[labels == i] = 255
```

**Usage:** Noise removal by filtering components by area

**Parameters:**
- `connectivity=8` (8-connected neighbors)
- Area threshold: 50 pixels (line 85)

---

### 2.5 Contour Filtering by Area/Aspect Ratio

**File:** `backend/app/processing/pipeline.py:357-425` (room_detect)

```python
contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
large_contours = [c for c in contours if cv2.contourArea(c) > image_area * min_area_ratio]

epsilon = 0.02 * cv2.arcLength(contour, True)
approx = cv2.approxPolyDP(contour, epsilon, True)
```

**Filtering criteria:**
- Area ratio: `min_area_ratio=0.2` (line 128 in `pipeline.py`)
- Polygon approximation: `epsilon=0.02 * perimeter` (line 400)

---

## 3. NAMING PATTERNS

### 3.1 Processing Function Names

**Convention:** `{action}_{target}` or `{action}_{target}_{method}`

**Examples:**
- `normalize_brightness` (line 41)
- `color_filter` (line 86)
- `auto_crop_suggest` (line 126)
- `text_detect` (line 193)
- `remove_text_regions` (line 270)
- `compute_wall_thickness` (line 329)
- `room_detect` (line 357)
- `classify_rooms` (line 432)
- `door_detect` (line 475)
- `assign_room_numbers` (line 556)

---

### 3.2 Parameter Naming

**Thresholds:** `{target}_threshold`
- `saturation_threshold` (line 88)
- `confidence_threshold` (line 196)
- `adjacency_threshold` (line 480)

**Radii/Sizes:** `{target}_radius` or `{target}_size`
- `inpaint_radius` (lines 89, 274)
- `tile_size` (line 44)
- `dilate_kernel` (line 478)

**Ratios:** `{target}_ratio`
- `min_area_ratio` (line 128)
- `max_room_area_ratio` (line 360)
- `corridor_aspect_ratio` (line 434)

**Pixel measurements:** `{target}_px`
- `text_height_px` (line 275)
- `char_width_px` (line 276)
- `wall_thickness_px` (line 329)

---

### 3.3 Test File Naming

**Convention:** `test_{function}_{scenario}_{expected}`

**Examples from `test_pipeline.py`:**
- `test_color_filter_valid_image_returns_same_shape` (line 141)
- `test_color_filter_removes_colored_pixels` (line 158)
- `test_remove_text_regions_no_blocks_returns_same` (line 243)
- `test_remove_text_regions_with_blocks_returns_cleaned` (line 249)

**Fixtures:** `{descriptor}_{type}`
- `white_image` (line 39)
- `simple_mask` (line 51)
- `rooms_mask` (line 59)
- `square_room` (line 74)

---

## 4. DATA FLOW — HTTP Request to Saved Mask

**Entry Point:** `backend/app/services/mask_service.py:34-112`

```
HTTP POST /reconstructions/upload
    ↓
MaskService.calculate_mask(file_id, crop, rotation, enable_normalize, enable_color_filter)
    ↓
1. Find plan file on disk (line 53)
2. Load with cv2.imread (line 56)
3. Rotate if provided (lines 61-68)
4. [Optional] normalize_brightness(img) (line 72)
5. [Optional] color_filter(img) (line 76)
6. Apply user crop (lines 79-89)
7. Binarization:
   - to_grayscale() (line 94)
   - GaussianBlur(3,3) (line 95)
   - adaptiveThreshold() (lines 96-102)
   - morphologyEx(MORPH_CLOSE) (lines 104-105)
8. Save mask to disk (line 109)
9. Return filename (line 112)
    ↓
HTTP 200 {filename: "file_id.png"}
```

**File Storage:**
- Input plans: `{upload_dir}/plans/{file_id}.*`
- Output masks: `{upload_dir}/masks/{file_id}.png`

**Configuration:**
- `enable_normalize`: Default `False` (line 39) — disabled because it corrupts Otsu threshold
- `enable_color_filter`: Default `False` (line 40) — disabled because too aggressive for evacuation plans

---

## 5. EXISTING TESTS FOR COLOR/TEXT REMOVAL

### 5.1 Unit Tests

**File:** `backend/tests/processing/test_pipeline.py`

| Test | Line | Coverage |
|------|------|----------|
| `test_color_filter_valid_image_returns_same_shape` | 141 | Shape preservation |
| `test_color_filter_empty_image_raises` | 146 | Error handling |
| `test_color_filter_wrong_dtype_raises` | 152 | Type validation |
| `test_color_filter_removes_colored_pixels` | 158 | Functional correctness |
| `test_remove_text_regions_empty_mask_raises` | 237 | Error handling |
| `test_remove_text_regions_no_blocks_returns_same` | 243 | Early return (no mutation) |
| `test_remove_text_regions_with_blocks_returns_cleaned` | 249 | Functional correctness |

**Quality:** All tests use AAA pattern (Arrange → Act → Assert)

### 5.2 Integration Tests

**File:** `backend/tests/integration/test_vectorization_integration.py`

| Test | Line | Coverage |
|------|------|----------|
| `test_pipeline_steps_1_to_3_chain` | 63 | normalize_brightness → color_filter → auto_crop_suggest |
| `test_pipeline_steps_5_6_chain` | 89 | text_detect → remove_text_regions |

---

## 6. QUALITY GATES & STANDARDS

### 6.1 Error Handling

**Pattern:** Raise `ImageProcessingError` with function name + message

```python
if image is None or image.size == 0:
    raise ImageProcessingError("color_filter", "Empty image")
if image.dtype != np.uint8:
    raise ImageProcessingError("color_filter", f"Expected uint8, got {image.dtype}")
```

**Exception class:** `backend/app/core/exceptions.py`

### 6.2 Logging

**Pattern:** Log with `logger.info()` at function start/end with timing

```python
start = time.perf_counter()
# ... processing ...
elapsed = time.perf_counter() - start
logger.info("color_filter completed in %.3fs", elapsed)
```

### 6.3 Input Validation

**Always:**
- Check for None/empty input
- Validate dtype (uint8 for images)
- Validate shape (H, W, 3 for BGR; H, W for grayscale)

### 6.4 Immutability

**Rule:** Never mutate input arrays

```python
img = image.copy()  # Always copy first
```

---

## 7. SUMMARY TABLE — Text/Color Removal Components

| Component | File | Line | Purpose | Key Params |
|-----------|------|------|---------|-----------|
| `color_filter()` | pipeline.py | 86 | Remove colored elements via HSV+inpaint | saturation_threshold=50, inpaint_radius=3 |
| `text_detect()` | pipeline.py | 193 | Detect text via OCR (pytesseract) | confidence_threshold=60, lang="rus+eng" |
| `remove_text_regions()` | pipeline.py | 270 | Remove text from binary mask via inpaint | inpaint_radius=5, text_height_px=20, char_width_px=10 |
| `cv2.inpaint()` | OpenCV | — | Inpainting algorithm | cv2.INPAINT_TELEA |
| `cv2.cvtColor(BGR2HSV)` | OpenCV | — | Color space conversion | — |
| `cv2.split()` | OpenCV | — | Extract HSV channels | — |
| `cv2.morphologyEx()` | OpenCV | — | Morphological operations | MORPH_CLOSE, MORPH_OPEN |
| `cv2.connectedComponentsWithStats()` | OpenCV | — | Noise removal by area | connectivity=8 |

---

## 8. RECOMMENDATIONS FOR TEXT-REMOVAL FEATURE

### 8.1 Reuse Existing Patterns

1. **Color removal:** Use `color_filter()` directly (already implemented)
   - Adjust `saturation_threshold` for specific colors (green arrows, red symbols)
   - Test with real evacuation plans to tune threshold

2. **Text removal:** Chain `text_detect()` → `remove_text_regions()`
   - Ensure pytesseract is installed in production
   - Tune `confidence_threshold` for evacuation plan text quality
   - Adjust `text_height_px` and `char_width_px` based on typical plan resolution

### 8.2 New Function Signature (Proposed)

```python
def remove_colored_elements_and_text(
    image: np.ndarray,
    binary_mask: np.ndarray,
    remove_colors: bool = True,
    remove_text: bool = True,
    saturation_threshold: int = 50,
    text_confidence_threshold: int = 60,
    inpaint_radius: int = 5,
) -> Tuple[np.ndarray, np.ndarray, List[TextBlock]]:
    """
    Remove colored elements and text from evacuation plan.

    Returns:
        (filtered_image, cleaned_mask, detected_text_blocks)
    """
```

### 8.3 Integration Point

Add to `MaskService.calculate_mask()` pipeline:
- After color_filter (line 76)
- Before binarization (line 94)
- New parameter: `enable_text_removal: bool = False`

---

## Files Referenced

- `backend/app/processing/pipeline.py` — Main vectorization pipeline (8 steps)
- `backend/app/processing/preprocessor.py` — Preprocessing (rotate, crop, binarize)
- `backend/app/processing/binarization.py` — BinarizationService class
- `backend/app/services/mask_service.py` — HTTP request handler + orchestration
- `backend/app/models/domain.py` — Domain models (TextBlock, Room, Door, etc.)
- `backend/tests/processing/test_pipeline.py` — Unit tests for pipeline functions
- `backend/tests/integration/test_vectorization_integration.py` — Integration tests
- `backend/tests/services/test_mask_service.py` — Service tests
- `backend/app/core/exceptions.py` — Exception classes

