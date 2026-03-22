# 3D Color API — Design

date: 2026-03-20
status: draft
scope: backend

## Business Context

Currently, wall colors in 3D models are hardcoded to dark grey (#4A4A4A). Users cannot customize the appearance of their 3D reconstructions. This feature adds an optional `wall_color` parameter to the mesh generation API, allowing users to specify custom wall colors (as RGB hex or RGBA array) when building 3D models.

This enables:
- Visual differentiation between different floor plans
- Branding/theming of 3D models
- Better visualization for accessibility (e.g., high-contrast colors)

## Acceptance Criteria

1. API accepts optional `wall_color` parameter in `POST /api/v1/reconstruction/reconstructions`
2. Parameter format: hex string (e.g., `"#FF5733"`) or RGBA array (e.g., `[255, 87, 51, 255]`)
3. Invalid colors rejected with 400 Bad Request
4. Default color (#4A4A4A) used if parameter omitted
5. Color applied to all wall vertices in generated mesh
6. GLB export preserves custom colors
7. All tests passing

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 05-api-contract.md | API | HTTP API contract (exact JSON shapes) |
| plan/ | Code | Phase-by-phase implementation plan |
