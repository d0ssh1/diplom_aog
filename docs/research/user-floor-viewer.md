---
name: research-user-floor-viewer
type: research
feature: user-floor-viewer
---

# Research: user-floor-viewer
date: 2026-05-17

## Summary

Большая часть требуемой пользовательской страницы уже реализована: существует [FloorViewerPage.tsx](frontend/src/pages/FloorViewerPage.tsx), хук [useFloorViewer.ts](frontend/src/hooks/useFloorViewer.ts), компоненты [BuildingFloorSectionSelector](frontend/src/components/FloorViewer/BuildingFloorSectionSelector.tsx) и [FloorMinimap](frontend/src/components/FloorViewer/FloorMinimap.tsx), а также 3D-вьюер [MeshViewer](frontend/src/components/MeshViewer/MeshViewer.tsx). На бэкенде есть публичный режим `GET /buildings?published=true` ([buildings_hierarchy.py:42](backend/app/api/buildings_hierarchy.py:42)), денормализованно отдающий иерархию `Building → Floor → Section[mesh_url_glb]`, и эндпоинт построения мультиэтажного маршрута `POST /navigation/multifloor-route` ([navigation.py](backend/app/api/navigation.py)).

Но **страница не достижима из публичного интерфейса**: [PublicHomePage.tsx:117](frontend/src/pages/PublicHomePage.tsx:117) делает `navigate('/map')`, а в [App.tsx](frontend/src/App.tsx) роут зарегистрирован как `/viewer` — нажатие на «ДВФУ» в выпадашке ведёт на fallback `/`. Кроме того, **все эндпоинты иерархии требуют JWT-авторизации**, включая публичный режим: на [buildings_hierarchy.py:42-55](backend/app/api/buildings_hierarchy.py:42) параметр `published=true` лишь меняет ответ, но `credentials = Depends(security)` остаётся обязательным. То же для `/floors/*`, `/sections/*`. Это значит, что неавторизованный пользователь получит 401 при попытке загрузить каталог.

Чтобы фича заработала "из коробки при клике на ДВФУ", нужны три правки: (1) согласовать роут `/map` ↔ `/viewer`, (2) снять auth с публичных GET-ручек (или сделать им альтернативную ветку без `Depends(security)`), (3) убедиться, что навигационный эндпоинт `POST /navigation/multifloor-route` тоже доступен публично и что `apiService` не подставляет токен туда, где его нет.

---

## Architecture — Current State

### Backend (relevant to feature)

**Routers** (зарегистрированы под `/api/v1`, см. [main.py:16-43](backend/main.py:16)):
- [buildings_hierarchy.py:42](backend/app/api/buildings_hierarchy.py:42) — `GET /buildings?published=bool` → admin списком или `PublicBuilding[]` с вложенными `floors[sections[mesh_url_glb]]`. **Auth обязателен** (строка 45: `credentials = Depends(security)`).
- [floors.py:54](backend/app/api/floors.py:54) — `GET /buildings/{building_id}/floors`, **auth**.
- [floors.py:73](backend/app/api/floors.py:73) — `GET /floors/{floor_id}` (со `schema_image_id`, `wall_polygons`), **auth**.
- [sections.py:20](backend/app/api/sections.py:20) — `GET /floors/{floor_id}/sections`, **auth**.
- [navigation.py](backend/app/api/navigation.py) — `POST /navigation/multifloor-route` (`MultifloorRouteRequest → MultifloorRouteResponse`); требует проверки авторизации.

**Services**:
- [building_service.py:90](backend/app/services/building_service.py:90) — `list_published()` фильтрует здания с хотя бы одной `Section.reconstruction.status == Done`, отдаёт денормализованную иерархию с `mesh_url_glb` на уровне секции.
- [nav_service.py:219](backend/app/services/nav_service.py:219) — `find_multifloor_route(building_id, from_recon_id, from_room_id, to_recon_id, to_room_id, …)` возвращает `MultifloorRouteResponse{ status, path_segments[], transitions_used[], from_room_3d, to_room_3d, total_distance_meters, estimated_time_seconds, message }`.

