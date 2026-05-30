# Phase 01: DB schema + migration

phase: 01
layer: db/models, alembic
depends_on: none
design: ../01-architecture.md §"Data Model"

## Goal

Add the new columns + the new `floor_connectors` table that hold control points,
the solved transform, floor metric scale, the assembled GLB path, and connectors.
No business logic — schema only.

## Files to Modify

### `backend/app/db/models/reconstruction.py`
Add to `Reconstruction`:
```python
from sqlalchemy import JSON
# ...
control_points: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
# [{"id":"cp-1","x":0.12,"y":0.34}, ...] section-local [0,1]
```

### `backend/app/db/models/section.py`
Add to `Section`:
```python
control_points: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
# [{"point_id":"cp-1","x":0.41,"y":0.22}, ...] master [0,1]
transform: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
# {"scale","tx","ty","residual_rms_px","n_points","solved_at"} px-space
```

### `backend/app/db/models/building.py`
**Import fix (CRITICAL):** `building.py` currently imports
`from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, UniqueConstraint`
— it does **NOT** import `Float`. Merge `Float` into that existing import line (do
not leave `Float` unimported, or the module raises `NameError: Float` at import and
the app + Alembic + every test fail to boot). `String` is already imported, so
`mesh_file_glb String(512)` needs nothing new.
Add to `Floor`:
```python
# add Float to the EXISTING `from sqlalchemy import ...` line (not a duplicate import)
pixels_per_meter: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
mesh_file_glb: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
# relationship
connectors: Mapped[List["FloorConnector"]] = relationship(
    "FloorConnector", back_populates="floor",
    cascade="all, delete-orphan", order_by="FloorConnector.id",
)
```
Add `from app.db.models.floor_connector import FloorConnector` under `TYPE_CHECKING`.

## Files to Create

### `backend/app/db/models/floor_connector.py`
```python
class FloorConnector(Base):
    __tablename__ = "floor_connectors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    floor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False)
    points: Mapped[list] = mapped_column(JSON, nullable=False)   # [[x,y],...] master [0,1], >=2
    height_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    thickness_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    connects: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # [section_id,...]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    floor: Mapped["Floor"] = relationship("Floor", back_populates="connectors")
```
Register the model in `backend/app/db/models/__init__.py` (mirror existing exports)
so the app runtime sees it. **Note:** `alembic/env.py` imports model modules
*explicitly* (it does NOT import `db/models/__init__.py`), so `__init__.py` alone is
**insufficient** for Alembic to see the table — also add
`from app.db.models.floor_connector import FloorConnector` to `alembic/env.py`.
(The migration below is hand-written, so this only matters if you ever run
autogenerate, but keep `env.py` metadata complete regardless.)

### `backend/alembic/versions/{rev}_floor_stitching.py`
Mirror `f1g2h3i4j5k6_building_hierarchy.py` style (SQLite `batch_alter_table` for
column adds; `op.create_table` for the new table).

- `down_revision = 'a2b3c4d5e6f7'` — this is the **current head** (verified:
  `a2b3c4d5e6f7_cascade_delete_floor_transitions` descends from `f1g2h3i4j5k6`
  and nothing descends from it). Re-run `alembic heads` at implement time in case
  a newer migration landed; there must be exactly one head before you add yours.
- `upgrade()`:
  - `batch_alter_table('reconstructions')` → add `control_points` JSON nullable.
  - `batch_alter_table('sections')` → add `control_points` JSON, `transform` JSON.
  - `batch_alter_table('floors')` → add `pixels_per_meter` Float, `mesh_file_glb` String(512).
  - `op.create_table('floor_connectors', ...)` with FK `floor_id`→`floors.id`
    `ondelete='CASCADE'`, PK `id`, index on `id`.
- `downgrade()`: reverse (drop table, drop columns).

## Business rules / notes
- All new columns nullable (existing rows have no control points yet).
- JSON column type works on both SQLite and PostgreSQL.
- Do NOT touch `vectorization_data`.
- **Dev DB is Postgres, not SQLite (CRITICAL for verification).** `config.py`
  defaults `DATABASE_URL` to `postgresql+asyncpg://…`, and the current head
  `a2b3c4d5e6f7_cascade_delete_floor_transitions` uses
  `op.drop_constraint('…_fkey', type_='foreignkey')` — named FK constraints that
  exist only on Postgres, so the *prior* migration cannot replay on a fresh SQLite
  file. Run the round-trip below against the **actual configured dev DB**, do not
  assume a SQLite file. `env.py` already sets `render_as_batch=True` globally, so the
  `batch_alter_table` column adds in *this* migration are correct on both backends —
  keep using `batch_alter_table` as written.

## Verification
- [ ] `cd backend && alembic upgrade head` succeeds on the **configured dev DB**
      (Postgres per `config.py`), not an assumed SQLite file.
- [ ] `alembic downgrade -1` then `upgrade head` round-trips cleanly.
- [ ] `python -c "from app.db.models.floor_connector import FloorConnector; from app.db.models.building import Floor; from app.db.models.section import Section; print('ok')"`.
- [ ] In a Python shell, create a Floor, append a `FloorConnector`, commit, reload — `floor.connectors` returns it; deleting the floor cascades.
