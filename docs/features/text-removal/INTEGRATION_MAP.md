# Text-Removal Integration Map — Diplom3D

**Date:** 2026-03-14
**Status:** Research phase — integration points mapped
**Scope:** Automatic removal of colored elements and text from evacuation plan images

---

## 1. CURRENT PIPELINE ORDER — Call Chain

### 1.1 Endpoint Trigger
**File:** `backend/app/api/reconstruction.py:35-62`

```
POST /api/v1/reconstruction/initial-masks
  ↓
CalculateMaskRequest {file_id, crop?, rotation?}
  ↓
MaskService.calculate_mask()
```

### 1.2 Mask Calculation Pipeline
**File:** `backend/app/services/mask_service.py:34-112`

**Current order (BROKEN — see ticket 02-fix-mask-regression.md):**
```
1. Load image from disk (cv2.imread)
2. Rotate if rotation parameter provided
3. [OPTIONAL] normalize_brightness() — DISABLED by default (corrupts Otsu)
4. [OPTIONAL] color_filter() — DISABLED by default (too aggressive)
5. Apply user crop if provided
6. Convert to grayscale
7. GaussianBlur(3,3) — noise reduction
8. adaptiveThreshold() — THRESH_BINARY_INV (walls become white)
9. morphologyEx(MORPH_CLOSE) — fill small gaps
10. Save mask to disk
```

**Return:** `mask_filename` (e.g., "uuid.png")

### 1.3 Text Detection & Removal (NOT YET INTEGRATED)
**File:** `backend/app/processing/pipeline.py:193-322`

**Functions exist but are NOT called in mask_service.py:**
- `text_detect()` — line 193-263 — uses pytesseract OCR
- `remove_text_regions()` — line 270-322 — inpaints text bounding boxes

**Current status:** These functions are defined but orphaned. They are only called later in `reconstruction_service.py:build_mesh()` if text_blocks are provided.

### 1.4 Vectorization Pipeline (After Mask)
**File:** `backend/app/services/reconstruction_service.py:54-204`

**Called from:** `POST /api/v1/reconstruction/reconstructions` (line 84-108)

**Order:**
```
1. Load mask from disk
2. Extract walls via ContourService
3. Compute wall thickness
4. Detect rooms (inverted mask + connected components)
5. Classify rooms (aspect ratio → corridor vs room)
6. Detect doors (dilation + gap detection)
7. Load text_blocks from {mask_file_id}_text.json if exists (line 125-137)
8. Assign room numbers (point-in-polygon test)
9. Normalize coordinates to [0,1]
10. Compute scale factor
11. Build 3D mesh
12. Export OBJ + GLB
```

**Key:** Text blocks are loaded from a JSON file that should have been saved during mask calculation, but currently nothing saves it.

---

## 2. FILE STORAGE — Mask & Text Files

### 2.1 Directory Structure
```
UPLOAD_DIR/
├── plans/           ← Original uploaded images
│   └── {file_id}.{ext}
├── masks/           ← Generated binary masks
│   ├── {file_id}.png
│   └── {file_id}_text.json  ← TEXT BLOCKS (NOT CURRENTLY SAVED)
├── processed/       ← Intermediate results (BinarizationService)
├── contours/        ← Contour extraction results
├── models/          ← 3D mesh exports
│   ├── reconstruction_{id}.obj
│   └── reconstruction_{id}.glb
└── environment/     ← User environment photos
```

### 2.2 Mask File Naming
**File:** `backend/app/services/mask_service.py:108`
```python
output_path = os.path.join(self._masks_dir, f"{file_id}.png")
```

**Convention:** `{file_id}.png` — binary image (uint8, 0 or 255)

### 2.3 Text Blocks File (MISSING)
**Expected location:** `masks/{file_id}_text.json`

**Expected format** (from `backend/app/services/reconstruction_service.py:125-137`):
```json
[
  {
    "text": "304",
    "center": {"x": 0.45, "y": 0.32},
    "confidence": 85.5,
    "is_room_number": true
  },
  {
    "text": "Коридор",
    "center": {"x": 0.12, "y": 0.67},
    "confidence": 72.0,
    "is_room_number": false
  }
]
```

**Current status:** This file is never created. `text_detect()` returns a list but it's not persisted.

### 2.4 Intermediate Results (Optional Debug)
**File:** `backend/app/processing/pipeline.py:164-169`

Logging suggests intermediate results could be saved for debugging:
```python
logger.info("preprocess completed in %.3fs, image shape=%s", elapsed, image.shape)
```

