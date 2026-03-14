# Pipeline Specification: Vectorization Pipeline

## Where in the Pipeline

```
RAW IMAGE (evacuation plan photo)
    ↓
[1] Brightness Normalization → normalized image
    ↓
[2] Color Filtering → achromatic image (colored elements removed)
    ↓
[3] Auto-Crop Suggestion → crop_rect or None
    ↓
[4] Adaptive Binarization → binary mask (walls=255, background=0)
    ↓
[5] Text Detection → text_blocks (with room numbers marked)
    ↓
[6] Text Removal → cleaned binary mask
    ↓
[7] Room Detection + Classification → walls, rooms, doors
    ↓
[8] Normalization + Scale Computation → VectorizationResult
```

---

## Step 1: Brightness Normalization

**Input:** `np.ndarray` (H, W, 3), dtype=uint8, BGR color image
**Output:** `np.ndarray` (H, W, 3), dtype=uint8, normalized BGR image

**Purpose:** Equalize contrast for phone photos with uneven lighting.

**Algorithm:**
1. Convert BGR → LAB color space
2. Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to L channel
   - clipLimit=2.0
   - tileGridSize=(8, 8)
3. Merge L channel back with A, B channels
4. Convert LAB → BGR

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| clip_limit | float | 2.0 | CLAHE clip limit (higher = more contrast) |
| tile_size | int | 8 | CLAHE tile grid size |

**Skip condition:** If histogram is already uniform (std_dev < threshold), skip CLAHE (optimization for scans).

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| Empty image | ImageProcessingError | "[normalize_brightness] Empty image" |
| Wrong dtype | ImageProcessingError | "[normalize_brightness] Expected uint8, got {dtype}" |

**Implementation:**
```python
def normalize_brightness(image: np.ndarray, clip_limit: float = 2.0, tile_size: int = 8) -> np.ndarray:
    """
    Normalize brightness using CLAHE on L channel.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        clip_limit: CLAHE clip limit
        tile_size: CLAHE tile grid size

    Returns:
        Normalized BGR image
    """
    if image is None or image.size == 0:
        raise ImageProcessingError("Empty image", step="normalize_brightness")
    if image.dtype != np.uint8:
        raise ImageProcessingError(f"Expected uint8, got {image.dtype}", step="normalize_brightness")

    # Convert to LAB
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    # Apply CLAHE to L channel
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_size, tile_size))
    l_clahe = clahe.apply(l)

    # Merge and convert back
    lab_clahe = cv2.merge([l_clahe, a, b])
    normalized = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2BGR)

    return normalized
```

---

## Step 2: Color Filtering

**Input:** `np.ndarray` (H, W, 3), dtype=uint8, BGR image
**Output:** `np.ndarray` (H, W, 3), dtype=uint8, filtered BGR image (colored elements removed)

**Purpose:** Remove colored evacuation arrows (green) and symbols (red) BEFORE binarization.

**Algorithm:**
1. Convert BGR → HSV
2. Create saturation mask: S > threshold (default 50)
   - High saturation = colored pixels (green arrows, red symbols)
   - Low saturation = achromatic pixels (black/gray walls, white background)
3. Inpaint masked regions using cv2.INPAINT_TELEA
   - Propagates surrounding achromatic pixels into colored regions
4. Return inpainted image

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| saturation_threshold | int | 50 | HSV saturation threshold (0-255). Pixels with S > threshold are considered colored. |
| inpaint_radius | int | 3 | Inpainting radius (pixels) |

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| Empty image | ImageProcessingError | "[color_filter] Empty image" |
| Wrong dtype | ImageProcessingError | "[color_filter] Expected uint8, got {dtype}" |

