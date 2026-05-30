# Phase 05: Repositories

phase: 05
layer: db/repositories
depends_on: 01
design: ../01-architecture.md §"Module Dependency Graph"

## Goal

Add data-access methods for the new columns + the new connector table. Pure data
access — no business logic (mirror existing repos).

## Files to Create

### `backend/app/db/repositories/floor_connector_repo.py`
Mirror `section_repo.py` style (`BaseRepository`, `AsyncSession`).
```python
class FloorConnectorRepository(BaseRepository):
    async def list_by_floor(self, floor_id: int) -> list[FloorConnector]: ...
    async def replace_all_for_floor(self, floor_id: int, items: list[dict]) -> list[FloorConnector]:
        # DELETE WHERE floor_id=? ; add_all(new) ; flush+refresh ; commit
        # ATOMIC — one transaction (see section_repo.delete_all_for_floor + bulk_create)
        ...
```
`replace_all_for_floor` does delete + bulk-insert in a single commit (atomic
replace, mirrors `PUT /sections`). Empty `items` ⇒ just clears.

## Files to Modify

### `backend/app/db/repositories/reconstruction_repo.py`
```python
async def update_control_points(self, reconstruction_id: int, points: list[dict]) -> Optional[Reconstruction]:
    # sets .control_points = points; updated_at; commit; refresh
```
(Read uses existing `get_by_id`, which already eager-loads relations.)

### `backend/app/db/repositories/section_repo.py`
```python
async def update_master_control_points(self, section_id: int, points: list[dict]) -> Optional[Section]: ...
async def update_transform(self, section_id: int, transform: Optional[dict]) -> Optional[Section]: ...
```
`list_by_floor` already eager-loads `reconstruction` → reuse for solve/assembly.
Ensure it also makes `control_points`/`transform` available (plain columns, loaded
with the row).

### `backend/app/db/repositories/floor_repo.py`
Confirm/add:
```python
async def get_by_id(self, floor_id: int) -> Optional[Floor]: ...   # likely exists
async def update_pixels_per_meter(self, floor_id: int, ppm: float) -> Optional[Floor]: ...
async def update_mesh_glb(self, floor_id: int, mesh_file_glb: str) -> Optional[Floor]: ...
```
Read `floor_repo.py` first; reuse existing getters, add only what's missing.

## Business rules
- Repos never import services/api.
- Atomic replace for connectors (no partial state on error).

## Verification
- [ ] `cd backend && pytest tests/db -q` still green.
- [ ] New `backend/tests/db/test_floor_connector_repo.py`: `replace_all_for_floor`
      replaces old rows; empty list clears; cascade on floor delete.
- [ ] `update_control_points` / `update_master_control_points` / `update_transform`
      round-trip JSON unchanged.
- [ ] `flake8` clean.
