# Phase 05: API Routers

phase: 05
layer: HTTP
depends_on: 02, 04
design: ../05-api-contract.md, ../02-behavior.md (sequence-диаграммы), ../04-testing.md §API Coverage

## Goal

REST API endpoints. Тонкие роутеры: validate → call service → return response.

## Context from Phases 02, 04

Сервисы готовы (`BuildingService`, `FloorService`, `SectionService`, `ReconstructionService`); deps в `api/deps.py`. Pydantic Request/Response готовы. Кастомные исключения мапятся на HTTPException.

## Files to Create

### `backend/app/api/buildings.py`

```python
router = APIRouter(prefix="/api/v1/buildings", tags=["buildings"])

@router.post("", response_model=BuildingResponse, status_code=201)
async def create_building(
    req: BuildingCreateRequest,
    service: BuildingService = Depends(get_building_service),
    _admin = Depends(get_current_admin_user),
):
    try:
        return await service.create_building(req)
    except BuildingDuplicateCodeError as e:
        raise HTTPException(409, f"Building with code '{e.code}' already exists")

@router.get("")
async def list_buildings(
    published: bool = False,
    request: Request = ...,
    db: AsyncSession = Depends(get_db),
):
    if published:
        # ADR-18: требует логин-обязательной user-роли
        user = await get_current_user(request, db)  # auth, but no admin check
        return await get_building_service(db).list_published()
    user = await get_current_admin_user(...)
    return await get_building_service(db).list_admin()

# GET /{id}, PATCH /{id}, DELETE /{id} — admin only, стандартный шаблон
```

**Endpoints:**
- POST `""` 201 — create
- GET `""` 200 — admin (full) или `?published=true` user-auth (denormalized)
- GET `"/{id}"` 200 — детали (admin)
- PATCH `"/{id}"` 200 — partial update (admin; не принимает code)
- DELETE `"/{id}"` 204 — каскад (admin)

**Маппинг ошибок:** `BuildingNotFoundError` → 404; `BuildingDuplicateCodeError` → 409; Pydantic ValidationError → авто 422.

### `backend/app/api/floors.py`

```python
router = APIRouter(prefix="/api/v1", tags=["floors"])

@router.post("/buildings/{building_id}/floors", response_model=FloorResponse, status_code=201)
@router.get("/buildings/{building_id}/floors")
@router.get("/floors/{id}")
@router.delete("/floors/{id}", status_code=204)
```

Все требуют admin. Errors: `BuildingNotFoundError` 404, `FloorNotFoundError` 404, `FloorDuplicateNumberError` 409.

### `backend/app/api/sections.py`

```python
router = APIRouter(prefix="/api/v1", tags=["sections"])

@router.get("/floors/{floor_id}/sections", response_model=list[SectionResponse])
@router.put("/floors/{floor_id}/sections", response_model=list[SectionResponse])
@router.delete("/sections/{id}", status_code=204)
```

Все admin. Errors: `FloorNotFoundError` 404, `SectionValidationError` 422.

### `backend/app/api/floor_schema.py` (НОВЫЙ — endpoints для редактора отсеков шагов 1-3)

```python
router = APIRouter(prefix="/api/v1", tags=["floor-schema"])

@router.put("/floors/{floor_id}/schema", response_model=FloorWithSchemaResponse)
async def update_schema(
    floor_id: int,
    req: FloorSchemaUpdateRequest,
    service: FloorSchemaService = Depends(get_floor_schema_service),
    _admin = Depends(get_current_admin_user),
):
    # set schema_image_id + optional crop_bbox
    await service.upload_schema(floor_id, req.schema_image_id)
    if req.schema_crop_bbox:
        await service.update_crop(floor_id, req.schema_crop_bbox)
    return await get_floor_service(...).get_by_id(floor_id)

@router.post("/floors/{floor_id}/extract-walls")
async def extract_walls(floor_id: int, service = Depends(...), _admin = ...):
    polygons = await service.extract_walls(floor_id)
    return {"wall_polygons": polygons}

@router.put("/floors/{floor_id}/walls")
async def update_walls(floor_id: int, req: FloorWallsUpdateRequest, ...):
    await service.update_walls(floor_id, req.wall_polygons)
    return {"wall_polygons": req.wall_polygons}
```

Все admin. Errors: 404 floor; 422 invalid image; 500 CV failure.

## Files to Modify

### `backend/app/api/reconstruction.py`

