# Vectorization Pipeline — Design

date: 2026-03-14
status: draft
research: ../../research/vectorization-pipeline.md
ticket: ../../../tickets/01-smart-vectorization.md

## Business Context

The current reconstruction pipeline uses basic image processing (simple Otsu binarization + findContours) that captures everything indiscriminately: text, legends, colored evacuation arrows, symbols, and mini-plans. This creates noisy 3D models and blocks downstream features.

The vectorization-pipeline feature integrates existing but unused `BinarizationService` and `ContourService` classes into an 8-step intelligent pipeline that:
1. Removes colored elements (green arrows, red symbols) before binarization
2. Auto-detects building boundaries and suggests crop
3. Applies adaptive binarization (Otsu for scans, adaptive for phone photos)
4. Detects and removes text via OCR, extracting room numbers
5. Classifies structural elements: walls, rooms, corridors, doors
6. Computes wall thickness and scale factor (pixels→meters)
7. Produces structured `VectorizationResult` with walls, rooms, doors, text blocks

This structured output enables 5 downstream features: floor-editor (room editing), 3d-builder (clean meshes), pathfinding-astar (navigation graph), building-assembly (section stitching), vector-editor (manual polygon editing).

## Acceptance Criteria

1. Color filtering removes green/red elements before binarization (HSV saturation mask + inpaint)
2. Auto-crop detects building boundary, excludes legends/mini-plans, suggests crop to user
3. Adaptive binarization: histogram analysis chooses Otsu (bimodal) or adaptive (uneven lighting)
4. Text detection via pytesseract: extracts room numbers matching `^\d{3,4}[А-Яа-яA-Za-z]?$` or `^[A-ZА-Я]\d{3,4}$`
5. Room numbers assigned to rooms by geometric containment (text center inside room polygon)
6. Plans without room numbers work correctly (room.name remains empty, admin fills later in floor-editor)
7. Room detection via mask inversion: connected components on inverted mask = rooms
8. Corridor classification: aspect ratio > 3:1 → corridor, else → room
9. Door detection: dilate walls, find gaps between adjacent rooms
10. Wall thickness computed via distance transform (median value)
11. Scale factor `estimated_pixels_per_meter` computed from wall thickness (standard wall ≈ 0.2m)
12. All coordinates normalized to [0, 1] relative to cropped area
13. `VectorizationResult` contains walls + rooms + doors + text_blocks + metadata (image sizes, crop rect, rotation angle, scale)
14. `VectorizationResult` persisted to DB as JSON in `Reconstruction.vectorization_data` column
15. New API endpoints: `GET /reconstructions/{id}/vectors`, `PUT /reconstructions/{id}/vectors`
16. `mesh_builder` accepts `VectorizationResult` (not raw contours)
17. All existing tests pass (36 tests from refactor-core)
18. New tests ≥ 10: color_filter, auto_crop, adaptive_binarization, room_detection, corridor_classification, door_detection, text_detection, normalization, empty_image, full_pipeline
19. `processing/` remains pure (no imports from api/db/services)

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 06-pipeline-spec.md | Pipeline | 8-step processing pipeline details |
| plan/ | Code | Phase-by-phase implementation plan |
