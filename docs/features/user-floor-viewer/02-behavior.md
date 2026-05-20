# Behavior: user-floor-viewer

## DFD — главный поток

```mermaid
flowchart LR
  U([Anon User]) -->|"клик «ДВФУ»"| Home[PublicHomePage]
  Home -->|navigate /viewer| View[FloorViewerPage]
  View -->|mount| H[useFloorViewer]
  H -->|GET /buildings?published=true| API1[buildings_hierarchy.list]
  API1 -->|list_published| Svc1[BuildingService]
  Svc1 --> DB[(Building/Floor/Section/Recon)]
  Svc1 -.PublicBuilding[].-> H
  H -.activeMeshUrl.-> Mesh[MeshViewer]
  Mesh -->|GET /api/v1/uploads/models/*.glb| Static[StaticFiles]
  View -->|ввод комнат| RI[RouteInputs]
  RI -->|planRoute| H
  H -->|POST /navigation/multifloor-route| API2[navigation.find_multifloor]
  API2 --> Svc2[NavService]
  Svc2 -.path_segments[].-> H
  H -.coordinates.-> NavPath[NavigationPath overlay]
```

---

## Use Case 1 — «Открыть ДВФУ из главной»

```mermaid
sequenceDiagram
  actor U as Anon User
  participant Home as PublicHomePage
  participant Router as React Router
  participant View as FloorViewerPage
  participant Hook as useFloorViewer
  participant API as GET /buildings?published=true
  participant Svc as BuildingService
  participant DB as DB

  U->>Home: открывает /
  U->>Home: фокус в поиск → видит подсказку «ДВФУ»
  U->>Home: клик «ДВФУ»
  Home->>Router: navigate('/viewer')
  Router->>View: монтирует FloorViewerPage
  View->>Hook: useFloorViewer()
  Hook->>API: fetch (без Authorization)
  API->>Svc: list_published()
  Svc->>DB: SELECT buildings JOIN floors JOIN sections WHERE recon.status='Done'
  DB-->>Svc: rows
  Svc-->>API: PublicBuilding[]
  API-->>Hook: 200 JSON
  Hook->>Hook: auto-select first building/floor/section
  Hook-->>View: catalog + activeMeshUrl
  View-->>U: header «← ДВФУ > Корпус D», 3D-сцена грузится
```

**Error / Edge cases:**

| Условие | Поведение |
|---|---|
| Каталог пуст (нет опубликованных зданий) | Страница рисует пустое состояние с подсказкой «Нет доступных зданий» (новый UI-элемент) |
| Сервер вернул 500 | Toast «Не удалось загрузить каталог зданий» + кнопка «Повторить» |
| Сервер вернул 401 (регресс auth-правки) | НЕ редиректить на /login с публичной страницы — см. ADR-2 |
| Здание ДВФУ есть, но ни у одного отсека нет mesh_url_glb | Страница показывает селекторы, но `MeshViewer` без url → placeholder «Модель ещё не готова» |
| Очень большой GLB (>50 МБ) | Spinner на время загрузки `useGLTF` (уже реализован Suspense) |

---

## Use Case 2 — «Построить маршрут между комнатами»

```mermaid
sequenceDiagram
  actor U as Anon User
  participant View as FloorViewerPage
  participant RI as RouteInputs
  participant Hook as useFloorViewer
  participant NavAPI as POST /navigation/multifloor-route
  participant Svc as NavService
  participant Mini as FloorMinimap
  participant Path as NavigationPath

  U->>RI: вводит «301» → автокомплит предлагает «D-7-4 / 301»
  U->>RI: выбирает подсказку → задаёт from
  U->>RI: аналогично выбирает to
  U->>RI: клик «Построить маршрут»
  RI->>Hook: planRoute(fromRef, toRef)
  Hook->>NavAPI: { building_id, from_recon_id, from_room_id, to_recon_id, to_room_id }
  NavAPI->>Svc: find_multifloor_route(...)
  Svc-->>NavAPI: { status, path_segments[], transitions_used[], from_room_3d, to_room_3d }
  NavAPI-->>Hook: 200 MultifloorRouteResponse
  Hook->>Hook: reconstruction_id → section_id, set highlightedSectionIds
  Hook-->>Mini: highlight отсеков маршрута
  Hook-->>Path: coordinates[] + endpoints
  Path-->>U: оранжевый сплайн поверх 3D
```

**Error / Edge cases:**

| Условие | HTTP | Поведение фронта |
|---|---|---|
| Комнаты в разных зданиях | — | Локально в `planRoute` валидируем → toast «Маршрут только в пределах одного здания» |
| `status='no_path'` | 200 | Toast «Маршрут не найден между этими помещениями» |
| Комната не найдена (id невалиден) | 404 | Toast «Не удалось найти комнату» |
| Сервер 500 | 500 | Toast «Ошибка построения маршрута» |
| Пользователь меняет селектор корпус/этаж/отсек после построения | — | Сбрасываем `highlightedSectionIds` и `routeSegments` (текущее поведение [useFloorViewer.ts](frontend/src/hooks/useFloorViewer.ts)) |
| Поля пустые | — | Кнопка disabled |
| Маршрут через лестницу/лифт между этажами | 200 | Отрисовываем все `path_segments`, на каждом этаже своя минимапа подсветка |

---

## Use Case 3 — «Переключение корпус / этаж / отсек»

```mermaid
sequenceDiagram
  actor U
  participant Sel as BuildingFloorSectionSelector
  participant Hook as useFloorViewer
  participant Mini as FloorMinimap
  participant Mesh as MeshViewer

  U->>Sel: клик стрелки/номера корпуса
  Sel->>Hook: selectBuilding(id)
  Hook->>Hook: auto-pick floor (ADR-22 — сохранить номер если возможно)
  Hook->>Hook: auto-pick section
  Hook-->>Sel: visibleFloors/visibleSections обновились
  Hook-->>Mini: новые секции
  Hook-->>Mesh: новый activeMeshUrl
  Mesh-->>U: новая 3D-сцена
```

Edge: переключение во время незавершённого `planRoute()` — отмена не нужна, ответ просто будет проигнорирован, т.к. `highlightedSectionIds` уже очистится. Уже работает в текущем хуке.

---

## Use Case 4 — «Авторизованный admin открывает /viewer»

После снятия auth с публичной ручки admin должен иметь идентичный опыт:
- `apiService.ts` всё равно подставит `Bearer` (если токен есть) — бэкенд должен его проигнорировать, а не валидировать.
- Решение: оставляем `Depends(security)` только в ветке `published=false`. См. [03-decisions.md](03-decisions.md) ADR-1.