**ORM** ([db/models/building.py](backend/app/db/models/building.py), [db/models/section.py](backend/app/db/models/section.py)):
```
Building(id, name, code [unique], address) ─< Floor(id, building_id, number, schema_image_id,
  schema_crop_bbox, wall_polygons) ─< Section(id, floor_id, number, geometry [4-точки [0,1]],
  reconstruction_id [unique], section_type [1=room, 2=stairs, 3=elevator])
```
`Reconstruction` хранит `mesh_file_id_glb`; URL мэша строится в [reconstruction_service.py:417-430](backend/app/services/reconstruction_service.py:417): `/api/v1/uploads/models/reconstruction_{id}.glb` (статика монтируется в [main.py:31](backend/main.py:31)).

### Frontend (relevant to feature)

**Pages**:
- [PublicHomePage.tsx:117](frontend/src/pages/PublicHomePage.tsx:117) — выпадающий список с пунктом «ДВФУ» → `navigate('/map')`. **РАЗОЙДЁТСЯ** с App.tsx, где роут `/viewer`.
- [FloorViewerPage.tsx](frontend/src/pages/FloorViewerPage.tsx) — двухколоночный layout (header «← ДВФУ > Корпус {code}», левая панель с маршрутом/селекторами/минимапой, правая — `MeshViewer`). Слушает `useFloorViewer()`. Реализованы поля «Начальная точка»/«Конечная точка», кнопка «Построить маршрут», toast-ошибка.
- [App.tsx:20](frontend/src/App.tsx:20) — публичные роуты: `/`, **`/viewer`**, `/login`, `/register`, `/forgot-password`.

**Hook** [useFloorViewer.ts:62-275](frontend/src/hooks/useFloorViewer.ts:62):
- On mount: `buildingsApi.listPublished()` → `PublicBuilding[]`.
- Хранит `selectedBuildingId/FloorId/SectionId`, выводит `visibleFloors`, `visibleSections`, `activeMeshUrl`.
- `planRoute(start, end)`: парсит строки вида `"D304"` → код корпуса + id комнаты; вызывает `navigationApi.multifloorRoute()`; раскладывает `path_segments[].reconstruction_id` обратно в `section_id` и пишет в `highlightedSectionIds` (для подсветки минимапы).
- ADR-22: при смене этажа сохраняет номер отсека, если найден.

**Components**:
- [BuildingFloorSectionSelector.tsx:102](frontend/src/components/FloorViewer/BuildingFloorSectionSelector.tsx:102) — три карусели `Корпус/Этаж/Отсек` с окном из 3 элементов, стрелки `< >`.
- [FloorMinimap.tsx:28](frontend/src/components/FloorViewer/FloorMinimap.tsx:28) — SVG viewBox `0 0 1 1`, рисует `section.geometry.points` полигонами, центроидная подпись = `section.number`, состояния active/highlighted.
- [MeshViewer.tsx](frontend/src/components/MeshViewer/MeshViewer.tsx) — `Canvas` + `OrbitControls`, поддерживает GLB (`useGLTF`) и OBJ (`OBJLoader`), изометрическая камера ~70°, авто-fit по bbox, материал стен `#BDBDBD`, фон `#ECEFF1`, beige floor plane. Принимает `children` для оверлеев.
- [MeshViewer/NavigationPath.tsx:14](frontend/src/components/MeshViewer/NavigationPath.tsx:14) — рисует CatmullRom-сплайн по `coordinates[][]` + полупрозрачные оранжевые боксы from/to комнат.

**API clients** ([api/](frontend/src/api/)):
- `buildingsApi.listPublished()` → `GET /buildings?published=true` → `PublicBuilding[]`.
- `navigationApi.multifloorRoute(params)` → `POST /navigation/multifloor-route`.
- [apiService.ts:20-30](frontend/src/api/apiService.ts:20) — axios interceptor добавляет `Authorization: Bearer ${localStorage.auth_token}` к **каждому** запросу. На 401 ([:36-40](frontend/src/api/apiService.ts:36)) — выкидывает на `/login`.

