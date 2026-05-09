# Phase 04: Services

phase: 04
layer: business logic
depends_on: 03
design: ../01-architecture.md §3.1, ../02-behavior.md (все UC), ../04-testing.md §Service Coverage

## Goal

Сервисный слой — оркестрация репозиториев, валидация, иерархическая published-фильтрация, replace-стратегия секций.

## Context from Phase 03

Доступны `BuildingRepository`, `FloorRepository`, `SectionRepository`, `ReconstructionRepository` (расширенный). Кастомные исключения в `core/exceptions.py`.

## Files to Create

### `backend/app/services/building_service.py`

**Class `BuildingService`:**
- `__init__(self, building_repo, floor_repo, section_repo, reconstruction_repo)` — DI всех репозиториев (Phase 05 пропишет deps)
- `async def create_building(req: BuildingCreateRequest) -> Building`
  - `existing = await building_repo.get_by_code(req.code)` → если есть, raise `BuildingDuplicateCodeError`
  - return `await building_repo.create(req.code.upper(), req.name, req.address)`
- `async def list_admin() -> list[BuildingResponse]` — все, с `floors_count` и `published` (вычисляется через `_is_published`)
- `async def list_published() -> list[BuildingPublicResponse]` — иерархическая фильтрация (ADR-21):
  - для каждого Building: floors с ≥1 секцией, у которой reconstruction.status=Done
  - в каждом floor: только такие секции
  - Building попадает в результат только если ≥1 такой floor
  - mesh_url_glb = `/uploads/{reconstruction.mesh_file_id_glb}` (или используя существующий file_storage адаптер)
- `async def get_by_id(id: int) -> BuildingDetailResponse` — 404 если нет
- `async def update(id: int, req: BuildingUpdateRequest) -> Building` — partial
- `async def delete(id: int) -> None` — каскад через ORM
- `_is_published(building) -> bool` — приватный helper: ≥1 published section

### `backend/app/services/floor_service.py`

**Class `FloorService`:**
- `async def create_floor(building_id: int, req: FloorCreateRequest) -> FloorResponse`
  - `building_repo.get_by_id` → 404 если нет
  - `floor_repo.get_by_building_and_number` → 409 если есть
  - `floor_repo.create`
- `async def list_by_building(building_id: int) -> list[FloorResponse]` — 404 если корпуса нет
- `async def get_by_id(id: int) -> FloorWithBuildingResponse` — 404 если нет
- `async def delete(id: int) -> None`

### `backend/app/services/section_service.py`

**Class `SectionService`:**
- `async def list_by_floor(floor_id: int) -> list[SectionResponse]` — 404 если floor не найден
- `async def replace_sections(floor_id: int, req: ReplaceSectionsRequest) -> list[SectionResponse]`:
  - Validate floor exists (404)
  - Validate payload (ADR-30 — допускается reconstruction любого этажа):
    - дубль `number` → SectionValidationError
    - дубль `reconstruction_id` (где не null) → SectionValidationError
    - для каждого `reconstruction_id`: должен существовать в БД (не требуется чтобы `floor_id` совпадал)
  - **Внутри транзакции:**
    - `delete_all_for_floor(floor_id)`
    - `bulk_create(items)` — items с floor_id из path
  - return `list_by_floor(floor_id)`
- `async def delete_section(id: int) -> None`
- `_validate_payload(sections, reconstruction_repo)` — приватный

### `backend/app/services/floor_schema_service.py` (НОВЫЙ — ADR-31, 06-pipeline-spec.md)

**Class `FloorSchemaService`:**
- `__init__(self, floor_repo, file_storage, processing_pipeline)` — DI; `processing_pipeline` — обёртка над `processing/` функциями
- `async def upload_schema(floor_id: int, image_id: str) -> None` — set `floor.schema_image_id`; validate file_id exists (422 иначе)
- `async def update_crop(floor_id: int, bbox: CropBboxModel) -> None` — set `floor.schema_crop_bbox`
- `async def extract_walls(floor_id: int) -> list[Polygon]`:
  - load `floor.schema_image_id`, `floor.schema_crop_bbox` — если image_id None → `FloorSchemaError` (422)
  - load image bytes из file_storage
  - call existing CV (см. 06-pipeline-spec.md): `preprocess → binarize → contours → vectorize` с применением crop+rotation
  - normalize coords к cropped image
  - `floor.wall_polygons = polygons` + commit
  - return polygons
