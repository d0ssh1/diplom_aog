# Phase 03: Repositories

phase: 03
layer: data access
depends_on: 01, 02
design: ../01-architecture.md §3.1 Backend Components, ../04-testing.md §Repository Coverage

## Goal

CRUD-репозитории для Building, Floor, Section + расширения ReconstructionRepo.

## Context from Phases 01-02

ORM модели готовы (Phase 01), Pydantic модели готовы (Phase 02). Шаблон репозитория — `backend/app/db/repositories/base_repository.py` + `reconstruction_repo.py`.

## Files to Create

### `backend/app/db/repositories/building_repo.py`

**Class `BuildingRepository`:**
- `__init__(session: AsyncSession)`
- `async def create(code: str, name: str, address: Optional[str]) -> Building` — INSERT, обработка IntegrityError → `BuildingDuplicateCodeError`
- `async def get_by_id(id: int) -> Optional[Building]`
- `async def get_by_code(code: str) -> Optional[Building]` — поиск нечувствителен к регистру (`func.upper(Building.code) == code.upper()`)
- `async def list_all() -> list[Building]` — eager load `floors` через `selectinload`
- `async def update(id: int, **fields) -> Building` — partial update
- `async def delete(id: int) -> None` — каскад через ORM relationship

### `backend/app/db/repositories/floor_repo.py`

**Class `FloorRepository`:**
- `async def create(building_id: int, number: int) -> Floor`
- `async def get_by_id(id: int) -> Optional[Floor]` — selectinload `building`
- `async def get_by_building_and_number(building_id: int, number: int) -> Optional[Floor]`
- `async def list_by_building(building_id: int) -> list[Floor]` — order_by Floor.number
- `async def delete(id: int) -> None`
- `async def count_sections(id: int) -> int` — COUNT(*) FROM sections WHERE floor_id=
- `async def count_unbound_reconstructions(id: int) -> int` — COUNT reconstructions с этим floor_id, status=Done, и без записи в sections.reconstruction_id

### `backend/app/db/repositories/section_repo.py`

**Class `SectionRepository`:**
- `async def list_by_floor(floor_id: int) -> list[Section]` — selectinload `reconstruction`
- `async def delete_all_for_floor(floor_id: int) -> None` — `DELETE FROM sections WHERE floor_id=?`
- `async def bulk_create(items: list[dict]) -> list[Section]` — `session.add_all(...)`, items содержат floor_id, number, geometry, section_type, reconstruction_id
- `async def get_by_id(id: int) -> Optional[Section]`
- `async def delete(id: int) -> None`

### `backend/app/db/repositories/reconstruction_repo.py` (modify)

**What changes:**
- Метод `list_unbound_for_floor(floor_id: int) -> list[Reconstruction]` — реконструкции с `floor_id=?` AND `status=3 (Done)` AND нет записи в `sections.reconstruction_id`. Реализация: LEFT OUTER JOIN sections + WHERE sections.id IS NULL.
- Метод `get_with_relations(id: int) -> Optional[Reconstruction]` — selectinload `floor.building` + Section через subquery (Section.reconstruction_id=Reconstruction.id)
- Метод `update_floor_id(id: int, floor_id: int | None) -> Reconstruction` — partial update
- Существующий `list_*` расширить query-param `floor_id: int | None` для фильтра

## Tests to Implement

`backend/tests/repositories/conftest.py` — фабрики `building_factory`, `floor_factory`, `section_factory`, `reconstruction_factory` (sketch в ../04-testing.md §Test Data Fixtures).

`backend/tests/repositories/test_building_repo.py` — 4 теста (см. ../04-testing.md §Repository Coverage):
- test_building_repo_get_by_code_returns_entity
- test_building_repo_get_by_code_missing_returns_none
- test_building_repo_get_by_code_lowercase_returns_entity
- test_building_repo_create_duplicate_code_raises_integrity_error

`backend/tests/repositories/test_floor_repo.py` — 3 теста:
- test_floor_repo_get_by_building_and_number_returns_entity
- test_floor_repo_get_by_building_and_number_missing_returns_none
- test_floor_repo_list_by_building_returns_sorted_by_number

`backend/tests/repositories/test_section_repo.py` — 3 теста:
- test_section_repo_list_by_floor_includes_reconstructions
- test_section_repo_delete_all_for_floor_keeps_other_floors
- test_section_repo_bulk_create_inserts_all

`backend/tests/repositories/test_reconstruction_repo_extensions.py` — 2 теста:
- test_reconstruction_repo_list_unbound_returns_only_unbound
- test_reconstruction_repo_list_unbound_returns_empty

## Files to Modify

### `backend/app/core/exceptions.py`
**What changes:** добавить `BuildingDuplicateCodeError(code: str)`, `BuildingNotFoundError(id: int)`, `FloorNotFoundError(id: int)`, `FloorDuplicateNumberError(building_code: str, number: int)`.

## Verification

- [ ] `python -m pytest backend/tests/repositories/ -v` все 12 тестов зелёные
- [ ] Каждый репозиторий не содержит `print()`, использует `logging` где нужно
- [ ] Нет прямых `await session.execute(text("..."))` с raw SQL в новых файлах (только SQLAlchemy ORM/select)
