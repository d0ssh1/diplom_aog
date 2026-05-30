# Phase 06: Section-local control points (UC1)

phase: 06
layer: services/, api/reconstruction.py
depends_on: 02, 05
design: ../05-api-contract.md §UC1; ../02-behavior.md §UC1

## Goal

Let the operator save/read section-local control points on a reconstruction. A
small, self-contained vertical slice that proves the model/repo/router wiring
before the bigger `FloorAssemblyService`.

## Files to Modify

### `backend/app/services/reconstruction_service.py`
Add two methods (extend the existing service; read it first for its DI shape —
it has `repo` + `storage`):
```python
async def get_control_points(self, reconstruction_id: int) -> ControlPointsResponse:
    # get_by_id → 404 if None
    # image_size_cropped from vectorization_data (parse JSON; None if absent)
    # points from reconstruction.control_points or []
async def save_control_points(self, reconstruction_id: int, points: list[ControlPoint]) -> ControlPointsResponse:
    # validate: ids unique (raise → 422), len<=MAX_CONTROL_POINTS
    # repo.update_control_points([p.model_dump() for p in points]) → 404 if None
    # return same shape as GET
```
Reads `vectorization_data` **read-only** (only to echo `image_size_cropped`); never
writes it.

### `backend/app/api/reconstruction.py`
Add two thin endpoints (mirror existing routes; reuse `get_reconstruction_service`):
- `GET /reconstruction/reconstructions/{id}/control-points` → `ControlPointsResponse` (404).
- `PUT /reconstruction/reconstructions/{id}/control-points` body `SaveControlPointsRequest` → `ControlPointsResponse` (404, 422 dup id, 422 >max, 422 coord).

(Use the path param name `{id}` — every existing route in `api/reconstruction.py`
uses `{id}`, not `{reconstruction_id}`; match that convention.)

Map service exceptions → HTTPException (404/422). Validation of coord range +
list length is handled by Pydantic on the request model (Phase 02); duplicate-id
check raises a clear 422 with `Duplicate control-point id: cp-1`.

## Business rules
- Empty / 1- / 2-point lists are **accepted** (200) — solvability is checked later
  at solve time (ADR-16). Do NOT reject <3 here.
- Router stays thin: validate → service → return.

## Verification
- [ ] `cd backend && pytest tests/api/test_reconstruction.py -q` still green.
- [ ] Manual: PUT 3 points → GET returns them with `image_size_cropped` echoed.
- [ ] PUT duplicate id → 422; PUT 21 points → 422; PUT x=1.5 → 422.
- [ ] `flake8` clean.