- `async def update_walls(floor_id: int, polygons: list[Polygon]) -> None` — manual save после ручной правки

### `backend/app/services/reconstruction_service.py` (modify if exists, создать иначе)

**What changes:**
- Метод `patch_floor(id: int, floor_id: int) -> ReconstructionResponse` — для PATCH endpoint (ADR-24, новый):
  - validate floor exists (404)
  - `repo.update_floor_id(id, floor_id)`
  - return enriched response
- Метод `save(id: int, name: str, floor_id: int) -> ReconstructionResponse` — заменяет старую логику с building_id+floor_number:
  - validate floor exists (404)
  - update name + floor_id
  - return enriched response (через `repo.get_with_relations`)
- Метод `list(filters: dict) -> list[ReconstructionListItem]` — поддержка `floor_id`, `unbound`, `status`. `unbound=True` → только status=Done без section
- Метод `get_by_id(id: int) -> ReconstructionResponse` — расширенный response (см. Phase 02)

**Note:** если `reconstruction_service.py` отсутствует или сильно отличается от стандарта — НЕ переписывать целиком. Только добавить нужные методы рядом с существующими, не ломая поведение wizard'а на других шагах.

## Tests to Implement

`backend/tests/services/test_building_service.py` — 5 тестов:
- test_create_building_valid_data_succeeds
- test_create_building_duplicate_code_raises_conflict
- test_create_building_lowercase_code_normalized_to_upper
- test_list_published_includes_complete_building
- test_list_published_excludes_empty_building
- test_list_published_excludes_floor_without_sections (NEW из самопроверки)
- test_list_published_excludes_section_with_pending_reconstruction (NEW)

`backend/tests/services/test_floor_service.py` — 2 теста:
- test_create_floor_missing_building_raises_not_found
- test_create_floor_duplicate_number_raises_conflict

`backend/tests/services/test_section_service.py` — 7 тестов:
- test_replace_sections_valid_payload_writes_all
- test_replace_sections_duplicate_number_raises_validation
- test_replace_sections_allows_cross_floor_reconstruction (ADR-30 — заменяет foreign_reconstruction тест)
- test_replace_sections_duplicate_reconstruction_raises_validation
- test_replace_sections_missing_floor_raises_not_found
- test_replace_sections_transactional_rollback_on_error
- test_replace_sections_empty_payload_clears_all

`backend/tests/services/test_floor_schema_service.py` — 5 тестов:
- test_upload_schema_sets_image_id
- test_update_crop_persists_bbox
- test_extract_walls_calls_cv_and_saves_polygons (mock processing/, проверяем что вызвано и что сохранено)
- test_extract_walls_no_image_raises_validation
- test_update_walls_persists_manual_polygons

`backend/tests/services/test_reconstruction_service_extensions.py` — 1 тест:
- test_list_unbound_excludes_non_done_reconstructions

Шаблон тестов: моки репозиториев через `pytest-mock` (см. ../04-testing.md §Test Rules).

## Files to Modify

### `backend/app/api/deps.py`
**What changes:** добавить `get_building_service`, `get_floor_service`, `get_section_service` (FastAPI dependency factories с инъекцией репозиториев из `get_db`).

### `backend/app/core/exceptions.py`
**What changes:** добавить `SectionValidationError(detail: str)` (для 422 в роутере).

## Verification

- [ ] `python -m pytest backend/tests/services/ -v` все 17 service-тестов зелёные
- [ ] Сервисы НЕ импортируют ничего из `app/api/`
- [ ] Сервисы НЕ импортируют ничего из `app/processing/` (фича не CV)
- [ ] Все методы async; работа с session через DI
