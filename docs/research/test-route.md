# Research: test-route
date: 2026-04-27

## Summary

Фича «Тестовый маршрут» — отдельная страница `/admin/route-test`, которая воспроизводит 3D-вьювер из `StepView3D` (шаг 5 визарда) в виде самостоятельного экрана. Пользователь выбирает здание, начальный и конечный этаж/комнату, система строит мультиэтажный маршрут через A* и показывает путь в 3D. Дополнительно: в местах телепортов на 2D-плане показываются оранжевые круги «T», кликнув по которым можно переключиться на соседний план.

Вся инфраструктура уже готова: `MeshViewer`, `RouteBottomBar`, `NavigationPath`, `MultifloorNavigationPath`, `TransitionPlanCanvas` (read-only режим для 2D плана), API `navigationApi.multifloorRoute()`. Нужно только собрать страницу, зарегистрировать маршрут и добавить кликабельные T-маркеры на 2D-оверлей.

Навигационный граф строится один раз (шаг 4 визарда) и сохраняется на диск как `{mask_file_id}_nav.json`. При мультиэтажном маршруте все графы загружаются с диска и объединяются в памяти прямо при запросе — никакого автоматического пересчёта нет.

---

## Architecture — Current State

### Backend

- `backend/app/processing/nav_graph.py:422` — `find_route(G, from_room_id, to_room_id) -> dict|None` — A* на одном этаже
- `backend/app/processing/nav_graph.py:733` — `merge_floor_graphs(floor_data, transitions) -> (merged_G, floor_data_by_recon_id)` — объединяет N этажей, создаёт teleport-узлы и рёбра
- `backend/app/processing/nav_graph.py:830` — `find_multifloor_route_in_graph(...)` — A* в объединённом графе; возвращает `path_segments` (per-floor) + `transitions_used`
- `backend/app/services/nav_service.py:57` — `build_graph(mask_file_id, rooms, doors, scale_factor)` — строит граф из маски, сохраняет на диск
- `backend/app/services/nav_service.py:121` — `load_graph(mask_file_id) -> dict` — загружает JSON-граф с диска
- `backend/app/services/nav_service.py:219` — `find_multifloor_route(building_id, from_recon_id, from_room_id, to_recon_id, to_room_id, ft_repo, recon_repo)` — оркестратор мультиэтажного маршрута
- `backend/app/api/navigation.py:19` — `POST /navigation/multifloor-route` (MultifloorRouteRequest → MultifloorRouteResponse)
- `backend/app/api/navigation.py:46` — `POST /navigation/route` (FindRouteRequest → FindRouteResponse)
- `backend/app/api/reconstruction.py:358` — `POST /reconstruction/nav-graph` — триггер построения графа
- `backend/app/api/reconstruction.py:375` — `GET /reconstruction/nav-graph/{graph_id}` — загрузка графа
- `backend/app/api/floor_transitions.py:34` — `GET /floor-transitions/?building_id=` — все телепорты здания

### Frontend — переиспользуемые компоненты

- `frontend/src/components/MeshViewer.tsx:192` — `MeshViewer(url, format?, children?)` — 3D Canvas с OrbitControls
- `frontend/src/components/MeshViewer/RouteBottomBar.tsx:23` — `RouteBottomBar(rooms, fromRoom, toRoom, ..., multifloorMode?, availablePlans?, ...)` — нижняя панель выбора комнат, поддерживает мультиэтажный режим
- `frontend/src/components/MeshViewer/NavigationPath.tsx:14` — `NavigationPath(coordinates, fromRoom3D?, toRoom3D?, ...)` — маршрут одного этажа в 3D
- `frontend/src/components/MeshViewer/MultifloorNavigationPath.tsx:77` — `MultifloorNavigationPath(pathSegments, transitionsUsed, ...)` — маршрут через несколько этажей + TransitionMarker
- `frontend/src/components/Wizard/StepView3D.tsx:35` — ближайший аналог: 3D вьювер с выбором комнат и поиском маршрута

### Frontend — страницы

- `frontend/src/pages/RouteTestPage.tsx` — **существует как пустой стаб**, не зарегистрирован в роутере
- `frontend/src/App.tsx:14-35` — нет маршрута для `/admin/route-test` и нет пункта меню

### Данные

- `frontend/src/api/apiService.ts:268` — `reconstructionApi.findRoute(graphId, fromRoomId, toRoomId)`
- `frontend/src/api/apiService.ts:321` — `navigationApi.multifloorRoute(MultifloorRouteRequest)`
- `frontend/src/types/transitions.ts:51` — `MultifloorRouteRequest`, `MultifloorRouteResponse`, `PathSegment3D`, `TransitionUsed3D`

---

## Ответ: жизненный цикл навигационного графа

**Граф строится один раз вручную.** Триггер — шаг 4 визарда (`StepNavGraph`), который вызывает `POST /reconstruction/nav-graph`. `NavService.build_graph()` прогоняет полный пайплайн:

```
corridor_mask → skeleton → topology_graph → prune_dendrites → integrate_semantics → serialize → disk
```

Результат сохраняется в файл `{mask_file_id}_nav.json`. В БД граф **не хранится** — только в файловой системе.

