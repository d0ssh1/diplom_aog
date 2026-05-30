# Phase 09: floor_assembly router + registration + DI

phase: 09
layer: api/, api/deps.py, api/__init__.py
depends_on: 06, 07, 08
design: ../05-api-contract.md §"Endpoint summary"; ../02-behavior.md

## Goal

Expose UC2–UC5 + assembly read through a new thin router, wire DI, register it.

## Files to Create

### `backend/app/api/floor_assembly.py`
Thin router (mirror `api/floors.py`: `HTTPBearer`, `Depends(get_floor_assembly_service)`,
map service exceptions → HTTPException). Routes (05 §Endpoint summary):
- `PUT /floors/{floor_id}/sections/{section_id}/control-points` → `SectionControlPointsResponse` (404, 409 not-bound, 422 unknown point_id).
- `POST /floors/{floor_id}/solve-transforms` → `SolveTransformsResponse` (404, 409 no sections).
- `GET /floors/{floor_id}/connectors` → `ConnectorsResponse` (404).
- `PUT /floors/{floor_id}/connectors` body `ReplaceConnectorsRequest` → `ConnectorsResponse` (404, 422).
- `POST /floors/{floor_id}/build-mesh` → `BuildFloorPreviewResponse` (404, 409, 422, 500).
- `POST /floors/{floor_id}/confirm-mesh` body `ConfirmMeshRequest` → `ConfirmMeshResponse` (404, 422).
- `GET /floors/{floor_id}/assembly` → `FloorAssemblyResponse` (404).

`prefix=""`, `tags=["floor-assembly"]` (paths already include `/floors/...`).
Routers stay thin — no business logic, just exception→HTTP mapping.

## Files to Modify

### `backend/app/api/deps.py`
```python
async def get_floor_connector_repo(session=Depends(get_db)) -> FloorConnectorRepository:
    return FloorConnectorRepository(session)

async def get_floor_assembly_service(
    floor_repo=Depends(get_floor_repo),
    section_repo=Depends(get_section_repo),
    reconstruction_repo=Depends(get_reconstruction_repo),
    connector_repo=Depends(get_floor_connector_repo),
    storage=Depends(get_file_storage),
) -> FloorAssemblyService:
    return FloorAssemblyService(floor_repo, section_repo, reconstruction_repo, connector_repo, storage)
```

### `backend/app/api/__init__.py`
Import + `router.include_router(floor_assembly_router)`.

## Exception → HTTP mapping (in router)
| Exception | HTTP |
|-----------|------|
| `FloorNotFoundError` | 404 |
| `SectionNotFoundError` | 404 |
| `SectionNotBoundError` | 409 |
| unknown `point_id` (ValueError) | 422 |
| no sections bound (conflict) | 409 |
| no transformed sections | 409 |
| master schema missing | 422 |
| empty mask (`ImageProcessingError`) | 422 |
| `PreviewNotFoundError` | 422 |
| trimesh/export failure | 500 (logged) |

## Verification
- [ ] App boots: `cd backend && python -c "from main import app; print(len(app.routes))"` — the FastAPI app is `backend/main.py` (there is **no** `app/main.py`); no import errors.
- [ ] `GET /api/v1/floors/{id}/assembly` returns 200 on a seeded floor, 404 on missing.
- [ ] OpenAPI shows all 9 new endpoints (2 GET/PUT control-points on the reconstruction router from Phase 06 + 7 here = the 9 in 05 §summary).
- [ ] `flake8` clean.
