# Code Plan: 3D Color API

date: 2026-03-20
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — Build from pure functions upward:
1. Color utilities (pure, no dependencies)
2. Mesh generator integration (pure, uses color utils)
3. Service layer (orchestration, uses color utils + mesh gen)
4. API layer (thin router, uses service)

This order ensures each layer is testable in isolation before integration.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Color parsing & validation | Processing | — | ☐ |
| 2 | Mesh generator integration | Processing | Phase 1 | ☐ |
| 3 | Service layer update | Service | Phase 1, 2 | ☐ |
| 4 | API request model | Models | — | ☐ |
| 5 | API endpoint update | API | Phase 1, 3, 4 | ☐ |
| 6 | Tests | All layers | Phase 1-5 | ☐ |

## File Map

### New Files
- `backend/app/processing/color_utils.py` — Color parsing and validation functions
- `backend/tests/processing/test_color_utils.py` — Color utils tests
- `backend/tests/services/test_reconstruction_service_color.py` — Service tests with color
- `backend/tests/api/test_reconstruction_api_color.py` — API endpoint tests with color

### Modified Files
- `backend/app/models/reconstruction.py` — Add `wall_color` field to `CalculateMeshRequest`
- `backend/app/processing/mesh_builder.py` — Accept `wall_color` parameter in `build_mesh_from_mask()`
- `backend/app/processing/mesh_generator.py` — Accept `wall_color` parameter in mesh generation functions
- `backend/app/services/reconstruction_service.py` — Pass `wall_color` to mesh builder
- `backend/app/api/reconstruction.py` — Extract `wall_color` from request, pass to service

## Success Criteria
- [ ] All 19 tests passing (see 04-testing.md)
- [ ] Build clean (`python -m py_compile` all files)
- [ ] Lint clean (`flake8` if configured)
- [ ] API contract matches implementation (05-api-contract.md)
- [ ] All acceptance criteria from README.md met
- [ ] Backward compatible (requests without `wall_color` work unchanged)
