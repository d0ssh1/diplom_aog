# Research: EditPlanPage Room Rendering Bug

_Date: 2026-04-04_

## Summary

This document records the investigation into the bug where rooms/cabinets are rendered incorrectly when opening an existing plan in `EditPlanPage`. The key conclusion is that the backend persistence path is not the primary source of corruption. The most likely bug is in the frontend edit-mode data flow, especially how `EditPlanPage` converts backend room polygons into canvas rectangles and how `WallEditorCanvas` renders those rectangles in pixel space.

The bug was investigated in multiple layers:
- backend persistence and retrieval of vector data
- edit-page load/save transformations
- Fabric.js canvas rendering and coordinate conversion
- possible duplication through re-render/re-mount behavior

---

## User-Observed Symptom

When opening the same plan in edit mode:
- rooms/cabinets appear shifted or oversized
- sometimes two orange rectangles are visible for the same cabinet
- the issue is visible immediately on opening the edit page, before any manual edits
- backend debug logs show room data exists and is normalized, but the rendered result is wrong

At one point the assumption was that rooms could have complex geometry, but the user clarified that cabinets are always rectangles. This eliminated the “complex polygon” explanation and narrowed the investigation to coordinate handling and duplication.

---

## What Was Checked

### 1) Backend save/load path

Files inspected:
- `backend/app/services/reconstruction_service.py`
- `backend/app/db/repositories/reconstruction_repo.py`
- `backend/app/models/domain.py`
- `backend/app/models/reconstruction_vectors.py`

Findings:
- `vectorization_data` is stored as raw JSON text in the `reconstructions` table.
- `update_vectorization_data()` in the service serializes `model_dump()` and the repository writes that JSON directly.
- `get_vectorization_data()` deserializes the same JSON back into the vectorization model.
- There is no evidence that the database layer itself changes room geometry.
- The domain model supports normalized room data with `polygon`, `center`, `room_type`, and `area_normalized`.

Conclusion:
- The database save/load path is likely not the root cause.
- The backend appears to preserve the data shape it receives.

### 2) Edit page load mapping

File inspected:
- `frontend/src/pages/EditPlanPage.tsx`

Findings:
- The page fetches reconstruction metadata and vector data on mount.
- It converts each backend room polygon into a UI rectangle via bounding box logic:
  - `x = min(xs)`
  - `y = min(ys)`
  - `width = max(xs) - min(xs)`
  - `height = max(ys) - min(ys)`
- Earlier versions of the page also tried heuristics such as:
  - `center + sqrt(area_normalized)`
  - filtering oversized unnamed rooms
  - special handling for irregular rooms
- These heuristics were later rolled back after they were shown to hide cabinets entirely.

Important observation:
- The page does not render the backend polygon as-is.
- It converts it into a normalized rectangle before passing it to the canvas.
- That transformation is lossier than the backend data and can introduce visual drift if later used as a source of truth.

Conclusion:
- `EditPlanPage.tsx` is a strong candidate for the bug location.
- It performs a geometry simplification step that may be harmless for some rooms but still creates a mismatch between stored vectors and displayed annotations.

### 3) Save path in edit mode

File inspected:
- `frontend/src/pages/EditPlanPage.tsx`

Findings:
- On save, the page calls `canvasRef.current.getAnnotations()`.
- It then serializes each room annotation back into a 4-point polygon rectangle.
- The payload includes:
  - `center`
  - `polygon` as a rectangle
  - `area_normalized = width * height`
- The payload merges with `data.rawVectors` rather than replacing it outright.

Conclusion:
- The backend is not obviously corrupting rooms here.
- The frontend save path is flattening the UI annotation geometry back into a rectangle.
- If the UI rectangle is already mis-positioned or incorrectly scaled, that error will be persisted.

### 4) Canvas rendering and coordinate conversion

File inspected:
- `frontend/src/components/Editor/WallEditorCanvas.tsx`

Findings:
- `WallEditorCanvas` keeps two representations:
  - normalized room/door refs for saving
  - Fabric.js objects in pixel space for rendering
- Background image is scaled to fit the container, and `bgDims` is used to convert normalized values to display-space pixels.
- `restoreAnnotations()` converts normalized values using helper functions:
  - `toDisplayX`
  - `toDisplayY`
  - `toDisplayW`
  - `toDisplayH`
- Rooms are rendered as `fabric.Rect` objects inside a `fabric.Group` with label text.
- The renderer has a guard that prevents restoration if `annotation` or `door` objects already exist on the canvas.