**Types** ([types/hierarchy.ts:82](frontend/src/types/hierarchy.ts:82)): `PublicBuilding{ id, code, name, floors:[{ id, number, schema_image_url, wall_polygons, sections:[{ id, number, geometry:{points}, reconstruction_id, mesh_url_glb, section_type }] }] }`.

---

## Closest Analog Feature

**Сам FloorViewerPage и есть ближайший аналог** — он покрывает примерно 90% UI из скриншота: тот же layout, те же селекторы, та же минимапа, тот же 3D-вьюер, поля для построения маршрута. Архитектурно: страница → хук `useFloorViewer` → API-клиенты → бэкенд. Тестов под него нет.

Второй аналог — [RouteTestPage.tsx](frontend/src/pages/RouteTestPage.tsx) + [useRouteTest.ts](frontend/src/hooks/useRouteTest.ts) (админский): там сделана навигация по сегментам мультиэтажного маршрута и кэширование mesh URL по реконструкциям (`ensureMeshUrl`), а также сегмент-каунтер «Этаж 1 / 3». Эти приёмы можно перенять для красивого UX в публичной версии.

---

## Existing Patterns to Reuse

- **3D viewer**: [MeshViewer.tsx](frontend/src/components/MeshViewer/MeshViewer.tsx) — принимает `url` + `format`, через `children` рисуются оверлеи.
- **Маршрут поверх 3D**: [NavigationPath.tsx](frontend/src/components/MeshViewer/NavigationPath.tsx) — CatmullRom через массив `coordinates`.
- **Селекторы корпус/этаж/отсек**: [BuildingFloorSectionSelector.tsx](frontend/src/components/FloorViewer/BuildingFloorSectionSelector.tsx) — карусельное окно из 3 элементов.
- **Минимапа отсеков**: [FloorMinimap.tsx](frontend/src/components/FloorViewer/FloorMinimap.tsx).
- **Toast-ошибки**: [FloorViewerPage.tsx:227-229](frontend/src/pages/FloorViewerPage.tsx:227) + [Toast/](frontend/src/components/Toast/).
- **Тематика «оранжевое/чёрное»**: CSS-переменные `--color-orange`, `--color-black`, `--shadow-hard` из стилей [PublicHomePage.module.css](frontend/src/pages/PublicHomePage.module.css).
- **Сегмент-навигация маршрута**: [useRouteTest.ts](frontend/src/hooks/useRouteTest.ts) — `currentSegmentIndex`, `goToNextSegment()`, `goToPrevSegment()`, `meshUrlByRecon` кэш.

---

## Integration Points

- **Database**: модели уже существуют (`Building`, `Floor`, `Section`, `Reconstruction`, `FloorTransition`). Менять схему не нужно.
- **File storage**: GLB-меши лежат в `uploads/models/reconstruction_{id}.glb`, отдаются через `/api/v1/uploads/...` ([main.py:31](backend/main.py:31)).
- **API**: всё нужное (`GET /buildings?published=true`, `POST /navigation/multifloor-route`) уже есть, но защищено auth.
- **Pipeline**: маршрут собирается через [multi_plan_graph.py](backend/app/processing/multi_plan_graph.py) + `nav_service.find_multifloor_route()` — изменений не требуется.
- **Routing (frontend)**: страница уже в `App.tsx` под `/viewer`, но PublicHomePage ведёт на `/map`.
- **Auth**: `apiService.ts` interceptor подставит Bearer-токен в любой запрос — для неавторизованного пользователя header будет отсутствовать, на бэке `HTTPBearer` вернёт 401.

---

## Gaps (что мешает фиче работать «из коробки»)