**Implementation:**
```python
def color_filter(image: np.ndarray, saturation_threshold: int = 50, inpaint_radius: int = 3) -> np.ndarray:
    """
    Remove colored elements (green arrows, red symbols) via HSV saturation mask + inpaint.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        saturation_threshold: Saturation threshold (0-255)
        inpaint_radius: Inpainting radius

    Returns:
        Filtered BGR image with colored elements removed
    """
    if image is None or image.size == 0:
        raise ImageProcessingError("Empty image", step="color_filter")
    if image.dtype != np.uint8:
        raise ImageProcessingError(f"Expected uint8, got {image.dtype}", step="color_filter")

    # Convert to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)

    # Create mask: high saturation = colored pixels
    mask = (s > saturation_threshold).astype(np.uint8) * 255

    # Inpaint colored regions
    filtered = cv2.inpaint(image, mask, inpaint_radius, cv2.INPAINT_TELEA)

    return filtered
```

---

## Step 3: Auto-Crop Suggestion

**Input:** `np.ndarray` (H, W, 3), dtype=uint8, BGR image
**Output:** `Optional[dict]` — crop_rect `{x, y, width, height}` (normalized [0,1]) or None

**Purpose:** Detect building boundary, exclude legends/mini-plans, suggest crop to user.

**Algorithm:**
1. Convert to grayscale
2. Apply coarse binarization (Otsu)
3. Find contours (RETR_EXTERNAL)
4. Filter contours by area: keep only contours with area > 20% of image area
5. If multiple large contours found, select largest
6. Compute bounding box of largest contour
7. Expand bounding box by 5% margin (to avoid cutting walls)
8. Normalize bounding box to [0, 1]
9. Return as crop_rect or None if no large contour found

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| min_area_ratio | float | 0.2 | Minimum contour area as ratio of image area (0.2 = 20%) |
| margin_ratio | float | 0.05 | Margin to add around bounding box (0.05 = 5%) |

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| Empty image | ImageProcessingError | "[auto_crop_suggest] Empty image" |

**Implementation:**
```python
def auto_crop_suggest(image: np.ndarray, min_area_ratio: float = 0.2, margin_ratio: float = 0.05) -> Optional[dict]:
    """
    Suggest crop rectangle around building boundary.

    Args:
        image: BGR image (H, W, 3), dtype=uint8
        min_area_ratio: Minimum contour area ratio
        margin_ratio: Margin around bounding box

    Returns:
        Crop rect {x, y, width, height} normalized [0,1], or None if no boundary found
    """
    if image is None or image.size == 0:
        raise ImageProcessingError("Empty image", step="auto_crop_suggest")

    h, w = image.shape[:2]
    image_area = h * w

    # Coarse binarization
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Find contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter by area
    large_contours = [c for c in contours if cv2.contourArea(c) > image_area * min_area_ratio]

    if not large_contours:
        return None

    # Select largest
    largest = max(large_contours, key=cv2.contourArea)

    # Bounding box
    x, y, bw, bh = cv2.boundingRect(largest)

    # Add margin
    margin_x = int(bw * margin_ratio)
    margin_y = int(bh * margin_ratio)
    x = max(0, x - margin_x)
    y = max(0, y - margin_y)
    bw = min(w - x, bw + 2 * margin_x)
    bh = min(h - y, bh + 2 * margin_y)

    # Normalize
    crop_rect = {
        "x": x / w,
        "y": y / h,
        "width": bw / w,
        "height": bh / h,
    }

    return crop_rect
```

---

## Step 4: Adaptive Binarization

**Input:** `np.ndarray` (H, W, 3), dtype=uint8, BGR image (after color filtering and crop)
**Output:** `np.ndarray` (H, W), dtype=uint8, binary mask (walls=255, background=0)

**Purpose:** Convert to binary mask, choosing Otsu (scans) or adaptive (phone photos) automatically.

**Algorithm:**
1. Convert to grayscale
2. Analyze histogram: compute bimodality coefficient
   - If bimodal (two clear peaks) → use Otsu
   - Else → use adaptive threshold
3. Apply GaussianBlur (5, 5) before thresholding
4. Threshold:
   - Otsu: `cv2.threshold(blur, 0, 255, THRESH_BINARY_INV + THRESH_OTSU)`
   - Adaptive: `cv2.adaptiveThreshold(blur, 255, ADAPTIVE_THRESH_GAUSSIAN_C, THRESH_BINARY_INV, blockSize=11, C=2)`
