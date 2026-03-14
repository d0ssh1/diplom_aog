# Phase 4: Pipeline Functions (Steps 7-8)

phase: 4
layer: processing
depends_on: phase-01
design: ../README.md

## Goal

Implement Steps 7-8: room detection (invert mask + connected components), corridor classification, door detection, room number assignment, coordinate normalization, scale computation.

## Context

Phase 1 completed: domain models available.
Phases 2-3 completed: Steps 1-6 implemented.

Add Steps 7-8 to `processing/pipeline.py`.

## Files to Modify

### `backend/app/processing/pipeline.py`

**Add functions:**

1. **room_detect()** — Reference: `../06-pipeline-spec.md` lines 437-469
   - Invert mask: cv2.bitwise_not()
   - Connected components: cv2.connectedComponentsWithStats()
   - Filter by area (min_area=1000, max_area=0.8*image_area)
   - Extract polygon for each component
   - Return List[Room] (pixel coordinates, not normalized yet)

2. **classify_rooms()** — Reference: `../06-pipeline-spec.md` lines 473-487
   - Compute bounding box aspect ratio
   - If aspect_ratio > 3.0 → room_type="corridor"
   - Else → room_type="room"

3. **door_detect()** — Reference: `../06-pipeline-spec.md` lines 491-507
   - Dilate mask (kernel=5x5, iterations=1)
   - Find gaps that close after dilation
   - Find adjacent rooms (distance threshold=0.05 normalized)
   - Return List[Door]

4. **assign_room_numbers()** — Reference: `../06-pipeline-spec.md` lines 511-520
   - For each TextBlock with is_room_number=True
   - Point-in-polygon test (use shapely.geometry.Point, Polygon)
   - Assign Room.name if text center inside room polygon

5. **compute_wall_thickness()** — Reference: `../06-pipeline-spec.md` lines 423-433
   - cv2.distanceTransform(mask, DIST_L2, 5)
   - Return np.median(nonzero values)

6. **compute_scale_factor()** — Reference: `../06-pipeline-spec.md` lines 541-543
   - estimated_pixels_per_meter = wall_thickness_px / 0.2
   - If wall_thickness_px == 0 → return 50.0

7. **normalize_coords()** — Reference: `../06-pipeline-spec.md` lines 537-540
   - Convert all pixel coordinates to [0, 1] relative to image_size
   - For walls, rooms, doors

**Dependencies:**
- shapely library for point-in-polygon test

**Reference:**
- Design: `../06-pipeline-spec.md` Steps 7-8
- Decision: `../03-decisions.md` #8 (room detection via inversion)
- Decision: `../03-decisions.md` #9 (corridor classification)
- Decision: `../03-decisions.md` #10 (door detection)

## Verification

- [ ] `python -m py_compile backend/app/processing/pipeline.py` passes
- [ ] Import test succeeds
- [ ] room_detect() on simple rectangle image returns 1 room
- [ ] classify_rooms() on long narrow room returns room_type="corridor"
- [ ] door_detect() on two rooms with gap returns 1 door
- [ ] assign_room_numbers() assigns name to room containing text
- [ ] compute_wall_thickness() returns reasonable value (>0)
- [ ] normalize_coords() converts pixel coords to [0,1]
