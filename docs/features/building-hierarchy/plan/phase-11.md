# Phase 11: FloorViewerPage (End-User)

phase: 11
layer: frontend feature (user)
depends_on: 06
design: ../02-behavior.md §UC-06, §UC-07, ADR-21, ADR-22

## Goal

Публичный экран `/viewer` — селекторы Корпус/Отсек/Этаж + мини-карта этажа + 3D-просмотр выбранного отсека. Маршрутизация (UC-07) использует существующий `MultifloorRouteResponse`.

## Context from Phase 06

`buildingsApi.listPublished(): Promise<PublicBuilding[]>` возвращает denormalized каталог (Building → Floor → Section со встроенным mesh_url_glb). Существуют `MeshViewer` (Three.js wrapper) и `useMeshViewer` хук. Для маршрута существует `apiService.buildMultifloorRoute(...)`.

## Files to Create

### `frontend/src/hooks/useFloorViewer.ts`
```typescript
interface UseFloorViewerReturn {
  catalog: PublicBuilding[];
  isLoading: boolean;
  error: string | null;

  selectedBuildingId: number | null;
  selectedFloorId: number | null;
  selectedSectionId: number | null;

  visibleFloors: FloorPublic[];          // floors of selected building
  visibleSections: SectionPublic[];      // sections of selected floor
  activeMeshUrl: string | null;          // glb URL of selected section's reconstruction

  selectBuilding: (id: number) => void;
  selectFloor: (id: number) => void;
  selectSection: (id: number) => void;

  // routing
  planRoute: (start: string, end: string) => Promise<void>;
  routeSegments: PathSegment3D[] | null;
  routeError: string | null;
  highlightedSectionIds: number[];       // sections crossed by route
}
```

**Логика:**
- `loadCatalog()` на mount — `buildingsApi.listPublished()`
- `selectBuilding`: устанавливает building, выбирает первый visibleFloor, первую visibleSection
- `selectFloor`: новый floor → пересчитать visibleSections; если activeSection.number есть — оставить; иначе fallback на первую (ADR-22 fallback logic)
- `selectSection`: обновить selectedSectionId → activeMeshUrl рассчитывается
- `planRoute(start, end)`: парсинг "D304" → buildingCode + roomNumber. Найти building по code, найти reconstruction по room (через caталог? или отдельный API call). Вызвать `buildMultifloorRoute(...)`. По segments найти sectionIds через индекс reconstructionId→sectionId.

### `frontend/src/components/FloorViewer/BuildingFloorSectionSelector.tsx` + `.module.css`
**Props:**
```typescript
interface Props {
  buildings: PublicBuilding[];
  visibleFloors: FloorPublic[];
  visibleSections: SectionPublic[];
  selectedBuildingId, selectedFloorId, selectedSectionId: number | null;
  onSelectBuilding, onSelectFloor, onSelectSection: (id: number) => void;
}
```

**Реализация:** три горизонтальные строки `< code1 code2 code3 >` (Корпус), `< 3 4 5 >` (Отсек), `< 6 7 8 >` (Этаж) — как в макете. Активный элемент с оранжевой подсветкой. Стрелки `< >` сдвигают «окно» из ≤3 значений вокруг активного.

### `frontend/src/components/FloorViewer/FloorMinimap.tsx` + `.module.css`
**Props:**
```typescript
interface Props {
  sections: SectionPublic[];           // секции активного этажа
  activeSectionId: number | null;
  highlightedSectionIds: number[];     // sections в маршруте
  onSelectSection: (id: number) => void;
}
```

**Реализация:**
- SVG-канвас с viewBox="0 0 1 1" (нормализованные координаты)
- Каждая секция — `<polygon>` или `<rect>` из geometry; обводка чёрная, заливка серая по умолчанию
- Активная: оранжевая заливка
- Highlighted (по маршруту, но не активная): оранжевый контур, серая заливка
- Цифра номера в центре (`<text>` в centroid)
- Клик по секции → `onSelectSection(id)`

### `frontend/src/pages/FloorViewerPage.tsx` + `.module.css`
**Структура (по макету):**
- Header: «← ДВФУ > Корпус {code}» (Q-8: «ДВФУ» — литерал)
- Слева: панель с inputs «Начальная точка», «Конечная точка», кнопка «Построить маршрут»; ниже — `BuildingFloorSectionSelector`; в самом низу — `FloorMinimap`
- Справа: `MeshViewer` с активным mesh URL + zoom-кнопки (+/-)
- Если activeMeshUrl null → «Выберите отсек»
- Если planRoute вернул error → toast

**Поведение:** при загрузке страницы (mount) — `loadCatalog`. Если у пользователя нет ни одного видимого корпуса → «Контент пока не загружен».

## Files to Modify

### `frontend/src/App.tsx`
**What changes:** добавить route `<Route path="/viewer" element={<FloorViewerPage />} />` (не внутри `/admin`).

### `frontend/src/pages/PublicHomePage.tsx`
**What changes:** после успешного логина user (не admin) — редирект на `/viewer`.

## Tests

`frontend/src/hooks/useFloorViewer.test.ts` — 2 теста:
- test_useFloorViewer_segment_to_section_mapping (mock catalog + route response, проверить highlightedSectionIds)
- test_useFloorViewer_published_filter_hides_empty (mock listPublished возвращает фильтрованные данные → catalog не содержит пустых)

## Verification

- [ ] `npm run build` зелёный
- [ ] `npm test` 2 теста хука зелёные
- [ ] Manual: логин user-ролью → редирект на `/viewer`
- [ ] Manual: видны только корпуса с заполненными отсеками
- [ ] Manual: клик отсека на мини-карте → меняется 3D
- [ ] Manual: клик «Построить маршрут» с двумя комнатами одного отсека → подсветка одной секции
- [ ] Manual: клик «Построить маршрут» через несколько отсеков (если есть телепорты) → подсветка нескольких
- [ ] MeshViewer корректно dispose'ит Three.js ресурсы при размонтировании страницы
