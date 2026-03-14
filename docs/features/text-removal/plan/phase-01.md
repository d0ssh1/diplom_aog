# Phase 1: Color Removal Functions

phase: 1
layer: processing
depends_on: none
design: ../README.md

## Goal

Добавить три новые pure functions в `processing/pipeline.py`: `remove_green_elements`, `remove_red_elements`, `remove_colored_elements`.

## Files to Modify

### `backend/app/processing/pipeline.py`

**What changes:** Добавить 3 новые функции между `color_filter()` (line 119) и `auto_crop_suggest()` (line 126).

**Implementation details:**

#### `remove_green_elements(image: np.ndarray) -> np.ndarray`

Ref: `06-pipeline-spec.md` → Step 3 → remove_green_elements

```python
def remove_green_elements(
    image: np.ndarray,
    hue_low: int = 35,
    hue_high: int = 85,
    sat_min: int = 40,
    val_min: int = 40,
    inpaint_radius: int = 3,
) -> np.ndarray:
```

- Validation: None/empty → `ImageProcessingError("remove_green_elements", "Empty image")`
- Validation: dtype != uint8 → `ImageProcessingError("remove_green_elements", f"Expected uint8, got {image.dtype}")`
- Validation: not 3-channel → `ImageProcessingError("remove_green_elements", f"Expected BGR (H,W,3), got shape {image.shape}")`
- `result = image.copy()` — NEVER mutate input
- HSV conversion, green mask, dilate, inpaint
- `time.perf_counter()` + `logger.info("remove_green_elements completed in %.3fs", elapsed)`

#### `remove_red_elements(image: np.ndarray) -> np.ndarray`

Ref: `06-pipeline-spec.md` → Step 3 → remove_red_elements

```python
def remove_red_elements(
    image: np.ndarray,
    hue_low1: int = 0,
    hue_high1: int = 10,
    hue_low2: int = 170,
    hue_high2: int = 180,
    sat_min: int = 50,
    val_min: int = 50,
    inpaint_radius: int = 3,
) -> np.ndarray:
```

- Same validation pattern as `remove_green_elements`
- `result = image.copy()`
- Two red HSV ranges (H wraps around 0/180), combine with `|`
- Dilate, inpaint
- Perf logging

#### `remove_colored_elements(image: np.ndarray) -> np.ndarray`

Ref: `06-pipeline-spec.md` → Step 3 → remove_colored_elements

```python
def remove_colored_elements(image: np.ndarray) -> np.ndarray:
```

- Validation: None/empty → error, dtype → error, shape → error
- `start = time.perf_counter()`
- `img = remove_green_elements(image)` — sub-function does .copy()
- `img = remove_red_elements(img)`
- Perf logging for total time
- Return img

**Insertion point:** After `color_filter()` (after line 119), before `auto_crop_suggest()` section comment (line 122).

**Key rules from `prompts/cv_patterns.md`:**
- Never mutate input `np.ndarray` — always `.copy()` first
- Document array format in docstring: `(H, W, 3), dtype=uint8`
- Use `ImageProcessingError(step_name, message)` for all errors
- `time.perf_counter()` + `logger.info()` for timing
- BGR is default, convert explicitly

## Verification
- [ ] `python -m py_compile backend/app/processing/pipeline.py` passes
- [ ] Functions are pure — no imports from api/, services/, db/
- [ ] Each function has `.copy()` before mutation
- [ ] Each function has 3 validations: None/empty, dtype, shape
- [ ] Each function has `time.perf_counter()` logging
- [ ] Docstrings document input/output array format
