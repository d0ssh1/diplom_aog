# Design Decisions: Stitching-Plans

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Coordinate transformation order | Scale → Rotate → Translate | Translate → Rotate → Scale | Matches Fabric.js transformation order. Ensures rotation happens around object center, not canvas origin. |
| 2 | Clip polygon semantics | "Subtract" (delete inside) | "Keep" (delete outside) | User mental model: "cut out overlap zones". Overlap is inside polygon, should be removed. |
| 3 | Processing layer dependency | Pure functions (Shapely + numpy only) | Allow DB access in processing | Follows existing architecture (processing/pipeline.py). Enables unit testing without DB. Service layer orchestrates. |
| 4 | Undo/redo strategy | Snapshot-based (full state) | Delta-based (inverse operations) | Affine transforms + clip polygons are complex. Computing inverse is error-prone. Snapshots are simpler, limit to 50 prevents memory issues. |
| 5 | Database model extension | Add fields to Reconstruction table | Create new StitchedReconstruction table | Stitched reconstruction IS a reconstruction. Same structure, same 3D pipeline. Avoids duplication. Filter via `source_reconstruction_ids != null`. |
| 6 | Canvas library | Fabric.js | Konva.js, Paper.js | Already used in WallEditorCanvas.tsx. Team familiar. Supports clipPath, transformations, events. |
| 7 | Multi-plan selection UI | Step 1 = form, Step 2 = canvas | Single page with sidebar | Canvas is heavy (images + Fabric.js). Don't load until plans selected. Follows WizardPage.tsx pattern. |
| 8 | Duplicate room handling | Warn, don't block | Block with error | User might intentionally have duplicates (different sections, same numbering). Let them decide. Distance threshold 30px (configurable). |
| 9 | Raster image stitching | OpenCV warpAffine + composite | Skip, use vector only | Need preview image for reconstruction card. Also useful for debugging. Minimal cost (one-time operation). |
| 10 | Normalization strategy | Bounding box of merged model | Fixed canvas size | Plans have different sizes. Bounding box ensures all data fits in [0,1]. Matches existing normalize_coords() in pipeline.py:880. |
| 11 | Shapely dependency | Add to requirements.txt | Implement polygon ops manually | Shapely is industry standard for polygon operations. Well-tested. Supports difference, intersection, contains. |
| 12 | API endpoint structure | POST /api/v1/stitching/ | POST /api/v1/reconstructions/stitch | Stitching is a distinct operation (not CRUD on reconstructions). Separate router keeps code organized. Follows existing pattern (api/reconstruction.py, api/navigation.py). |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large plans (>5000 walls) cause slow merge | Medium | Add progress indicator. Consider async task queue (Celery) if >10s. For MVP, accept 10-15s processing time. |
| Fabric.js clipPath performance with complex polygons | Medium | Limit polygon points to 100. Simplify with Douglas-Peucker if needed. Test with real plans. |
| User forgets to crop overlap → duplicate rooms | Low | Detect duplicates in check_duplicate_rooms(). Show warnings in response. User can re-edit. |
| Coordinate precision loss (float rounding) | Low | Use float64 in numpy. Normalize only at final step. Precision loss <0.001 acceptable for [0,1] space. |
| Memory usage with 50 undo snapshots | Low | Each snapshot ~10-50KB (JSON). 50 snapshots = 0.5-2.5MB. Acceptable for modern browsers. |
| Affine transform doesn't preserve room-door relationships | High | Apply same matrix to walls, rooms, doors. Test with end-to-end test: verify door positions match walls after transform. |
| Shapely not available on Windows | Medium | Shapely has Windows wheels on PyPI. Add to requirements.txt, test in CI. Fallback: use opencv contour operations (less elegant). |

## Open Questions

- [x] **Q1:** Should we support automatic alignment (feature matching)?
  **A:** No, not in MVP. Manual positioning is sufficient. Auto-align can be added later as enhancement.

- [x] **Q2:** Should we allow editing stitched reconstruction (move individual rooms)?
  **A:** No, not in this feature. Use existing WallEditorCanvas for post-stitch edits. Stitching creates new reconstruction, then standard editing applies.

- [x] **Q3:** What if user wants to stitch 3+ plans?
  **A:** Supported. Loop over all source_plans in request. No limit (but UI may need scroll for >5 plans).

- [x] **Q4:** Should we validate that plans belong to same building/floor?
  **A:** Yes, in Step 1 form. User selects building + floor first, then only plans from that floor are shown. Backend validates building_id + floor_number match.

