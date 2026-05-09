# Code Plan: Building Hierarchy

date: 2026-05-05
design: ../README.md
status: draft

## Phase Strategy

**Hybrid: Adapter-first → Bottom-up backend → Vertical-slice frontend.**

- Adapter-first для БД: миграция дропает legacy и пересоздаёт таблицы с новой схемой — это единственный возможный путь, т.к. acceptance criterion #2 («старые reconstructions снести»). Без миграции ORM не пройдёт компиляцию импортов в существующих сервисах.
- Bottom-up для backend: ORM → Pydantic → Repos → Services → Routers. Каждая фаза независимо тестируется.
- Vertical-slice для frontend: одна фаза = одна экранная фича (admin building, floor editor, wizard, edit page badge, end-user viewer, route-test adapt). Делается так потому, что страницы независимы; параллельная реализация любых двух не блокирует друг друга после готового бэкенда.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 01 | DB Migration + ORM | Database | — | ☐ |
| 02 | Pydantic models | Domain | 01 | ☐ |
| 03 | Repositories | Data access | 01, 02 | ☐ |
| 04 | Services | Business logic | 03 | ☐ |
| 05 | API Routers | HTTP | 02, 04 | ☐ |
| 06 | Frontend types + API client | FE foundation | 05 | ☐ |
| 07 | AdminBuildingsPage | FE feature | 06 | ☐ |
| 08 | FloorEditorPage + canvas | FE feature | 06 | ☐ |
| 09 | Wizard modifications | FE feature | 06 | ☐ |
| 10 | EditPlanPage badge | FE feature | 06 | ☐ |
| 11 | FloorViewerPage (end-user) | FE feature | 06 | ☐ |
| 12 | RouteTestPage adaptation | FE refactor | 06 | ☐ |

Phases 07–12 могут идти параллельно после 06; для удобства человеческого review исполняются последовательно.

## File Map

### Backend — New
- `backend/alembic/versions/XXXX_building_hierarchy.py` — миграция
- `backend/app/db/models/building.py` — modified (Building.code, Floor.schema_image_id, Floor.schema_crop_bbox, Floor.wall_polygons, drop Floor.reconstruction_id)
- `backend/app/db/models/section.py` — NEW (4-точечный геометрический полигон)
- `backend/app/db/models/reconstruction.py` — modified (floor_id FK; drop building_id, floor_number)
- `backend/app/db/repositories/building_repo.py` — NEW
- `backend/app/db/repositories/floor_repo.py` — NEW (+ методы для schema/walls)
- `backend/app/db/repositories/section_repo.py` — NEW
- `backend/app/db/repositories/reconstruction_repo.py` — modified
- `backend/app/models/buildings.py` — NEW (Pydantic)
- `backend/app/models/floors.py` — NEW (+ CropBboxModel, FloorSchemaUpdateRequest, FloorWallsUpdateRequest, FloorWithSchemaResponse)
- `backend/app/models/sections.py` — NEW (4-точечная SectionGeometry, без description/color)
- `backend/app/services/building_service.py` — NEW
- `backend/app/services/floor_service.py` — NEW
- `backend/app/services/section_service.py` — NEW
- `backend/app/services/floor_schema_service.py` — **NEW** (orchestrator CV pipeline для шага 3, см. 06-pipeline-spec.md)
- `backend/app/services/reconstruction_service.py` — modified
- `backend/app/api/buildings.py` — NEW router
- `backend/app/api/floors.py` — NEW router
- `backend/app/api/sections.py` — NEW router
- `backend/app/api/floor_schema.py` — **NEW** router (PUT /floors/{id}/schema, POST /extract-walls, PUT /walls)
- `backend/app/api/reconstruction.py` — modified (фильтры galery: building_code, search; PATCH endpoint)
- `backend/app/api/__init__.py` — register 4 new routers
- `backend/app/api/deps.py` — DI getters
- `backend/app/core/exceptions.py` — `BuildingNotFoundError`, `FloorNotFoundError`, `SectionValidationError`, `FloorSchemaError`, `ImageProcessingError`
- Backend tests (см. 04-testing.md)

### Backend — Modified
См. файлы выше с пометкой "modified".

### Frontend — New
- `frontend/src/types/hierarchy.ts` — Building/Floor/Section/PublicBuilding/CropBbox/FloorWithSchema types
- `frontend/src/api/buildingsApi.ts` — REST client (buildings/floors/sections)
- `frontend/src/api/floorSchemaApi.ts` — REST client (floor_schema endpoints)
- `frontend/src/hooks/useBuildings.ts`, `useFloors.ts`, `useFloorSections.ts`, `useFloorViewer.ts`
- `frontend/src/hooks/useFloorEditorWizard.ts` — **NEW state machine** wizard'a
- `frontend/src/pages/AdminBuildingsPage.tsx`, `FloorEditorPage.tsx`, `FloorViewerPage.tsx` + `.module.css`
- `frontend/src/components/FloorEditor/Step1Upload.tsx`, `Step2CropRotate.tsx`, `Step3WallExtraction.tsx`, `Step4MarkSections.tsx`, `Step5BindPlans.tsx` (5 step-компонентов)
- `frontend/src/components/FloorEditor/NewSectionDialog.tsx` (модалка над canvas)
- `frontend/src/components/FloorEditor/PlanGalleryPicker.tsx` (карточки + поиск + dropdown'ы)
- `frontend/src/components/FloorEditor/FloorOverview.tsx` (графический режим + context menu)
- `frontend/src/components/FloorEditor/FloorSectionsTable.tsx` (табличный режим)
- `frontend/src/components/FloorEditor/SectionContextMenu.tsx`
- `frontend/src/components/FloorEditor/CanvasControls.tsx` (zoom/reset/rotate)
- `frontend/src/components/FloorViewer/BuildingFloorSectionSelector.tsx`, `FloorMinimap.tsx`
- `frontend/src/components/Upload/BuildingFloorPicker.tsx`

### Frontend — Modified
- `frontend/src/App.tsx` — новые routes (/admin/buildings, /admin/floor-editor, /viewer)
- `frontend/src/components/Wizard/StepUpload.tsx` — BuildingFloorPicker, валидация, ранний PATCH
- `frontend/src/components/Wizard/StepSave.tsx` — убрать поля building/floor
- `frontend/src/hooks/useWizard.ts` — floor_id в state, PATCH on floor select
- `frontend/src/pages/EditPlanPage.tsx` — плашка статуса
- `frontend/src/hooks/useRouteTest.ts` + `.helpers.ts` — фильтр по floor_id, displayLabel из иерархии
- `frontend/src/api/apiService.ts` — обновлённые `saveReconstruction`, `getReconstructions`, новый `patchReconstructionFloor`

## Success Criteria

Из `../README.md` Acceptance Criteria + дополнительно:
- [ ] Все 114 тестов из `../04-testing.md` проходят
- [ ] `pytest backend/tests` зелёный
- [ ] `npm run build` (frontend) без ошибок TS
- [ ] `npm run lint` (frontend) без warnings
- [ ] Manual smoke-тест из `../04-testing.md §Manual Test Plan` пройден
- [ ] Архитектурные правила из `prompts/architecture.md` соблюдены (routers тонкие, processing/ не задействован)