**При мультиэтажном запросе** (`find_multifloor_route`) все нужные графы загружаются с диска, объединяются в памяти через `merge_floor_graphs()`, в объединённый граф добавляются ребра-телепорты на основе записей из таблицы `floor_transitions`. Объединённый граф не кэшируется — пересчитывается при каждом запросе маршрута.

**Автоматического пересчёта нет.** Если пользователь изменил стены/комнаты, нужно явно пересоздать граф через визард (шаг 4).

---

## Closest Analog

**StepView3D** (`frontend/src/components/Wizard/StepView3D.tsx`) — вьювер 3D-меша с выбором маршрута.

Поток данных:
1. Props: `meshUrl` (GLB/OBJ), `reconstructionId`, `navGraphId`, `rooms[]`, `buildingId?`, `toReconstructionId?`
2. `RouteBottomBar` → `fromRoom`/`toRoom` → `handleFindRoute()`
3. Если `isMultifloor` → `navigationApi.multifloorRoute(...)` → `multifloorResult`
4. Рендер: `MeshViewer` + `MultifloorNavigationPath(multifloorResult.path_segments, transitions_used)`

Отличия от нужной нам страницы:
- `StepView3D` — шаг визарда с `onNext`/`onPrev`, работает с одной реконструкцией
- Нам нужна: **автономная страница** со своим sidebar выбора здания/этажей и 2D-оверлеем с T-маркерами

---

## Integration Points

**Database:**
- `floor_transitions` — таблица телепортов (building_id, from_x/y, to_x/y, from_recon_id, to_recon_id)
- `reconstructions` — building_id, floor_number, mask_file_id

**File storage:**
- `{upload_dir}/masks/{mask_file_id}_nav.json` — навигационный граф
- `{upload_dir}/meshes/{...}.glb` — 3D меш

**API:**
- `GET /floor-transitions/?building_id=X` — список телепортов для наложения T-маркеров
- `POST /navigation/multifloor-route` — маршрут
- `GET /reconstruction/buildings/{building_id}/reconstructions` — этажи здания
- `GET /reconstruction/reconstructions/{id}/vectors` — комнаты этажа (VectorizationResult.rooms[])

**Pipeline:** граф уже должен быть построен до использования страницы

---

## Architecture Decision: T-маркеры и переключение плана

### 3D T-маркеры (в Three.js сцене)
Использовать `<Html>` из `@react-three-fiber/drei` — как уже делает `TransitionMarker` в `MultifloorNavigationPath.tsx:51-65`. Добавить `onClick` на Html-элемент → переключает `activeFloorId`.

### 2D план-оверлей
Использовать существующий `TransitionPlanCanvas` в read-only режиме (без создания новых телепортов). Отдельный блок под 3D или в drawer'е. Показывает план текущего этажа + T-маркеры (`FloorTransition`-записи).

### Предлагаемая структура страницы

```
RouteTestPage
├── Header (тёмный, как в TransitionsPage, с × закрытия)
├── Body (flex row)
│   ├── Left: MeshViewer (3D меш здания или текущего этажа)
│   │         └── MultifloorNavigationPath (path + T-маркеры как Html кружки)
│   └── Right sidebar (288px, как в TransitionsPage)
│       ├── Здания → Этажи навигация
│       └── Список телепортов для активного этажа
├── PlanDrawer (снизу или overlay, опционально)
│   └── TransitionPlanCanvas (read-only, T-маркеры кликабельны)
└── Bottom toolbar (RouteBottomBar)
    ├── "Из:" autocomplete (комнаты текущего этажа)
    ├── "В:" autocomplete (комнаты целевого этажа)
    ├── "Этаж назначения:" select
    └── "Найти маршрут" CTA
```

---

## Gaps (что нужно построить)

1. **`RouteTestPage.tsx`** — реализовать стаб (файл есть, пустой)
2. **`RouteTestPage.module.css`** — стили (аналог `TransitionsPage.module.css`)
3. **`App.tsx`** — добавить маршрут `/admin/route-test`
4. **`DashboardPage.tsx`** или `AppLayout` — добавить пункт меню «Тестовый маршрут»
5. **T-маркеры** — кликабельные Html-оверлеи в MeshViewer (расширить `MultifloorNavigationPath` или создать `TeleportMarkers3D.tsx`)
6. **Загрузка комнат по этажу** — нужен хук `useRoomsForPlan(reconId)` через `getReconstructionVectors()`
7. **Загрузка меша по этажу** — нужно знать `meshUrl` для каждого плана (`ReconstructionResponse.url`)

---

## Key Files

- `frontend/src/pages/RouteTestPage.tsx` — стаб для реализации
- `frontend/src/components/Wizard/StepView3D.tsx` — ближайший аналог (clone & adapt)
- `frontend/src/components/MeshViewer/RouteBottomBar.tsx` — переиспользовать as-is
- `frontend/src/components/MeshViewer/MultifloorNavigationPath.tsx` — переиспользовать, расширить T-маркеры
- `frontend/src/components/Transitions/TransitionPlanCanvas.tsx` — 2D план с маркерами (read-only режим)
- `frontend/src/pages/TransitionsPage.tsx` — образец для sidebar + header страницы
- `backend/app/api/navigation.py` — готовые эндпоинты
- `backend/app/processing/nav_graph.py:733` — `merge_floor_graphs` — ключевая функция объединения