But no actual file saving is implemented in the pipeline functions.

---

## 3. FRONTEND EXPECTATIONS

### 3.1 Mask Display
**File:** `frontend/src/pages/AddReconstructionPage.tsx:80-200+`

**Current flow:**
1. User uploads plan image → `uploadApi.uploadPlanPhoto()` (line 77-83)
2. Frontend calls `reconstructionApi.calculateMask()` (line 110-125)
3. Mask is displayed in `MaskEditor` component (line 17)

### 3.2 Mask Editor Component
**File:** `frontend/src/components/MaskEditor.tsx:1-194`

**Current capabilities:**
- Display plan image as semi-transparent background (line 126-147)
- Draw white lines (walls) with pencil brush (line 31-33)
- Erase with black brush (line 82)
- Adjustable brush size (line 173-182)
- Save edited mask as PNG blob (line 86-101)

**Limitations:**
- No display of detected text blocks
- No display of detected rooms/doors
- No visualization of what will be removed
- No parameters for text-removal tuning

### 3.3 API Calls for Mask
**File:** `frontend/src/api/apiService.ts:109-125`

```typescript
reconstructionApi.calculateMask: async (fileId, crop?, rotation?) => {
  POST /reconstruction/initial-masks {
    file_id: fileId,
    crop: {x, y, width, height},
    rotation: 0|90|180|270
  }
  returns: {id, url, ...}
}
```

**Missing parameters:**
- No `enable_text_removal` flag
- No `text_detection_confidence` threshold
- No `inpaint_radius` parameter
- No `saturation_threshold` for color filtering

---

## 4. EXISTING TEXT/COLOR REMOVAL APPROACHES

### 4.1 Color Filtering (Colored Elements)
**File:** `backend/app/processing/pipeline.py:86-119`

**Function:** `color_filter(image, saturation_threshold=50, inpaint_radius=3)`

**Algorithm:**
1. Convert BGR → HSV
2. Extract saturation channel
3. Create mask: `S > saturation_threshold` → 255
4. Inpaint colored regions using TELEA algorithm
5. Return filtered BGR image

**Current status:** DISABLED by default in `mask_service.py:75`
- Reason: Too aggressive for evacuation plans (many elements have non-zero saturation)
- Default threshold (50) is too low
- Inpainting can blur structural elements

**Known issues (from ticket 02):**
- Saturation threshold of 50 removes too much
- Inpainting radius of 3 is insufficient for large colored areas
- Applied before binarization, corrupts Otsu threshold

### 4.2 Text Detection (OCR)
**File:** `backend/app/processing/pipeline.py:193-263`

**Function:** `text_detect(image, binary_mask, confidence_threshold=60)`

**Algorithm:**
1. Use pytesseract with `lang="rus+eng"` and `psm 6` (uniform text block)
2. Extract bounding boxes and confidence scores
3. Normalize coordinates to [0,1]
4. Classify as room number if matches GOST pattern (line 26-34)
5. Return list of TextBlock objects

**Current status:** ORPHANED — defined but never called from mask pipeline
- Only called in `reconstruction_service.py:build_mesh()` if text_blocks provided
- Requires pytesseract to be installed (optional dependency)
- Confidence threshold default is 60 (0-100 scale)

**Room number patterns (line 26-29):**
```python
r"^\d{3,4}[А-Яа-яA-Za-z]?$"   # 1103, 1103А
r"^[A-ZА-Я]\d{3,4}$"            # A304, Б201
```

### 4.3 Text Removal (Inpainting)
**File:** `backend/app/processing/pipeline.py:270-322`

**Function:** `remove_text_regions(binary_mask, text_blocks, image_size, inpaint_radius=5, text_height_px=20, char_width_px=10)`

**Algorithm:**
1. For each TextBlock, compute bounding box in pixels:
   - Width: `len(text) * char_width_px`
   - Height: `text_height_px`
   - Center: normalized coordinates → pixel coordinates
2. Draw rectangles on removal_mask (white = 255)
3. Inpaint binary_mask using TELEA algorithm
4. Return cleaned mask

**Current status:** ORPHANED — defined but never called
- Expects text_blocks from `text_detect()`
- Inpaint radius default is 5 pixels
- Text height/width estimates are hardcoded (20px, 10px)

**Known issues:**
- Hardcoded text dimensions don't adapt to image resolution
- Inpainting can blur wall edges near text
- No handling of overlapping text blocks

---

## 5. INTEGRATION GAPS — What's Missing