5. Morphology: MORPH_CLOSE to fill gaps in walls
   - kernel=3x3, iterations=2
6. Remove noise: connected components, filter by area < 50px
7. Return binary mask

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| blur_kernel | int | 5 | Gaussian blur kernel size |
| morph_kernel | int | 3 | Morphology kernel size |
| morph_iterations | int | 2 | Morphology iterations |
| min_component_area | int | 50 | Minimum connected component area (pixels) |
| adaptive_block_size | int | 11 | Adaptive threshold block size (must be odd) |
| adaptive_c | int | 2 | Adaptive threshold constant |

**Bimodality Detection:**
```python
def is_bimodal(hist: np.ndarray) -> bool:
    """Check if histogram has two clear peaks (bimodal distribution)."""
    # Smooth histogram
    hist_smooth = cv2.GaussianBlur(hist.astype(np.float32), (1, 5), 0).flatten()

    # Find peaks
    peaks = []
    for i in range(1, len(hist_smooth) - 1):
        if hist_smooth[i] > hist_smooth[i-1] and hist_smooth[i] > hist_smooth[i+1]:
            peaks.append((i, hist_smooth[i]))

    # Bimodal if 2 peaks with significant height
    if len(peaks) >= 2:
        peaks_sorted = sorted(peaks, key=lambda x: x[1], reverse=True)
        peak1_height = peaks_sorted[0][1]
        peak2_height = peaks_sorted[1][1]
        return peak2_height > peak1_height * 0.3  # Second peak at least 30% of first

    return False
```

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| Empty image | ImageProcessingError | "[adaptive_binarization] Empty image" |

**Implementation:** Delegates to `BinarizationService.binarize_otsu()` or `BinarizationService.apply_adaptive_threshold()` based on histogram analysis.

---

## Step 5: Text Detection

**Input:**
- `image: np.ndarray` (H, W, 3), dtype=uint8, BGR image (original, before binarization)
- `binary_mask: np.ndarray` (H, W), dtype=uint8, binary mask

**Output:** `List[TextBlock]` — detected text blocks with coordinates and room number flag

**Purpose:** Detect text via OCR, extract room numbers, save coordinates for removal and assignment.

**Algorithm:**
1. Run pytesseract.image_to_data() on original image
   - config='--psm 6' (assume uniform block of text)
   - lang='rus+eng' (Russian + English)
2. Parse output: extract text, bounding boxes, confidence
3. Filter by confidence > 60
4. For each text block:
   - Check if matches room number pattern:
     - `^\d{3,4}[А-Яа-яA-Za-z]?$` (e.g. "1103", "1103А")
     - `^[A-ZА-Я]\d{3,4}$` (e.g. "A304", "D314")
   - Compute center: (x + w/2, y + h/2)
   - Normalize center to [0, 1]
   - Create TextBlock(text, center, is_room_number)
5. Return list of TextBlock

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| confidence_threshold | int | 60 | Minimum OCR confidence (0-100) |
| psm_mode | int | 6 | Tesseract PSM mode (6 = uniform block) |

**Room Number Patterns:**
```python
import re

ROOM_NUMBER_PATTERNS = [
    r'^\d{3,4}[А-Яа-яA-Za-z]?$',  # 1103, 1103А, 1103a
    r'^[A-ZА-Я]\d{3,4}$',          # A304, D314, Б201
]

def is_room_number(text: str) -> bool:
    """Check if text matches room number pattern."""
    return any(re.match(pattern, text) for pattern in ROOM_NUMBER_PATTERNS)
```

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| pytesseract not installed | Warning (log) | "pytesseract not available, skipping text detection" |
| OCR fails | Warning (log) | "OCR failed: {error}" |
| Empty image | ImageProcessingError | "[text_detect] Empty image" |

