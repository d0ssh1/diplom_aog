# shift-fix — Design

date: 2026-03-31
status: draft
research: ../../research/Исследуй.md

## Business Context
This feature addresses a geometry alignment bug that affects three related views of the same plan: the cabin/room editor, the vector mask editor, and the emergency-plan preview/build flow. The current system moves the same floor-plan geometry through several representations: browser canvas coordinates, cropped/rotated image space, normalized vector coordinates, saved mask files, reconstruction data, and navigation graph data. If any transformation is applied inconsistently, the user sees shifted rooms, shifted mask overlays, or shifted emergency-plan output.

The goal of this feature is to make the geometric reference frame consistent across the full stack so the same plan occupies the same logical position in every step of the workflow.

## Acceptance Criteria
1. The same floor-plan geometry renders aligned in preprocess, mask preview, manual editor, reconstruction, and 3D/nav outputs for the same source file, crop, and rotation inputs.
2. Crop/rotation/origin handling is defined once and reused consistently across frontend canvas coordinates, backend mask generation, and vectorization/reconstruction data.
3. The bug fix is covered by tests for processing, service, API, and frontend integration paths that are relevant to the alignment flow.

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 06-pipeline-spec.md | Pipeline | Processing pipeline details |
| plan/ | Code | Phase-by-phase implementation plan |