- [x] **Q5:** What happens to original reconstructions after stitching?
  **A:** They remain unchanged. Stitched reconstruction is a new record. User can delete originals manually if desired.

- [x] **Q6:** Should we support undo/redo across page refresh?
  **A:** No. Undo/redo is session-only (in-memory). If user refreshes, history is lost. Acceptable for MVP.

- [x] **Q7:** How to handle plans with different pixels_per_meter?
  **A:** Use scale transform to normalize. User adjusts scale visually on canvas. Backend computes weighted average pixels_per_meter for merged model.

- [ ] **Q8:** Should we show grid/rulers on canvas for alignment?
  **A:** Nice-to-have. Not critical for MVP. User aligns visually by overlaying masks. Can add in future iteration.

## Technical Constraints

1. **Fabric.js version:** Must use Fabric.js 5+ for `inverted: true` clipPath support. Check package.json.

2. **Shapely version:** Requires Shapely 2.x (supports Python 3.12). Add `shapely>=2.0.0` to requirements.txt.

3. **Browser compatibility:** Fabric.js requires modern browsers (Chrome 90+, Firefox 88+, Safari 14+). No IE11 support.

4. **Image size limits:** Canvas can handle up to 4096x4096px per plan (browser limit). Larger images should be downscaled in preprocessing.

5. **Coordinate precision:** Float32 in Fabric.js, Float64 in numpy. Final normalized coords stored as Float in DB (sufficient precision for [0,1] range).

6. **Database JSON column:** `vectorization_data` is TEXT (not JSONB). PostgreSQL supports JSONB for better querying, but existing schema uses TEXT. Keep consistent.

## Design Patterns Applied

### 1. Pure Functions (from prompts/architecture.md)

**Pattern:** `processing/` contains pure functions (no DB, no HTTP, no side effects).

**Applied:**
- `processing/stitching/transform.py` — only numpy operations
- `processing/stitching/clip.py` — only Shapely operations
- `processing/stitching/merge.py` — only list operations + math

**Benefit:** Easy to test, no mocks needed.

### 2. Service Layer Orchestration (from services/reconstruction_service.py)

**Pattern:** Service loads data from repo, calls processing functions, saves result.

**Applied:**
- `StitchingService.stitch_plans()` orchestrates:
  1. Load VectorizationResult from DB (via repo)
  2. Call processing functions (transform, clip, merge)
  3. Save new Reconstruction (via repo)

**Benefit:** Separation of concerns. Processing is reusable.

### 3. Pydantic Validation (from models/reconstruction.py)

**Pattern:** Request/Response models with Field validators.

**Applied:**
- `StitchingRequest` validates: name (min_length=1), building_id (UUID), floor_number (int), source_plans (min 2)
- `TransformInput` validates: scale (>0), rotation (0-360)

**Benefit:** Automatic validation, clear error messages.

### 4. Fabric.js in Hook (from components/Editor/WallEditorCanvas.tsx)

**Pattern:** Fabric.js logic in custom hook, component only renders container.

**Applied:**
- `useStitchingCanvas.ts` — initializes canvas, handles events, exports state
- `StitchingCanvas.tsx` — renders `<div ref={containerRef} />`, calls hook

**Benefit:** Logic testable, component simple.

### 5. Multi-Step Wizard (from pages/WizardPage.tsx)

**Pattern:** Step indicator + navigation buttons + step-specific components.

**Applied:**
- `StitchingPage.tsx` — orchestrates steps
- `PlanSelectionStep.tsx` — step 1 component
- Canvas editor — step 2 component

**Benefit:** Familiar UX, reuses existing WizardShell component.

## Future Enhancements (out of scope for MVP)

1. **Automatic alignment:** Use OpenCV feature matching (SIFT/ORB) to suggest initial positions.
2. **Grid overlay:** Show grid on canvas for precise alignment.
3. **Snap to grid:** Snap plan positions to grid points.
4. **Multi-floor stitching:** Stitch plans across multiple floors (requires 3D stacking).
5. **Real-time collaboration:** Multiple users editing same stitching session (WebSocket).
6. **Export to DXF/DWG:** Export merged vector model to CAD formats.
7. **Undo/redo persistence:** Save history to localStorage, restore on page refresh.
8. **Batch stitching:** Stitch multiple floor sets in one operation (e.g., all floors of a building).