**Graceful Degradation:** If pytesseract not installed or OCR fails, return empty list. System continues without text detection.

---

## Step 6: Text Removal

**Input:**
- `binary_mask: np.ndarray` (H, W), dtype=uint8
- `text_blocks: List[TextBlock]`

**Output:** `np.ndarray` (H, W), dtype=uint8, cleaned binary mask

**Purpose:** Remove text regions from binary mask via inpainting.

**Algorithm:**
1. Create removal mask (H, W), dtype=uint8, initialized to 0
2. For each TextBlock:
   - Denormalize center to pixel coordinates
   - Estimate bounding box size (heuristic: text height ≈ 20px, width ≈ len(text) * 10px)
   - Draw filled rectangle on removal mask
3. Inpaint binary_mask using removal mask
   - cv2.inpaint(binary_mask, removal_mask, inpaintRadius=5, INPAINT_TELEA)
4. Return inpainted mask

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| inpaint_radius | int | 5 | Inpainting radius |
| text_height_px | int | 20 | Estimated text height |
| char_width_px | int | 10 | Estimated character width |

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| Empty mask | ImageProcessingError | "[remove_text_regions] Empty mask" |

---

## Step 7: Room Detection + Classification

**Input:** `binary_mask: np.ndarray` (H, W), dtype=uint8 (cleaned, text removed)
**Output:** `walls: List[Wall]`, `rooms: List[Room]`, `doors: List[Door]`

**Purpose:** Extract structural elements: walls, rooms (with classification), doors.

### Step 7a: Extract Walls

**Algorithm:**
1. Call `ContourService.extract_elements(binary_mask)`
2. Filter elements by type == "wall"
3. For each wall contour:
   - Approximate with Douglas-Peucker (epsilon=0.02)
   - Convert to list of Point2D (normalized)
   - Create Wall(id, points, thickness)
4. Return List[Wall]

### Step 7b: Compute Wall Thickness

**Algorithm:**
1. Apply distance transform to binary mask
   - `cv2.distanceTransform(binary_mask, cv2.DIST_L2, 5)`
2. Extract nonzero values (distances from background)
3. Compute median
4. Return wall_thickness_px

### Step 7c: Detect Rooms (Invert Mask)

**Algorithm:**
1. Invert binary mask: `inverted = cv2.bitwise_not(binary_mask)`
   - Walls become 0 (black), spaces become 255 (white)
2. Find connected components on inverted mask
   - `num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(inverted, connectivity=8)`
3. For each component (skip label 0 = background):
   - Extract area from stats
   - Filter: min_area < area < max_area
     - min_area = 1000px² (remove noise)
     - max_area = 0.8 * image_area (remove exterior background)
   - Extract component mask: `component_mask = (labels == label).astype(np.uint8) * 255`
   - Find contour of component: `cv2.findContours(component_mask, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)`
   - Approximate contour (Douglas-Peucker)
   - Convert to polygon (List[Point2D], normalized)
   - Compute center from centroid (normalized)
   - Create Room(id, name="", polygon, center, room_type="unknown", area_normalized)
4. Return List[Room]

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| min_room_area | int | 1000 | Minimum room area (pixels) |
| max_room_area_ratio | float | 0.8 | Maximum room area as ratio of image area |

### Step 7d: Classify Rooms (Corridor vs Room)

**Algorithm:**
1. For each Room:
   - Compute bounding box of polygon
   - Compute aspect ratio: max(width, height) / min(width, height)
   - If aspect_ratio > 3.0 → room_type = "corridor"
   - Else → room_type = "room"
2. Update Room.room_type
3. Return rooms

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| corridor_aspect_ratio | float | 3.0 | Aspect ratio threshold for corridor classification |

### Step 7e: Detect Doors

**Algorithm:**
1. Dilate binary mask (walls expand)
   - kernel=5x5, iterations=1
2. Compare dilated mask with original mask
   - Gaps that close after dilation = potential doors
