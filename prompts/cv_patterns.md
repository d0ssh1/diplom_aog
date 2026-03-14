# CV Patterns: OpenCV & Image Processing in Diplom3D

## Core Rules

1. **Never mutate input arrays** — always `image.copy()` before modifying
2. **Document array format** — every function docstring states shape and dtype
3. **BGR is default** — OpenCV reads as BGR, not RGB. Convert explicitly.
4. **Check for None** — `cv2.imread()` returns None on failure, not an exception

---

## Function Signature Pattern

```python
def detect_walls(binary_image: np.ndarray) -> list[list[tuple[float, float]]]:
    """
    Detect wall contours in a binary floor plan image.

    Args:
        binary_image: Grayscale binary image (H, W), dtype=uint8, values 0 or 255.
                      Walls are WHITE (255), background is BLACK (0).

    Returns:
        List of wall polylines. Each polyline is a list of (x, y) points
        normalized to [0, 1] range relative to image dimensions.

    Raises:
        ImageProcessingError: if image is empty or has wrong dtype
    """
    if binary_image is None or binary_image.size == 0:
        raise ImageProcessingError("Empty image", step="detect_walls")

    if binary_image.dtype != np.uint8:
        raise ImageProcessingError(
            f"Expected uint8, got {binary_image.dtype}", step="detect_walls"
        )
    # ... implementation
```

---

## Common Pitfalls (agents must avoid these)

### ❌ Wrong: Modifying input
```python
def preprocess(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # OK — creates new array
    cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY, dst=gray)  # ❌ mutates gray
    return gray
```

### ✅ Correct: Explicit copy when needed
```python
def preprocess(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)  # new array
    return binary
```

### ❌ Wrong: Not checking imread result
```python
image = cv2.imread(path)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # crashes if file not found
```

### ✅ Correct: Validate immediately
```python
image = cv2.imread(str(path))
if image is None:
    raise ImageProcessingError(f"Failed to load image: {path}", step="load")
```

### ❌ Wrong: Hardcoded thresholds
```python
_, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
```

### ✅ Correct: Configurable or adaptive
```python
_, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
# OR pass threshold as parameter with sensible default
def binarize(gray: np.ndarray, threshold: int = 0, use_otsu: bool = True) -> np.ndarray:
```

---

## Coordinate Normalization

After vectorization, ALL coordinates MUST be in [0, 1] range:

```python
def normalize_contours(
    contours: list[np.ndarray],
    image_width: int,
    image_height: int,
) -> list[list[tuple[float, float]]]:
    """Convert pixel coordinates to [0, 1] normalized coordinates."""
    normalized = []
    for contour in contours:
        points = [
            (float(pt[0][0]) / image_width, float(pt[0][1]) / image_height)
            for pt in contour
        ]
        normalized.append(points)
    return normalized
```

Frontend and 3D builder work ONLY with normalized coordinates.
Denormalization happens at render time in the frontend.

---

## Error Handling

```python
# core/exceptions.py
class ImageProcessingError(Exception):
    """Error during image processing pipeline step."""
    def __init__(self, message: str, step: str) -> None:
        self.step = step
        super().__init__(f"[{step}] {message}")
```

Every processing function wraps errors with the step name so the service layer
can report exactly which pipeline stage failed.

---

## Testing Image Processing

```python
# Create test images programmatically
def make_rectangle_image(
    width: int = 200, height: int = 200,
    rect_bounds: tuple[int, int, int, int] = (20, 20, 180, 180),
    thickness: int = 3,
) -> np.ndarray:
    """White image with a black rectangle (simulates a room)."""
    img = np.ones((height, width, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, rect_bounds[:2], rect_bounds[2:], (0, 0, 0), thickness)
    return img

# Tests verify results, not pixel values
def test_vectorize_rectangle_returns_closed_contour():
    image = make_rectangle_image()
    binary = preprocess(image)
    result = vectorize(binary)
    assert len(result.walls) >= 1, "Should detect at least one wall contour"
    for wall in result.walls:
        assert all(0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 for x, y in wall), \
            "All coordinates must be normalized to [0, 1]"
```

---

## Performance Logging

```python
import time
import logging

logger = logging.getLogger(__name__)

def preprocess(image: np.ndarray) -> np.ndarray:
    start = time.perf_counter()
    # ... processing ...
    elapsed = time.perf_counter() - start
    logger.info("preprocess completed in %.3fs, image shape=%s", elapsed, image.shape)
    return result
```