### 5.1 Mask Pipeline Integration
**Gap:** Text detection and removal are not called in `mask_service.py`

**Current:** `mask_service.calculate_mask()` only does:
- Rotation, crop, binarization, morphology

**Missing:**
- Call to `text_detect()` on original image
- Call to `remove_text_regions()` on binary mask
- Persistence of text_blocks to `{file_id}_text.json`

**Impact:** Text blocks are never detected during mask calculation, so they can't be removed from the mask.

### 5.2 Color Filtering Integration
**Gap:** `color_filter()` is disabled and never called

**Current:** `mask_service.py:75` has it disabled with comment "too aggressive"

**Missing:**
- Tunable saturation threshold (currently hardcoded 50)
- Tunable inpaint radius (currently hardcoded 3)
- Frontend UI to enable/disable and adjust parameters
- Testing on real evacuation plans

**Impact:** Colored elements (green arrows, red symbols) are not removed from masks.

### 5.3 Frontend UI for Text-Removal
**Gap:** No UI controls for text-removal parameters

**Current:** `AddReconstructionPage.tsx` only has crop and rotation controls

**Missing:**
- Checkbox to enable text removal
- Checkbox to enable color filtering
- Sliders for confidence threshold, inpaint radius, saturation threshold
- Preview of detected text blocks on mask
- Preview of what will be removed

**Impact:** Users can't control text-removal behavior or see what's being detected.

### 5.4 API Request/Response Models
**Gap:** No Pydantic models for text-removal parameters

**Current:** `CalculateMaskRequest` only has `file_id`, `crop`, `rotation`

**Missing:**
```python
class CalculateMaskRequest(BaseModel):
    file_id: str
    crop: Optional[CropRect] = None
    rotation: int = 0
    # NEW:
    enable_text_removal: bool = False
    enable_color_filter: bool = False
    text_confidence_threshold: int = 60
    inpaint_radius: int = 5
    saturation_threshold: int = 50
```

**Impact:** Backend can't receive text-removal parameters from frontend.

### 5.5 Text Blocks Persistence
**Gap:** Text blocks are detected but never saved

**Current:** `text_detect()` returns list but it's discarded

**Missing:**
- Save text_blocks to `{file_id}_text.json` in `mask_service.calculate_mask()`
- Load and return text_blocks in `CalculateMaskResponse`
- Frontend display of detected text blocks

**Impact:** Text blocks are lost after mask calculation and must be re-detected during vectorization.

---

## 6. CALL CHAIN SUMMARY

### 6.1 Current (Broken) Flow
```
Frontend: POST /upload/plan-photo/
  ↓
Backend: save_upload_file() → {file_id}.{ext} in plans/
  ↓
Frontend: POST /reconstruction/initial-masks
  ↓
Backend: MaskService.calculate_mask()
  ├─ Load image
  ├─ Rotate
  ├─ [SKIP] normalize_brightness (disabled)
  ├─ [SKIP] color_filter (disabled)
  ├─ Crop
  ├─ Binarize (adaptive threshold)
  ├─ Morphology (close)
  └─ Save {file_id}.png
  ↓
Frontend: Display mask in MaskEditor
  ↓
Frontend: POST /reconstruction/reconstructions
  ↓
Backend: ReconstructionService.build_mesh()
  ├─ Load mask
  ├─ Extract walls
  ├─ Detect rooms
  ├─ [TRY] Load {file_id}_text.json (FAILS — never created)
  ├─ [SKIP] Assign room numbers (no text blocks)
  └─ Build 3D mesh
```

### 6.2 Desired (Fixed) Flow
```
Frontend: POST /reconstruction/initial-masks
  {file_id, crop?, rotation?, enable_text_removal?, enable_color_filter?}
  ↓
Backend: MaskService.calculate_mask()
  ├─ Load image
  ├─ Rotate
  ├─ [IF enable_color_filter] color_filter()
  ├─ Crop
  ├─ Binarize
  ├─ [IF enable_text_removal] text_detect() on original image
  ├─ [IF enable_text_removal] remove_text_regions() on binary mask
  ├─ Save {file_id}.png
  ├─ Save {file_id}_text.json (if text_blocks detected)
  └─ Return CalculateMaskResponse {url, text_blocks}
  ↓
Frontend: Display mask + detected text blocks
  ↓
Frontend: POST /reconstruction/reconstructions
  ↓
Backend: ReconstructionService.build_mesh()
  ├─ Load mask (already cleaned)
  ├─ Load {file_id}_text.json (SUCCESS)
  ├─ Assign room numbers from text blocks
  └─ Build 3D mesh with room names
```