3. Find contours of closed gaps
4. For each gap:
   - Compute center
   - Find adjacent rooms (rooms whose polygons are within distance threshold of gap)
   - If 2 adjacent rooms found → create Door(id, position, width, connects=[room1_id, room2_id])
5. Return List[Door]

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| dilate_kernel | int | 5 | Dilation kernel size |
| dilate_iterations | int | 1 | Dilation iterations |
| adjacency_threshold | float | 0.05 | Distance threshold for room adjacency (normalized) |

### Step 7f: Assign Room Numbers

**Algorithm:**
1. For each TextBlock where is_room_number == True:
   - For each Room:
     - Check if text center is inside room polygon (point-in-polygon test)
     - If inside → assign Room.name = TextBlock.text, break
2. Return rooms (with names assigned)

**Point-in-Polygon Test:**
```python
from shapely.geometry import Point, Polygon

def point_in_polygon(point: Point2D, polygon: List[Point2D]) -> bool:
    """Check if point is inside polygon."""
    shapely_point = Point(point.x, point.y)
    shapely_polygon = Polygon([(p.x, p.y) for p in polygon])
    return shapely_polygon.contains(shapely_point)
```

---

## Step 8: Normalization + Scale Computation

**Input:**
- `walls: List[Wall]` (pixel coordinates)
- `rooms: List[Room]` (pixel coordinates)
- `doors: List[Door]` (pixel coordinates)
- `image_size: Tuple[int, int]` (width, height after crop)
- `wall_thickness_px: float`

**Output:** `VectorizationResult`

**Purpose:** Normalize all coordinates to [0, 1], compute scale factor, assemble final result.

**Algorithm:**
1. Normalize coordinates:
   - For each Wall: convert points to [0, 1] relative to image_size
   - For each Room: convert polygon and center to [0, 1]
   - For each Door: convert position to [0, 1]
2. Compute scale factor:
   - `estimated_pixels_per_meter = wall_thickness_px / 0.2` (standard wall ≈ 0.2m)
   - If wall_thickness_px == 0 → use default 50.0
3. Compute statistics:
   - rooms_with_names = count(room.name != "")
   - corridors_count = count(room.room_type == "corridor")
   - doors_count = len(doors)
4. Assemble VectorizationResult:
   - walls, rooms, doors, text_blocks
   - image_size_original, image_size_cropped, crop_rect, crop_applied
   - rotation_angle (0/90/180/270 degrees applied by user)
   - wall_thickness_px, estimated_pixels_per_meter
   - rooms_with_names, corridors_count, doors_count
5. Return VectorizationResult

**Error Handling:**

| Condition | Exception | Message |
|-----------|-----------|---------|
| Coordinates out of [0,1] | ValidationError | "Invalid coordinates: {point}" |
| Empty walls list | Warning (log) | "No walls detected" |

---

## Performance Expectations

| Step | Typical Time | Notes |
|------|-------------|-------|
| 1. Brightness Normalization | <0.5s | CLAHE is fast |
| 2. Color Filtering | <0.5s | HSV conversion + inpaint |
| 3. Auto-Crop Suggestion | <0.5s | Coarse binarization + contours |
| 4. Adaptive Binarization | <1s | Histogram analysis + threshold + morphology |
| 5. Text Detection | 2-5s | **Slowest step** (pytesseract) |
| 6. Text Removal | <0.5s | Inpaint small regions |
| 7. Room Detection | 1-2s | Connected components + classification |
| 8. Normalization | <0.1s | Coordinate conversion |
| **TOTAL** | **5-10s** | Typical plan (2000x2000px) |

**Optimization:** If pytesseract is slow, consider running it in background or making it optional.

---

## Error Propagation

All steps wrap errors with `ImageProcessingError(message, step=step_name)` so service layer can report exactly which step failed.

Example:
```python
try:
    normalized = normalize_brightness(image)
except ImageProcessingError as e:
    # e.step == "normalize_brightness"
    # e.message == "Empty image"
    logger.error(f"Pipeline failed at step {e.step}: {e.message}")
    raise
```
