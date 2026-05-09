# Phase 07: AdminBuildingsPage

phase: 07
layer: frontend feature (admin)
depends_on: 06
design: ../02-behavior.md §UC-01, §UC-02

## Goal

Страница `/admin/buildings` — список корпусов, создание, редактирование, удаление; внутри карточки корпуса — управление этажами.

## Context from Phase 06

Доступны `buildingsApi`, `floorsApi`, типы `Building`, `Floor`. Существует `AppLayout` и стилизация в стиле других admin-страниц (DashboardPage).

## Files to Create

### `frontend/src/hooks/useBuildings.ts`
```typescript
interface UseBuildingsReturn {
  buildings: Building[];
  isLoading: boolean;
  error: string | null;
  create: (req: BuildingCreateRequest) => Promise<void>;
  update: (id: number, req: BuildingUpdateRequest) => Promise<void>;
  remove: (id: number) => Promise<void>;
  reload: () => Promise<void>;
}
export const useBuildings = (): UseBuildingsReturn => { /* fetches list, exposes mutations */ }
```

### `frontend/src/hooks/useFloors.ts`
Аналогично — для этажей конкретного корпуса:
```typescript
export const useFloors = (buildingId: number | null): UseFloorsReturn => { ... }
```

### `frontend/src/pages/AdminBuildingsPage.tsx` + `.module.css`
**Структура:**
- Заголовок "Корпуса" + кнопка "Добавить корпус"
- Список карточек корпусов (Card для каждого Building):
  - code, name, address, дата создания
  - Кнопки: Редактировать, Удалить (с подтверждением!)
  - Раскрывающаяся секция этажей: список Floor.number + кнопка "Добавить этаж"
- Модалка "Создать корпус" (форма code/name/address, валидация code regex `^[A-Za-z]{1,5}$`)
- Модалка "Создать этаж" (number 0..50)
- Подтверждение удаления (модалка с предупреждением о каскаде на этажи и секции)

**Реализация:** state — через `useBuildings` + локальный `useState` для модалок. Никакой бизнес-логики в компоненте, кроме UX-валидации.

## Files to Modify

### `frontend/src/App.tsx`
**What changes:** добавить route `<Route path="buildings" element={<AdminBuildingsPage />} />` внутри `/admin` group (после `pending-users`).

### `frontend/src/pages/DashboardPage.tsx` (если есть навигация)
**What changes:** добавить ссылку «Корпуса» в админ-меню, если такое есть. Иначе — навигация в `AppLayout`.

## Tests

Файл `frontend/src/hooks/useBuildings.test.ts` — minimal smoke (опционально):
- mock `buildingsApi`, проверить что `create` дёргает API и обновляет список

UI-тесты не обязательны для admin CRUD (manual smoke в Phase 11/finale).

## Verification

- [ ] `npm run build` зелёный
- [ ] `npm run lint` без warnings
- [ ] Manual: открыть `/admin/buildings`, создать корпус "TEST" → виден в списке
- [ ] Manual: создать этаж 5 в "TEST" → виден внутри карточки
- [ ] Manual: удалить корпус "TEST" с подтверждением → исчез
- [ ] Manual: попытка создать дубль code "TEST" → toast "уже существует"