---

## 7. KEY FILES & LINE NUMBERS

### Backend

| File | Lines | Purpose |
|------|-------|---------|
| `backend/app/api/reconstruction.py` | 35-62 | Mask calculation endpoint |
| `backend/app/services/mask_service.py` | 34-112 | Mask pipeline orchestration |
| `backend/app/processing/pipeline.py` | 86-119 | `color_filter()` function |
| `backend/app/processing/pipeline.py` | 193-263 | `text_detect()` function |
| `backend/app/processing/pipeline.py` | 270-322 | `remove_text_regions()` function |
| `backend/app/services/reconstruction_service.py` | 54-204 | Vectorization pipeline |
| `backend/app/services/reconstruction_service.py` | 125-137 | Text blocks loading (orphaned) |
| `backend/app/models/domain.py` | 18-23 | `TextBlock` domain model |
| `backend/app/core/exceptions.py` | — | `ImageProcessingError` exception |

### Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/pages/AddReconstructionPage.tsx` | 80-200+ | Reconstruction workflow |
| `frontend/src/components/MaskEditor.tsx` | 1-194 | Mask editing UI |
| `frontend/src/api/apiService.ts` | 109-125 | `calculateMask()` API call |

### Configuration & Standards

| File | Purpose |
|------|---------|
| `prompts/pipeline.md` | Pipeline architecture (Step 2: Text Removal) |
| `prompts/cv_patterns.md` | OpenCV best practices |
| `tickets/02-fix-mask-regression.md` | Known issues with current pipeline |

---

## 8. CONSTRAINTS & KNOWN ISSUES

### 8.1 From Ticket 02 (Mask Regression)
- `normalize_brightness()` + `color_filter()` corrupt Otsu threshold
- `auto_crop_suggest()` picks wrong regions on complex plans
- Current pipeline order differs from working version
- Saturation threshold (50) too low for evacuation plans

### 8.2 Text Detection Limitations
- Requires pytesseract (optional dependency, may not be installed)
- OCR confidence threshold (60) may be too strict or too loose
- Room number patterns only match GOST standard (may miss variations)
- Text height/width estimates (20px, 10px) are hardcoded

### 8.3 Text Removal Limitations
- Inpainting can blur wall edges near text
- No handling of overlapping text blocks
- Inpaint radius (5px) may be insufficient for large text
- No adaptive sizing based on image resolution

### 8.4 Architecture Debt
- `processing/` contains service classes, not pure functions (violates standard)
- No `services/` layer yet — business logic in `api/` and `processing/`
- No `repositories/` — direct SQLAlchemy usage
- Uses `print()` instead of `logging` in some places

---

## 9. NEXT STEPS FOR IMPLEMENTATION

### Phase 1: Fix Mask Regression (Ticket 02)
1. Disable `normalize_brightness()` and `color_filter()` by default
2. Don't call `auto_crop_suggest()` when `crop is None`
3. Restore working binarization order

### Phase 2: Integrate Text Removal
1. Add `enable_text_removal` parameter to `CalculateMaskRequest`
2. Call `text_detect()` in `mask_service.calculate_mask()`
3. Call `remove_text_regions()` on binary mask
4. Save text_blocks to `{file_id}_text.json`
5. Return text_blocks in `CalculateMaskResponse`

### Phase 3: Integrate Color Filtering
1. Add `enable_color_filter` parameter to `CalculateMaskRequest`
2. Make saturation threshold tunable
3. Test on real evacuation plans
4. Adjust default threshold (currently 50, should be 100-120)

### Phase 4: Frontend UI
1. Add checkboxes for text removal and color filtering
2. Add sliders for confidence threshold, inpaint radius, saturation threshold
3. Display detected text blocks on mask preview
4. Show what will be removed before processing

### Phase 5: Testing & Validation
1. Test on real evacuation plans
2. Compare results with manual mask editing
3. Measure OCR accuracy on room numbers
4. Validate text removal doesn't damage walls

---

## 10. REFERENCES

- **Architecture:** `prompts/architecture.md` — Section "Core Pipeline"
- **Pipeline spec:** `prompts/pipeline.md` — Step 2: Text Removal
- **CV patterns:** `prompts/cv_patterns.md` — Error handling, coordinate normalization
- **Known issues:** `tickets/02-fix-mask-regression.md` — Mask regression details
- **Project context:** `prompts/project_context.md` — Domain entities, requirements
