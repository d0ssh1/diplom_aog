# Phase 1: Hook + Page + Routing

phase: 1
layer: frontend
depends_on: none

## Goal

Реализовать страницу `/admin/route-test`: хук состояния + UI-сборка из существующих
компонентов + регистрация роута.

## Files to Create

### `frontend/src/hooks/useRouteTest.ts`

**Purpose:** инкапсулировать всю логику состояния + API.

**Implementation details:**
- Без импортов из `components/`, `pages/` или Three.js. Только axios + типы.
- State (через `useState`):
  - `buildings: BuildingListItem[]`
  - `buildingId: string | null`
  - `floors: ReconstructionListItem[]`
  - `fromReconId: number | null`, `toReconId: number | null`
  - `fromMeshUrl: string | null`
  - `fromRooms: RoomLabel[]`, `toRooms: RoomLabel[]`
  - `fromRoom: string`, `toRoom: string`
  - `routeResult: MultifloorRouteResponse | null`
  - `isLoading: boolean`
  - `error: string | null`
- Эффекты:
  - mount → `transitionsApi.listBuildings()` → `setBuildings`
  - изменение `buildingId` → `reconstructionApi.getReconstructionsByBuilding(id)` → setFloors; сбрасываем room-выборы; default fromReconId = floors[0]?.id, toReconId = floors[1]?.id ?? floors[0]?.id
  - изменение `fromReconId` → fetch reconstruction (mesh url) + vectors (rooms)
  - изменение `toReconId` → fetch vectors (rooms)
  - все 4 поля заполнены (`buildingId, fromReconId, fromRoom, toReconId, toRoom`) → POST multifloor-route
- Race-protection: `useRef<number>` token (incrementing), при возврате async — проверка токена.
- Возвращает: `{ buildings, buildingId, setBuildingId, floors, fromReconId, toReconId, setFromReconId, setToReconId, fromMeshUrl, fromRooms, toRooms, fromRoom, toRoom, setFromRoom, setToRoom, routeResult, isLoading, error }`.
- Тип `RoomLabel` берётся из `types/reconstructionVectors.ts` (или `types/wizard.ts` `RoomAnnotation` — что подходит для `RouteBottomBar`).
  - `RouteBottomBar` принимает `RoomAnnotation[]` (id, name, room_type). Мы должны привести rooms из `getReconstructionVectors` к этому формату — обёртка-маппер внутри хука.

### `frontend/src/pages/RouteTestPage.tsx`

**Purpose:** layout + соединение хука с компонентами.

**Implementation details:**
- Использует `useRouteTest()`.
- Top-bar: селектор здания (нативный `<select>`) + label.
- Center: `<MeshViewer url={fromMeshUrl} />` если URL есть, иначе placeholder.
  - В качестве `children` передаём `<MultifloorNavigationPath />` если `routeResult.status === 'success'`.
- Bottom: `<RouteBottomBar multifloorMode availablePlans=floors fromReconId toReconId onFromReconChange onToReconChange ... />`.
  - `rooms` — это `[...fromRooms, ...toRooms]` (RouteBottomBar использует общий список — внутри сам матчит по id; но т.к. id комнат уникальны в пределах reconstruction и могут совпадать между этажами, лучше: показывать `fromRooms`, потому что внутри bar один список используется и для "От" и для "До" с фильтром `id !== fromRoom`).
  - **Решение:** сначала MVP — показываем `fromRooms` для "От" и считаем что для "До" будут видны только rooms с этажа "От", что неправильно.
  - **Правильное решение:** объединяем `fromRooms` и `toRooms`, ID-конфликт исключён в пределах одного запроса (id комнат — UUID-строки, уникальны глобально). Сделать так: `rooms = unique([...fromRooms, ...toRooms]) by id`.
- HUD-сообщения для error/no_path.
- Кнопка `onPrev` → navigate('/admin').
- `onNext` отключена (`isNextDisabled=true`) — кнопка нужна только для совместимости.

### `frontend/src/pages/RouteTestPage.module.css`

**Purpose:** flex-layout страницы (top bar / center viewer / bottom bar).
- `.page { display: flex; flex-direction: column; height: 100vh; }`
- `.topBar { padding 12px; flex-shrink:0; display:flex; gap:12px; align-items:center; background:#f5f5f5; border-bottom:1px solid #ddd; }`
- `.viewer { flex: 1; position: relative; min-height: 0; }`
- `.placeholder { display: flex; align-items: center; justify-content: center; color: #888; height: 100%; }`
- `.errorHud { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); background: rgba(220, 53, 69, 0.9); color: white; padding: 8px 16px; border-radius: 4px; }`
- `.select { padding: 6px 10px; }`

## Files to Modify

### `frontend/src/App.tsx`

**What changes:**
- Импортировать `RouteTestPage`.
- Внутри `<Route path="/admin" element={<AppLayout />}>` добавить `<Route path="route-test" element={<RouteTestPage/>}/>` (если совместимо с layout) — однако `EditPlanPage` и `TransitionsPage` зарегистрированы как полностраничные ВНЕ AppLayout. Эта страница тоже full-screen — регистрируем как `<Route path="/admin/route-test" element={<RouteTestPage/>}/>` после `/admin/transitions/:buildingId`.

## Verification

- [ ] `npx tsc --noEmit` (из `frontend/`) — 0 ошибок
- [ ] `npm run lint` (если настроен) — 0 ошибок
- [ ] Страница доступна вручную через `/admin/route-test`
- [ ] Перебор пары этажей в одном здании показывает T-маркер
- [ ] Хук не импортирует Three.js / `*.tsx`
- [ ] Все Three.js dispose отрабатывают (через существующие компоненты — гарантировано)