1. **Route mismatch**: [PublicHomePage.tsx:117](frontend/src/pages/PublicHomePage.tsx:117) ведёт на `/map`, а зарегистрирован `/viewer` ([App.tsx:20](frontend/src/App.tsx:20)). Клик на «ДВФУ» сейчас падает в fallback.
2. **Публичные эндпоинты на самом деле приватные**: `GET /buildings?published=true` ([buildings_hierarchy.py:45](backend/app/api/buildings_hierarchy.py:45)) и `POST /navigation/multifloor-route` требуют `Depends(security)`. Нужно либо снять auth (только для public-ветки), либо завести отдельный публичный роутер `/public/...`.
3. **Связь корпус → здание**: на скриншоте «Корпус D» — это `Building.code`. Сейчас `useFloorViewer` корректно работает на уровне `Building`, но семантика "корпус ВУЗа" в текущей модели — это **именно отдельная запись Building**. Для UX «ДВФУ → Корпус D/S/B» нужно либо вводить понятие «университет» (группа Buildings), либо договориться, что «ДВФУ» в выпадашке — это синоним «список всех Buildings». Сейчас [PublicHomePage.tsx:117](frontend/src/pages/PublicHomePage.tsx:117) и [FloorViewerPage](frontend/src/pages/FloorViewerPage.tsx) уже работают по второй схеме.
4. **Парсинг «Начальная точка»**: текущий `planRoute(start, end)` ([useFloorViewer.ts](frontend/src/hooks/useFloorViewer.ts)) ожидает строку формата `"D304"` (код корпуса + id комнаты в реконструкции). На скриншоте поля просто «Начальная точка/Конечная точка» — UX не очевидный, желательны автокомплит или dropdown как в `useRouteTest`.
5. **Привязка `Reconstruction` к комнатам**: чтобы маршрут построился, в `path_segments` нужны реальные `reconstruction_id` секций. Не у всех секций может быть `mesh_url_glb` (см. `list_published` фильтр по `status == Done`). Если в БД у ДВФУ нет ни одной готовой секции, страница откроется пустой — стоит проверить на текущих данных.
6. **Тесты**: на `FloorViewerPage`, `useFloorViewer`, `building_service.list_published`, `nav_service.find_multifloor_route` тестов нет.
7. **CSS-тема**: текущий `FloorViewerPage.module.css` — белый, мягко-оранжевый. Скриншот сохраняет такой же стиль, отдельной переработки не требует, но хедер «← ДВФУ > Корпус D» сейчас уже соответствует макету.

---

## Key Files

### Backend
- [backend/main.py](backend/main.py) — регистрация роутеров, статика `/api/v1/uploads`.
- [backend/app/api/buildings_hierarchy.py](backend/app/api/buildings_hierarchy.py) — `GET /buildings?published=true`, требуется снять auth.
- [backend/app/api/navigation.py](backend/app/api/navigation.py) — `POST /navigation/multifloor-route`.
- [backend/app/services/building_service.py](backend/app/services/building_service.py) — `list_published()`.
- [backend/app/services/nav_service.py](backend/app/services/nav_service.py) — `find_multifloor_route()`.
- [backend/app/db/models/building.py](backend/app/db/models/building.py), [section.py](backend/app/db/models/section.py) — иерархия.

### Frontend
- [frontend/src/App.tsx](frontend/src/App.tsx) — роут `/viewer`.
- [frontend/src/pages/PublicHomePage.tsx](frontend/src/pages/PublicHomePage.tsx) — `navigate('/map')` нужно править на `/viewer` (или наоборот).
- [frontend/src/pages/FloorViewerPage.tsx](frontend/src/pages/FloorViewerPage.tsx) — уже реализованный целевой UI.
- [frontend/src/hooks/useFloorViewer.ts](frontend/src/hooks/useFloorViewer.ts) — каталог, выбор, маршрут.
- [frontend/src/components/FloorViewer/](frontend/src/components/FloorViewer) — селекторы и минимапа.
- [frontend/src/components/MeshViewer/](frontend/src/components/MeshViewer) — 3D + NavigationPath.
- [frontend/src/api/buildingsApi.ts](frontend/src/api/buildingsApi.ts), [apiService.ts](frontend/src/api/apiService.ts) — клиенты + auth-интерсептор.
- [frontend/src/types/hierarchy.ts](frontend/src/types/hierarchy.ts), [transitions.ts](frontend/src/types/transitions.ts) — типы.