**What changes:**
- Изменить сигнатуру `PUT /reconstructions/{id}/save` — принимать `SaveReconstructionRequest` с обязательным `floor_id: int` (см. Phase 02). Маппинг 404 на `FloorNotFoundError`. Удалить старые поля building_id/floor_number.
- Добавить `PATCH /reconstructions/{id}` — принимает `ReconstructionPatchRequest` (только floor_id). Использует `service.patch_floor`. Auth: admin.
- Изменить `GET /reconstructions` — добавить query params `floor_id`, `unbound`. Удалить deprecated `building_id`, `floor_number`.
- Изменить `GET /reconstructions/{id}` — расширенный response (Phase 02), вызов `service.get_by_id` (через `repo.get_with_relations`).

### `backend/app/api/__init__.py`

**What changes:** регистрация четырёх новых роутеров:
```python
api_router.include_router(buildings.router)
api_router.include_router(floors.router)
api_router.include_router(sections.router)
api_router.include_router(floor_schema.router)
```

## Tests to Implement

Каждый файл `backend/tests/api/test_*_api.py` использует `httpx.AsyncClient` + admin/user JWT-фикстуры (паттерн в `backend/tests/conftest.py`).

`backend/tests/api/test_buildings_api.py` — 14 тестов (см. ../04-testing.md §API Coverage):
- test_create_building_valid_returns_201
- test_create_building_duplicate_code_returns_409
- test_create_building_invalid_code_returns_422
- test_create_building_non_admin_returns_403
- test_list_buildings_admin_returns_all
- test_list_buildings_published_filter_returns_only_complete
- test_list_buildings_published_no_auth_required → переименовать в test_list_buildings_published_requires_user_auth (ADR-18)
- test_get_building_returns_full_payload
- test_get_building_missing_returns_404
- test_patch_building_name_returns_updated
- test_patch_building_code_field_rejected
- test_delete_building_cascades_to_floors_and_sections

`backend/tests/api/test_floors_api.py` — 7 тестов:
- test_create_floor_valid_returns_201
- test_create_floor_missing_building_returns_404
- test_create_floor_duplicate_number_returns_409
- test_list_floors_returns_sorted_by_number
- test_list_floors_missing_building_returns_404
- test_get_floor_returns_with_building
- test_get_floor_missing_returns_404
- test_delete_floor_cascades_to_sections

`backend/tests/api/test_sections_api.py` — 6 тестов:
- test_list_sections_returns_all_with_reconstructions
- test_replace_sections_valid_returns_200
- test_replace_sections_duplicate_number_returns_422
- test_replace_sections_reconstruction_already_used_returns_422 (ADR-30 — заменяет foreign test)
- test_replace_sections_missing_floor_returns_404
- test_delete_section_keeps_reconstruction_unbound

`backend/tests/api/test_floor_schema_api.py` — 8 тестов (НОВЫЙ файл):
- test_upload_floor_schema_returns_200
- test_upload_floor_schema_missing_floor_returns_404
- test_upload_floor_schema_invalid_image_id_returns_422
- test_extract_walls_returns_polygons
- test_extract_walls_no_schema_returns_422
- test_extract_walls_missing_floor_returns_404
- test_update_walls_manual_returns_200
- test_update_walls_missing_floor_returns_404

`backend/tests/api/test_reconstruction_save_api.py` (modify or create) — 5 тестов:
- test_patch_reconstruction_floor_id_returns_200
- test_patch_reconstruction_missing_floor_returns_404
- test_save_reconstruction_with_floor_id_returns_200
- test_save_reconstruction_missing_floor_id_returns_404
- test_save_reconstruction_no_floor_id_returns_422
- test_list_reconstructions_unbound_filter_returns_only_unbound
- test_get_reconstruction_includes_floor_and_section_info

## Verification

- [ ] `python -m pytest backend/tests/api/ -v` все ~33 API-теста зелёные
- [ ] Роутеры не содержат бизнес-логики (только validate → service.method → return)
- [ ] OpenAPI схема: `curl /docs` показывает новые endpoints с правильными request/response shapes
- [ ] Manual: `curl -X POST /api/v1/buildings -H "Authorization: Bearer <admin>" -d '{"code":"D","name":"Корпус D"}'` → 201
- [ ] Manual: `curl /api/v1/buildings?published=true` без auth → 401
- [ ] Manual: тот же запрос с user JWT → 200
