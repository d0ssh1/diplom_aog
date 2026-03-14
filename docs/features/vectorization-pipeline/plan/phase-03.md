# Phase 3: Pipeline Functions (Steps 4-6)

phase: 3
layer: processing
depends_on: phase-01
design: ../README.md

## Goal

Implement Steps 4-6: adaptive binarization (delegates to BinarizationService), text detection (pytesseract), text removal (inpaint).

## Context

Phase 1 completed: domain models available.
Phase 2 completed: Steps 1-3 implemented.

Add Steps 4-6 to `processing/pipeline.py`.

## Files to Modify

### `backend/app/processing/pipeline.py`

**Add functions:**

1. **text_detect()** — Reference: `../06-pipeline-spec.md` lines 314-368
   - Use pytesseract.image_to_data()
   - Parse output, filter by confidence > 60
   - Match room number patterns: `^\d{3,4}[А-Яа-яA-Za-z]?$` or `^[A-ZА-Я]\d{3,4}$`
   - Return List[TextBlock]
   - Graceful degradation: if pytesseract not installed, return []

2. **remove_text_regions()** — Reference: `../06-pipeline-spec.md` lines 373-405
   - Create removal mask from TextBlock bounding boxes
   - cv2.inpaint(binary_mask, removal_mask, radius=5, INPAINT_TELEA)
   - Return inpainted mask

**Implementation notes:**
- Make pytesseract optional: wrap import in try/except
- If pytesseract not available, text_detect logs warning and returns []
- Room number regex patterns as module-level constants

**Reference:**
- Design: `../06-pipeline-spec.md` Steps 4-6
- Decision: `../03-decisions.md` #6 (pytesseract choice)
- Decision: `../03-decisions.md` #7 (room number patterns)

## Verification

- [ ] `python -m py_compile backend/app/processing/pipeline.py` passes
- [ ] Import test succeeds
- [ ] text_detect() returns empty list if pytesseract not installed (no crash)
- [ ] text_detect() with test image containing "1103" returns TextBlock with is_room_number=True
- [ ] remove_text_regions() inpaints text regions correctly
