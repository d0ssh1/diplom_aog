# Behavior: test-route

## DFD — Test Route Flow

```mermaid
flowchart LR
  user([Admin]) -->|select building| page[RouteTestPage]
  page --> hook[useRouteTest]
  hook -->|GET /buildings| api[(API)]
  api -->|building list| hook
  hook -->|GET /buildings/:id/reconstructions| api
  api -->|floors| hook
  hook -->|GET /reconstructions/:id| api
  api -->|mesh url| hook
  hook -->|GET /reconstructions/:id/vectors| api
  api -->|rooms[]| hook
  user -->|select rooms| page
  hook -->|POST /navigation/multifloor-route| api
  api -->|MultifloorRouteResponse| hook
  hook -->|state| page
  page -->|render| viewer[MeshViewer + MultifloorNavigationPath]
```

## Sequence: Happy Path

```mermaid
sequenceDiagram
  actor U as User
  participant P as RouteTestPage
  participant H as useRouteTest
  participant API as API

  U->>P: navigate /admin/route-test
  P->>H: mount
  H->>API: GET /buildings
  API-->>H: BuildingListItem[]
  H-->>P: state.buildings

  U->>P: select buildingId
  P->>H: setBuildingId(id)
  H->>API: GET /reconstruction/buildings/{id}/reconstructions
  API-->>H: ReconstructionListItem[] (status=ready)
  H-->>P: state.floors (default fromId=floors[0], toId=floors[1] || floors[0])

  par from-floor data
    H->>API: GET /reconstruction/reconstructions/{fromId}
    API-->>H: { url: meshUrl }
    H->>API: GET /reconstruction/reconstructions/{fromId}/vectors
    API-->>H: { rooms: [...] } -> fromRooms
  and to-floor data
    H->>API: GET /reconstruction/reconstructions/{toId}/vectors
    API-->>H: { rooms: [...] } -> toRooms
  end

  U->>P: pick fromRoom + toRoom
  P->>H: trigger find (auto via RouteBottomBar effect)
  H->>API: POST /navigation/multifloor-route { building_id, from_recon, from_room, to_recon, to_room }
  API-->>H: MultifloorRouteResponse(status=success, path_segments, transitions_used)
  H-->>P: state.routeResult
  P->>P: render MeshViewer + MultifloorNavigationPath
```

## Error / Edge Cases

| Condition | UI Behavior |
|-----------|-------------|
| `GET /buildings` fails | HUD: "Ошибка загрузки зданий" |
| Здание без этажей | селекторы пусты, кнопка disabled |
| Только 1 этаж | то же значение в обоих селекторах допускается; multifloor backend вернёт `no_path` или single-floor route — обрабатываем status |
| `meshUrl == null` (не построено) | placeholder "3D-модель не готова" |
| Rooms list пуст | селекторы комнат пусты, кнопка не сработает |
| `multifloorRoute` returns `status=no_path` | HUD: "Маршрут не найден" |
| `multifloorRoute` throws | HUD: "Ошибка запроса маршрута" |
| Смена этажа "От" во время загрузки | сбрасываем routeResult, начинаем новый fetch |
| Размонтирование во время fetch | stale-fetch guard через ref `mountedRef` |

## State Machine (high-level)

```mermaid
stateDiagram-v2
  [*] --> LoadingBuildings
  LoadingBuildings --> Idle: buildings ok
  LoadingBuildings --> ErrorBuildings: fetch fail
  Idle --> LoadingFloors: select building
  LoadingFloors --> Ready: floors+mesh+rooms loaded
  Ready --> Routing: from+to rooms selected
  Routing --> RouteOk: 200 success
  Routing --> RouteNoPath: 200 no_path
  Routing --> RouteError: throw / 5xx
  RouteOk --> Routing: change selection
  RouteNoPath --> Routing: change selection
  RouteError --> Routing: change selection
```
