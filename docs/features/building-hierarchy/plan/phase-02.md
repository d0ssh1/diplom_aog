# Phase 02: Pydantic Models

phase: 02
layer: domain (API contracts)
depends_on: 01
design: ../05-api-contract.md §Pydantic Schemas

## Goal

Создать Pydantic v2 модели для Building, Floor, Section: Request/Response пары + общие domain-типы (Geometry).

## Context from Phase 01

Существуют ORM `Building`, `Floor`, `Section`, `Reconstruction` со всеми полями из 01-architecture §3.3. Pydantic должен быть совместим с ORM (`from_attributes=True`).

## Files to Create

### `backend/app/models/buildings.py`
**Purpose:** Pydantic для Building API.

**Implementation details:**
- `BuildingCreateRequest` — code, name, address; field_validator `_upper` нормализует code в верхний регистр (см. ../05-api-contract.md §POST /buildings)
- `BuildingUpdateRequest` — name, address (без code, ADR-3)
- `BuildingResponse` — id, code, name, address, created_at, floors_count, published; `model_config = ConfigDict(from_attributes=True)`
- `BuildingDetailResponse` — extends BuildingResponse + `floors: list[FloorBrief]`
- `BuildingPublicResponse` — id, code, name, `floors: list[FloorPublic]` (forward ref)
- `BuildingPublic`, `FloorPublic`, `SectionPublic` — публичный денормализованный формат с mesh_url_glb (см. 05 §GET /buildings?published=true response)

### `backend/app/models/floors.py`
**Purpose:** Pydantic для Floor.

**Implementation details:**
- `FloorCreateRequest` — number (ge=0, le=50)
- `FloorResponse` — id, building_id, number, sections_count, reconstructions_unbound_count, created_at
- `FloorBrief` — id, number (для вложения в BuildingDetailResponse)
- `FloorWithBuildingResponse` — id, number, sections_count, reconstructions_unbound_count, created_at, `building: BuildingBrief` (для GET /floors/{id})
- `BuildingBrief` — id, code, name (для вложения)

### `backend/app/models/sections.py`
**Purpose:** Pydantic для Section + Geometry discriminated union.

**Implementation details:**
- `GeometryRect`, `GeometryPolygon` — discriminated union по `type` (см. 05-api §Pydantic Schemas)
- `Geometry = Annotated[Union[GeometryRect, GeometryPolygon], Field(discriminator='type')]`
- `SectionPayloadItem` — number (ge=1), geometry, section_type (default=1, ge=1, le=10), reconstruction_id (Optional)
- `ReplaceSectionsRequest` — sections: list[SectionPayloadItem] (max_length=50)
- `SectionResponse` — id, floor_id, number, geometry, section_type, reconstruction (ReconstructionBrief | None), created_at, updated_at
- `ReconstructionBrief` (если ещё не существует) — id, name, status, preview_url

### `backend/app/models/reconstruction.py` (modify if exists)
**What changes:**
- Расширить `ReconstructionResponse` полями `floor: FloorWithBuildingResponse | None`, `section: SectionBrief | None` (где SectionBrief = id+number)
- Расширить `ReconstructionListItem` полями `floor: FloorPublicBrief | None`, `section: SectionBrief | None`
- Добавить `ReconstructionPatchRequest` — `floor_id: int` (для PATCH /reconstructions/{id})
- Изменить `SaveReconstructionRequest` — заменить `building_id: str | None`, `floor_number: int | None` на `floor_id: int` (обязательное)

## Verification

- [ ] `python -c "from app.models.buildings import BuildingCreateRequest, BuildingResponse"` без ошибок
- [ ] `python -c "from app.models.sections import ReplaceSectionsRequest, GeometryRect, GeometryPolygon"`
- [ ] Manual: `BuildingCreateRequest(code='d', name='X')` нормализует code в `'D'`
- [ ] Manual: `GeometryPolygon(type='polygon', points=[[0,0]])` → ValidationError (нужно ≥3 точки)
- [ ] Manual: discriminated union — `Geometry.model_validate({"type": "rect", "points": [[0,0],[1,1]]})` возвращает `GeometryRect`
- [ ] `mypy backend/app/models/` без ошибок (если конфигурирован)
