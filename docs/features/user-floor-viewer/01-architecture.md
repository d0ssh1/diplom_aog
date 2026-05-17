# Architecture: user-floor-viewer

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — user-floor-viewer
Person(anon, "Anonymous user", "Открывает публичную главную, ищет здание, смотрит этаж в 3D, строит маршрут")
Person(admin, "Admin", "Загружает планы, размечает отсеки")
System(diplom, "Diplom3D", "Web-приложение: планы → 3D + навигация")
System_Ext(browser, "Browser (WebGL)", "Three.js рендеринг")
Rel(anon, diplom, "Просматривает / строит маршрут (без логина)")
Rel(admin, diplom, "Готовит контент")
Rel(diplom, browser, "Отдаёт GLB + HTML/JS")
```

## C4 Level 2 — Container

Изменений на уровне контейнеров нет. Фича целиком в существующих:

```mermaid
C4Container
title Containers
Container(spa, "React SPA", "TypeScript+Three.js", "PublicHomePage, FloorViewerPage")
Container(api, "FastAPI", "Python 3.12", "buildings_hierarchy, navigation, static uploads")
ContainerDb(db, "SQLite/Postgres", "Building/Floor/Section/Reconstruction")
Container(fs, "uploads/", "Disk", "GLB-файлы, схемы")
Rel(spa, api, "HTTP/JSON (без Authorization для public-endpoints)")
Rel(api, db, "SQLAlchemy async")
Rel(api, fs, "Serve /api/v1/uploads/...")
```

## C4 Level 3 — Component

### 3.1 Backend (затрагиваемые компоненты)

```mermaid
C4Component
title Backend — user-floor-viewer
Component(rt_bh, "buildings_hierarchy router", "FastAPI", "GET /buildings?published=true → публично (после правки)")
Component(rt_nav, "navigation router", "FastAPI", "POST /navigation/multifloor-route — уже публично")
Component(svc_b, "BuildingService.list_published()", "Service", "Денормализованная иерархия с mesh_url_glb")
Component(svc_n, "NavService.find_multifloor_route()", "Service", "A* + transitions, возвращает path_segments[]")
Component(static, "StaticFiles /api/v1/uploads", "Starlette", "GLB-файлы — без auth")
ComponentDb(db, "Repos: Building/Floor/Section/Reconstruction/FloorTransition", "SQLAlchemy")
Rel(rt_bh, svc_b, "вызывает")
Rel(rt_nav, svc_n, "вызывает")
Rel(svc_b, db, "читает")
Rel(svc_n, db, "читает граф + transitions")
```

**Точка правки:** [buildings_hierarchy.py:42-55](backend/app/api/buildings_hierarchy.py:42) — разделить ручку на «public-режим без auth» и «admin-режим с auth». Варианты в [03-decisions.md](03-decisions.md) ADR-1.

### 3.2 Frontend (затрагиваемые компоненты)

```mermaid
C4Component
title Frontend — user-floor-viewer
Component(home, "PublicHomePage", "Page", "Поиск+выпадашка, ведёт на /viewer (после правки)")
Component(viewer, "FloorViewerPage", "Page", "Header + левая панель + 3D")
Component(hook, "useFloorViewer", "Hook", "catalog/selection/planRoute, индекс комнат (новое)")
Component(sel, "BuildingFloorSectionSelector", "Component", "Три карусели")
Component(mini, "FloorMinimap", "Component", "SVG отсеков, клик")
Component(mesh, "MeshViewer + NavigationPath", "Component", "Three.js")
Component(route, "RouteInputs", "Component (новое)", "Автокомплит из комнат здания")
Component(api_b, "buildingsApi.listPublished", "API", "GET /buildings?published=true")
Component(api_n, "navigationApi.multifloorRoute", "API", "POST /navigation/multifloor-route")
Component(api_r, "reconstructionApi.getRooms (если нужно)", "API", "Источник списка комнат для автокомплита")
Rel(home, viewer, "navigate('/viewer')")
Rel(viewer, hook, "")
Rel(viewer, sel, "")
Rel(viewer, mini, "")
Rel(viewer, mesh, "")
Rel(viewer, route, "")
Rel(hook, api_b, "")
Rel(hook, api_n, "")
Rel(hook, api_r, "")
```

**Точки правки:**
- [PublicHomePage.tsx:117](frontend/src/pages/PublicHomePage.tsx:117) — `navigate('/map')` → `navigate('/viewer')`.
- [apiService.ts:20-30](frontend/src/api/apiService.ts:20) — `Authorization`-заголовок должен **не добавляться**, если токена нет (interceptor уже это делает — `if (token) ...`). Никаких правок не требуется, но 401-редирект ([:36-40](frontend/src/api/apiService.ts:36)) не должен срабатывать для публичных страниц — см. ADR-2.
- [useFloorViewer.ts](frontend/src/hooks/useFloorViewer.ts) — добавить загрузку реестра комнат текущего здания + новый `RouteInputs` с автокомплитом (ADR-3).

## Module Dependency Graph

```mermaid
flowchart BT
  api_router[api/buildings_hierarchy.py] --> svc_building[services/building_service.py]
  api_nav[api/navigation.py] --> svc_nav[services/nav_service.py]
  svc_building --> repo[db/repositories/*]
  svc_nav --> processing[processing/nav_graph.py + multi_plan_graph.py]
  svc_nav --> repo
  processing -.->|NEVER| api_router
  processing -.->|NEVER| svc_building

  subgraph Frontend
    page_home[pages/PublicHomePage] --> page_view[pages/FloorViewerPage]
    page_view --> hook[hooks/useFloorViewer]
    hook --> apicli[api/buildingsApi + apiService.navigationApi]
  end
```

Правило: правки не меняют направления зависимостей, не добавляют импортов между слоями.
