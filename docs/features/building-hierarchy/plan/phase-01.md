# Phase 01: DB Migration + ORM

phase: 01
layer: database
depends_on: none
design: ../README.md, ../01-architecture.md §3.3 Domain Model, ../03-decisions.md (R-10 ORDER)

## Goal

Подготовить базу данных и ORM для иерархии Building→Floor→Section→Reconstruction. Безопасно дропнуть legacy-данные и создать новую схему с FK.

## Files to Create

### `backend/alembic/versions/XXXX_building_hierarchy.py`
**Purpose:** Миграция с явным порядком, чтобы FK не блокировали drop.

**Implementation:**
- `upgrade()`:
  1. `op.execute("DELETE FROM floor_transitions")`
  2. `op.execute("DELETE FROM rooms")`
  3. `op.execute("DELETE FROM reconstructions")`
  4. `op.drop_column('floors', 'reconstruction_id')` (если существует)
  5. `op.add_column('floors', Column('schema_image_id', String(36), ForeignKey('uploaded_files.id', ondelete='SET NULL'), nullable=True))`
  6. `op.add_column('floors', Column('schema_crop_bbox', JSON, nullable=True))`
  7. `op.add_column('floors', Column('wall_polygons', JSON, nullable=True))`
  8. `op.add_column('buildings', Column('code', String(5), nullable=True))` затем `op.execute("UPDATE buildings SET code = UPPER(SUBSTR(name,1,1))")` для существующих → `op.alter_column('buildings', 'code', nullable=False)` + `op.create_unique_constraint('uq_buildings_code', 'buildings', ['code'])`
  9. На `reconstructions`: drop `building_id`, drop `floor_number`, add `floor_id` FK на `floors.id` (`ON DELETE SET NULL`), nullable
  10. `op.create_table('sections', ...)` — id, floor_id (FK CASCADE), number, geometry JSON (4-точечный полигон), reconstruction_id (FK SET NULL UNIQUE), section_type INT default 1, created_at, updated_at; UNIQUE(floor_id, number)
- `downgrade()`: реверс (drop sections, drop новые колонки floors, восстановить старые колонки `building_id`/`floor_number`)

**Reference:** `backend/alembic/versions/d9e0f1g2h3i4_add_building_floor_to_reconstructions.py` для синтаксиса op.add_column/SQLite batch_alter

### `backend/app/db/models/section.py`
**Purpose:** ORM модель Section.

**Implementation:**
- Class `Section(Base)`, `__tablename__ = "sections"`
- Поля: `id`, `floor_id` FK→floors.id ondelete=CASCADE, `number` int, `geometry` JSON (sqlalchemy `JSON` — 4-точечный полигон), `reconstruction_id` FK→reconstructions.id ondelete=SET_NULL, UNIQUE; `section_type` int default 1; `created_at`, `updated_at`
- `__table_args__ = (UniqueConstraint('floor_id', 'number', name='uq_section_floor_number'),)`
- Relationships: `floor: Mapped[Floor]`, `reconstruction: Mapped[Optional[Reconstruction]]`
- **НЕ добавляем** поля `description`, `color` (ADR-29)

## Files to Modify

### `backend/app/db/models/building.py`
**What changes:**
- В `Building`: добавить `code: Mapped[str] = mapped_column(String(5), unique=True, nullable=False)`
- Активировать `floors = relationship("Floor", back_populates="building", cascade="all, delete-orphan")`
- В `Floor`: удалить `reconstruction_id` колонку и комментарий
- В `Floor`: добавить **новые поля (ADR-26, 27)**:
  - `schema_image_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True)`
  - `schema_crop_bbox: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)`
  - `wall_polygons: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)`
- Активировать `building = relationship("Building", back_populates="floors")`
- Добавить `sections = relationship("Section", back_populates="floor", cascade="all, delete-orphan", order_by="Section.number")`
- Добавить `schema_image = relationship("UploadedFile", foreign_keys=[schema_image_id])`

### `backend/app/db/models/reconstruction.py`
**What changes:**
- В `Reconstruction`: удалить `building_id: Mapped[Optional[str]]` и `floor_number: Mapped[Optional[int]]`
- Добавить `floor_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)`
- Добавить relationship `floor: Mapped[Optional[Floor]] = relationship("Floor")` (one-way, без back_populates, чтобы не плодить связи)
- Добавить relationship `section: Mapped[Optional[Section]] = relationship("Section", back_populates="reconstruction", uselist=False)`

### `backend/app/db/models/__init__.py`
**What changes:** экспорт `Section`

## Tests to Implement

`backend/tests/migrations/test_building_hierarchy_migration.py` (NEW dir if absent):
- `test_migration_drops_old_reconstructions_columns` — после upgrade колонок `building_id`(str) и `floor_number` нет
- `test_migration_creates_section_table_with_constraints` — UNIQUE(floor_id,number); UNIQUE(reconstruction_id)
- `test_migration_drops_floor_reconstruction_id` — колонки нет
- `test_migration_adds_building_code_unique` — UNIQUE constraint
- `test_migration_drops_floor_transitions` — таблица очищена

Тесты используют test-DB и Alembic command API (см. existing tests if any) — иначе sketch:
```python
from alembic.command import upgrade
from alembic.config import Config
def test_migration_creates_section_table(alembic_engine):
    cfg = Config("alembic.ini"); cfg.attributes["connection"] = alembic_engine.connect()
    upgrade(cfg, "head")
    inspector = inspect(alembic_engine)
    assert "sections" in inspector.get_table_names()
    cols = {c["name"] for c in inspector.get_columns("sections")}
    assert {"id","floor_id","number","geometry","reconstruction_id","section_type"}.issubset(cols)
```

## Verification

- [ ] `cd backend && alembic upgrade head` без ошибок
- [ ] `cd backend && alembic downgrade -1` без ошибок (rollback)
- [ ] `cd backend && alembic upgrade head` снова — идемпотентно
- [ ] `python -m pytest backend/tests/migrations/ -v` зелёный
- [ ] `python -c "from app.db.models import Section, Building, Floor, Reconstruction; print('ok')"` без ImportError
- [ ] SQLite: `sqlite3 backend/dev.db ".schema sections"` показывает FK + UNIQUE