Important observation:
- If the normalized input is correct but the background scaling/offset is off, the rendered rectangle will be shifted.
- If `restoreAnnotations()` runs multiple times in different canvas lifecycles, the same room can appear duplicated or re-added.
- The canvas itself only knows rectangles; it does not know the backend polygon shape.

Conclusion:
- The canvas is not the main data corrupter, but it is the place where coordinate mismatch becomes visible.
- If the input from `EditPlanPage` is already wrong, the canvas will faithfully render the wrong rectangle.

### 5) Duplicate rendering hypothesis

Files inspected:
- `frontend/src/pages/EditPlanPage.tsx`
- `frontend/src/components/Wizard/StepWallEditor.tsx`
- `frontend/src/components/Editor/WallEditorCanvas.tsx`

Findings:
- `StepWallEditor` is mostly a pass-through; it forwards `initialRooms` and `initialDoors`.
- `WallEditorCanvas` loads the background image and then restores annotations.
- The current code does not prove a second room layer exists.
- However, visual duplication may happen if the canvas is re-mounted or if room objects are restored more than once.

Conclusion:
- Duplicate orange rectangles are more likely to be a render/re-mount or coordinate issue than a backend duplication issue.
- No hard evidence was found that the DB stores the same room twice.

---

## What Was Reproduced in Logs

A diagnostic console dump from the frontend showed backend rooms with:
- empty `name` values for some entries
- `polygon_points` of 4, 6, and 7 in different cases
- normalized `bbox` values such as:
  - `0.999 × 0.998`
  - `0.577 × 0.444`
- valid `center` and `area_normalized`

This confirmed:
- the backend is returning normalized vector data
- the data itself is not obviously malformed at the API boundary
- the frontend is doing the geometry interpretation after load

At another point, a filter-based frontend patch caused cabinets to disappear entirely. That confirmed the filter was too aggressive and that cabinets should not be dropped based on `name` alone.

---

## Key Conclusions

### Conclusion 1: The database path is probably fine
The repository and service save/load vectorization JSON without obvious geometry corruption.

### Conclusion 2: The main risk is frontend geometry interpretation
`EditPlanPage.tsx` converts room polygons into rectangles, then serializes those rectangles back into polygons on save.

### Conclusion 3: The canvas is a rendering layer, not the root cause
`WallEditorCanvas.tsx` renders the data it receives. If the room is shifted there, the bad transform likely happened earlier.

### Conclusion 4: Cabinets are rectangular, so complex-shape heuristics are not the right fix
The “complex polygon” hypothesis was ruled out by the user. The bug is better explained by coordinate mismatch or duplicate rendering.

---

## Most Likely Root Cause

The most likely source of the visible bug is the frontend edit flow, specifically:
1. `EditPlanPage.tsx` turns backend room polygons into bbox rectangles.
2. `WallEditorCanvas.tsx` converts those rectangles into display-space coordinates using background dimensions.
3. The resulting rectangle is rendered with a visible offset/scale mismatch, or is re-added in a repeated restore cycle.

In other words, the issue is probably not “bad saved data in DB”, but “correct normalized data that is interpreted incorrectly in edit mode”.

---

## Files Checked

### Backend
- `backend/app/services/reconstruction_service.py`
- `backend/app/db/repositories/reconstruction_repo.py`
- `backend/app/models/domain.py`
- `backend/app/models/reconstruction_vectors.py`

### Frontend
- `frontend/src/pages/EditPlanPage.tsx`
- `frontend/src/components/Wizard/StepWallEditor.tsx`
- `frontend/src/components/Editor/WallEditorCanvas.tsx`

### Tests
- `backend/tests/services/test_reconstruction_service.py`
- `backend/tests/api/test_reconstruction_vectors_api.py`

---

## Notes on Tests

Existing tests are limited:
- `backend/tests/services/test_reconstruction_service.py` verifies that JSON is serialized and parsed correctly.
- `backend/tests/api/test_reconstruction_vectors_api.py` is mostly a placeholder and does not assert concrete payload structure.

There is currently no strong regression test covering the edit-mode rendering bug.

---

## Suggested Next Fix Order

1. Re-check `EditPlanPage.tsx` load mapping and save mapping together.
2. Verify `WallEditorCanvas.tsx` receives normalized values and that `bgDims` matches the actual rendered background.
3. Confirm whether `restoreAnnotations()` runs more than once for the same canvas lifecycle.
4. Only after that, add a regression test for the concrete failure mode.

---

## Final Assessment

The evidence gathered so far points away from the database and toward the edit-mode frontend transformation pipeline. The backend appears to persist normalized vector data correctly, but the frontend likely distorts or re-renders room rectangles incorrectly when entering `EditPlanPage`.
