# Architecture: test-route

## C4 L1 — System Context

```mermaid
C4Context
title System Context — test-route
Person(admin, "Admin", "QA-инженер маршрутов")
System(diplom, "Diplom3D Web", "Frontend SPA + FastAPI")
Rel(admin, diplom, "GET /admin/route-test, тестирует пути")
```

## C4 L2 — Container

```mermaid
C4Container
title Container — test-route
Container(spa, "React SPA", "TS+R3F+Three.js", "RouteTestPage + hook")
Container(api, "FastAPI", "Python 3.12", "/buildings, /reconstruction/*, /navigation/multifloor-route")
ContainerDb(db, "SQLite/Postgres", "FloorPlan + Building + FloorTransition")
Rel(spa, api, "HTTP/JSON")
Rel(api, db, "SQLAlchemy")
```

## C4 L3 — Components (frontend)

```mermaid
C4Component
title Frontend Components — test-route
Component(page, "RouteTestPage", "React", "Layout + composes child components")
Component(hook, "useRouteTest", "React hook", "Все состояние + API вызовы")
Component(viewer, "MeshViewer", "R3F Canvas", "Существующий 3D-вьювер")
Component(path, "MultifloorNavigationPath", "R3F", "Существующий: рисует сегменты + T-маркеры")
Component(bar, "RouteBottomBar", "React", "Существующий: multifloorMode=true")
Component(api, "apiService/transitionsApi", "axios", "Существующие клиенты")

Rel(page, hook, "useRouteTest()")
Rel(page, viewer, "renders")
Rel(page, bar, "renders")
Rel(viewer, path, "child")
Rel(hook, api, "fetch")
```

## Module Dependency Graph

```mermaid
flowchart BT
  page[pages/RouteTestPage] --> hook[hooks/useRouteTest]
  page --> viewer[components/MeshViewer]
  page --> mfpath[components/MeshViewer/MultifloorNavigationPath]
  page --> bar[components/MeshViewer/RouteBottomBar]
  hook --> api1[api/apiService - reconstructionApi, navigationApi]
  hook --> api2[api/transitionsApi - listBuildings]
  hook -.-> ui[no UI imports — pure logic]
```

**Rule:** `useRouteTest` не импортирует Three.js / React-компоненты.
Только axios-клиенты + типы. Вся UI-логика — в page и существующих компонентах.

## File Inventory

### New files

| Path | Purpose |
|------|---------|
| `frontend/src/hooks/useRouteTest.ts` | состояние + API оркестрация |
| `frontend/src/pages/RouteTestPage.tsx` | layout (заменяет stub) |
| `frontend/src/pages/RouteTestPage.module.css` | layout styles |

### Modified files

| Path | Change |
|------|--------|
| `frontend/src/App.tsx` | + `<Route path="/admin/route-test" element={<RouteTestPage/>}/>` |

### Reused (no changes)

- `components/MeshViewer.tsx`
- `components/MeshViewer/MultifloorNavigationPath.tsx`
- `components/MeshViewer/RouteBottomBar.tsx`
- `api/apiService.ts` (reconstructionApi, navigationApi)
- `api/transitionsApi.ts` (listBuildings)
- `types/transitions.ts`
- `types/reconstructionVectors.ts` (для rooms)
