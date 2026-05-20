# Phase 6: Transitions UI redesign (brutalism, jump-flow)

phase: 6
layer: frontend + backend (thin)
depends_on: [phase-04]
design: ../README.md
status: draft

## Goal
Заменить текущий placeholder-UI страницы `/admin/transitions` на полноценный редактор по референс-дизайну (brutalism-стиль): 2-уровневая навигация "Здания → Этажи" с коллапсируемым сайдбаром, реальный canvas с фоном-картинкой плана, модалка параметров телепорта, jump-flow для создания связанных пар (draft → placing_exit → linked), док-бар инструментов Перемещение/Добавить/Удалить/Завершить. Попутно закрыть несколько накопленных дефектов (дубликат endpoint, `rotation_angle`-баг, отсутствие `/buildings` endpoint, потеря target-hint при F5).

## Context

После фазы 4 существует рабочий backend (`TransitionGroup` + `TransitionPoint`, все CRUD-endpoints, scaffold `/navigation/route/multi`) и shell-UI с компонентами `FloorTree / GroupPanel / TransitionCanvas / LinkPointDialog`. UI не позволяет кликать по реальному плану, требует ручного ввода `x/y`, и его ментальная модель ("сначала выбери группу, потом добавь точку") не совпадает с тем, как пользователь думает о задаче.

Референс-дизайн мыслит **парами телепортов** (A ↔ B) и использует **jump-flow**: ставишь draft на плане этажа 1 → указываешь в модалке целевой этаж → кликаешь на draft → UI прыгает на целевой этаж → кликаешь куда поставить парный → оба становятся linked. Это сильно естественнее.

### Решения, зафиксированные в обсуждении

1. **Модель данных на бэке остаётся групповой** (`TransitionGroup` с N точек). UI MVP показывает только пары (каждая группа = 2 точки). Расширение на мульти-точечные группы (лифт на N>2 этажей) — отдельный тикет позже. Супер-граф продолжит работать для любых размеров групп.
2. **UI переписывается полностью.** Старые компоненты `FloorTree`, `GroupPanel`, `LinkPointDialog` удаляются. `TransitionCanvas`, `TransitionMarker`, `TransitionsPage.tsx`, `useTransitions.ts`, `TransitionsPage.module.css` — полная перезапись. `types/transitions.ts` и `api/transitionsApi.ts` — расширяются.
3. **Фон canvas — реальная картинка плана** (`Reconstruction.plan_file.url`). SVG-заглушки из референса — декорация для демо, не переносим.
4. **Target-этаж draft-точки хранится в `TransitionGroup`** через два nullable поля `target_hint_building_id` / `target_hint_floor_number`, иначе F5 ломает flow.

### Расхождения с текущим состоянием, обнаруженные при ревью

- **`frontend/src/hooks/useTransitions.ts:71`** использует `r.rotation_angle || r.id` как номер этажа. Правильно — `r.floor_number` из `ReconstructionListItem`. Баг, приводящий к нелогичным подписям.
- **`POST /navigation/route/multi` продублирован** в `backend/app/api/transitions.py:123` и `backend/app/api/navigation.py:31-37`. Оставляем только в `navigation.py` (семантически правильное место).
- **Endpoint `GET /buildings` отсутствует.** Сайдбар референса требует список зданий с их этажами — придётся создать.
- **`Reconstruction.floor_id` FK не был добавлен** на фазе 1 (был в исходном плане, реально пропущен). Сейчас денормализованные `building_id: String` + `floor_number: Integer` остаются источником истины. **Не трогаем** в этой фазе — работает и так.

---

## User flow (цель)

1. Пользователь открывает `/admin/transitions` → сайдбар показывает список зданий, канвас пустой с надписью "ВЫБЕРИТЕ ЭТАЖ В ЛЕВОМ МЕНЮ".
2. Клик по зданию → URL меняется на `/admin/transitions/:buildingId`, сайдбар переключается на список этажей этого здания + кнопка "Назад к зданиям". Сайдбар можно свернуть кнопкой-chevron.
3. Клик по этажу → канвас загружает `Reconstruction.plan_file.url` как фон, рендерит поверх маркеры всех телепортов этого этажа.
4. Инструмент "Добавить телепорт" → курсор crosshair. Клик по плану → открывается brutalism-модалка: имя узла, целевое здание, целевой этаж. "Создать драфт" → на плане появляется оранжевый маркер (`DoorOpen` icon) с подписью.
5. F5 → оранжевый маркер остаётся оранжевым, target-направление сохраняется в группе.
6. Клик по оранжевому маркеру → режим `placing_exit`: сверху появляется оранжевая плашка "Укажите точку выхода для: <имя>" с `Crosshair` (animate-pulse) и кнопкой "Отменить привязку". UI автоматически прыгает на target-этаж.
7. Клик по плану target-этажа → создаётся парная точка в той же группе. Оба маркера становятся зелёными (`linked`). Плашка исчезает, инструмент сбрасывается на "Перемещение".
8. "Отменить привязку" → возвращаемся на исходный этаж, draft остаётся draft.
9. Инструмент "Удалить" → клик по маркеру → точка удаляется. Если в группе осталось 0 точек — группа удаляется каскадом (backend чистит). Если осталась 1 — она становится draft (оранжевый).
10. "Завершить работу" → `navigate('/admin')`.

### Что **НЕ** входит в фазу
- Мульти-точечные группы (лифт на N>2 этажей).
- Реальная route-композиция в `route_multi` (остаётся scaffold — [phase-05 или отдельный тикет]).
- Snap-to-graph валидация при `create_point`.
- Отдельная route-test страница для мульти-план маршрутов.
- `Reconstruction.floor_id` FK миграция.
- CRUD-страница для Building/Floor записей.

---

## Files to Create

### `backend/app/api/buildings.py`
**Purpose:** Endpoint `GET /buildings` для списка зданий со структурой этажей.
**Implementation details:**
- `APIRouter(prefix="/buildings", tags=["buildings"])`.
- Единственный endpoint `GET /` → `list[BuildingListItem]`.
- Источник данных — `ReconstructionRepository.get_saved()`: берём все сохранённые реконструкции, группируем по `building_id`, в каждой группе сортируем этажи по `floor_number`. Если у реконструкции `building_id` или `floor_number` — `None`, пропускаем.
- Имя здания = его `building_id` (строка, поскольку отдельной таблицы `Building` с именами пока нет).
- Для каждого этажа возвращаем `FloorListItem(number, reconstruction_id, reconstruction_name)`.
- Инъекция репозитория — через `Depends(get_reconstruction_repo)`.

### `backend/app/models/building_list.py` (или расширение существующего `models/building.py`)
**Purpose:** Pydantic `BuildingListItem` и `FloorListItem` для `/buildings` endpoint.
**Implementation details:**
- `FloorListItem`: `number: int`, `reconstruction_id: int`, `reconstruction_name: str | None`.
- `BuildingListItem`: `id: str`, `name: str`, `floors: list[FloorListItem]`.
- Стиль — Pydantic v2, `model_config = ConfigDict(from_attributes=True)` если нужно. В данном случае создаём руками из ORM в API, `from_attributes` не обязателен.

### `backend/alembic/versions/<ts>_transition_group_target_hints.py`
**Purpose:** Добавить в `transition_groups` два nullable поля для запоминания target-направления draft-точки.
**Implementation details:**
- `op.add_column('transition_groups', sa.Column('target_hint_building_id', sa.String(50), nullable=True))`.
- `op.add_column('transition_groups', sa.Column('target_hint_floor_number', sa.Integer(), nullable=True))`.
- `downgrade()` зеркальный.

### `frontend/src/components/Transitions/TransitionsSidebar.tsx`
**Purpose:** Левая навигация (2 уровня: Buildings → Floors) с коллапсом.
**Implementation details:**
- Props: `{ buildings, selectedBuildingId, onSelectBuilding, onBackToBuildings, activeFloorNumber, onSelectFloor, isSidebarOpen, onToggleSidebar, mode }`.
- Два состояния:
  - `!selectedBuildingId` — рендерим список зданий (каждое — кнопка с иконкой `Box`).
  - `selectedBuildingId` — кнопка "Назад к зданиям" (disabled при `mode === 'placing_exit'`) + заголовок здания + список этажей (кнопка с иконкой `Layers`, активный — оранжевый).
- Коллапс: ширина sidebar переключается между `w-72` и `w-16`, подписи скрываются через `max-w` transitions. Chevron-кнопка `ChevronLeft` / `Menu` из lucide-react.
- При `mode === 'placing_exit'` — этажи кроме активного получают `opacity-30 cursor-not-allowed`, кликабелен только активный floor (и то — нельзя менять, он уже выбран при jump).

### `frontend/src/components/Transitions/PlacingBanner.tsx`
**Purpose:** Оранжевая плашка-прицеливание, видимая в режиме `placing_exit`.
**Implementation details:**
- Props: `{ sourceTeleportLabel, onCancel }`.
- Фон `#FF4500`, чёрный текст, `border-b-4 border-black`.
- Слева — `Crosshair` с `animate-pulse`, два текстовых блока: "Укажите точку выхода для: <label>" и подсказка "Кликните на текущий план…".
- Справа — кнопка "Отменить привязку" (чёрный фон, белый текст, на hover инвертируется).

### `frontend/src/components/Transitions/ToolDock.tsx`
**Purpose:** Нижний док-бар с инструментами и кнопкой "Завершить работу".
**Implementation details:**
- Props: `{ activeTool, onToolChange, onFinish, disabled }`.
- Три кнопки инструмента (left-aligned): `Hand` → Перемещение, `DoorOpen` → Добавить телепорт, `Trash2` → Удалить (с разделителем перед удалением). Активная кнопка — с оранжевой рамкой и фоном `bg-[#FF4500]/10`. Delete-активный — красная рамка и фон.
- Справа — кнопка "Завершить работу" с `Save` иконкой, оранжевый фон, brutalism-shadow `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`, hover — сдвиг.
- Когда `disabled=true` (режим `placing_exit`) — `opacity-30 pointer-events-none`.

### `frontend/src/components/Transitions/TeleportModal.tsx`
**Purpose:** Brutalism-модалка для параметров нового телепорта.
**Implementation details:**
- Props: `{ open, buildings, defaultBuildingId, onCancel, onConfirm }`. `onConfirm` получает `{ label, target_building_id, target_floor_number }`.
- Фиксированный overlay (`absolute inset-0 bg-black/80 backdrop-blur-sm`).
- Карточка: `bg-white border-4 border-black shadow-[16px_16px_0px_0px_#FF4500]`, max-w-lg, padding-10.
- Поля:
  - Label (text, `autoFocus`).
  - Target building (`select` по `buildings`).
  - Target floor (`select` по `buildings.find(b => b.id === targetBuilding).floors`).
- При смене target building первый этаж target-здания выбирается автоматически (`useEffect`).
- Кнопки: "Отмена" (flex-1) и "Создать драфт" (flex-[2], оранжевый, brutalism-shadow).

### `frontend/src/hooks/useTransitions.ts` (полная перезапись)
**Purpose:** Оркестрация состояния страницы в новой ментальной модели "телепорт-пара".
**Implementation details:**
- Сигнатура: `useTransitions(initialBuildingId?: string)`.
- Внутреннее состояние:
  - `buildings: BuildingListItem[]`
  - `selectedBuildingId: string | null`
  - `activeFloorNumber: number | null`
  - `teleports: TeleportView[]`
  - `mode: 'normal' | 'placing_exit'`
  - `linkingPointId: number | null`
  - `isLoading: boolean`
- Computed:
  - `activeBuilding = buildings.find(b => b.id === selectedBuildingId)`
  - `activeFloor = activeBuilding?.floors.find(f => f.number === activeFloorNumber)`
  - `activeReconstructionId = activeFloor?.reconstruction_id ?? null`
  - `teleportsOnActiveFloor = teleports.filter(t => t.reconstruction_id === activeReconstructionId)`
- Эффекты:
  - При mount → `transitionsApi.listBuildings()` → `setBuildings`.
  - При смене `selectedBuildingId` → параллельная загрузка: `listGroupsByBuilding`, `listPointsByBuilding`. Затем `composeTeleports(groups, points, buildings)` собирает `TeleportView[]`.
- Метод `composeTeleports`:
  - Для каждой `TransitionPoint` находим её группу.
  - `status = (group.point_ids.length === 1) ? 'draft' : 'linked'`.
  - Если `status === 'linked'`: `linked_point_id` = **другая** точка группы (не текущая); `target_building_id / target_floor_number / target_reconstruction_id` выводятся из реконструкции той `linked_point`, ищем в `buildings`.
  - Если `status === 'draft'`: target читаем из `group.target_hint_building_id / target_hint_floor_number`, находим соответствующий floor в `buildings` для `target_reconstruction_id`.
- Методы:
  - `createDraft({ reconstructionId, x, y, label, target_building_id, target_floor_number })` — POST group с `target_hint_*`, POST point в ней → reload teleports.
  - `createLinkedCounterpart({ groupId, reconstructionId, x, y })` — POST point в группу → reload teleports → сбросить `mode/linkingPointId`.
  - `deletePoint(pointId)` — DELETE point → reload. (Cleanup пустой группы делает backend service.)
  - `startLinking(teleport)` — `setMode('placing_exit')`, `setLinkingPointId(teleport.id)`, `setSelectedBuildingId(teleport.target_building_id)`, `setActiveFloorNumber(teleport.target_floor_number)`.
  - `cancelLinking()` — возвращаем на исходный `building/floor` из `teleports.find(t => t.id === linkingPointId)?.reconstruction_id`, сбрасываем mode/linkingPointId.
- Возврат: всё перечисленное выше + `isLoading`, `reload()`.

### `frontend/src/pages/TransitionsPage.tsx` (полная перезапись)
**Purpose:** Shell, композирующий sidebar + canvas + dock + banner + modal.
**Implementation details:**
- Читает `buildingId` из `useParams`, использует `useNavigate`.
- Вызывает `useTransitions(buildingId)`.
- Синхронизирует `selectedBuildingId` с URL:
  - При `selectedBuildingId` меняется → `navigate('/admin/transitions/' + id)` или `navigate('/admin/transitions')` (при `null`).
- Локальное состояние:
  - `activeTool: 'pan' | 'teleport' | 'delete'` (default `'pan'`).
  - `isSidebarOpen: boolean` (default `true`).
  - `modalOpen: boolean`, `draftCoords: {x, y} | null`.
- Handlers:
  - `handleCanvasClick(x_norm, y_norm)`:
    - Если `mode === 'normal' && activeTool === 'teleport'` → `setDraftCoords({x_norm, y_norm})`, `setModalOpen(true)`.
    - Если `mode === 'placing_exit'` → `createLinkedCounterpart({ groupId: sourceTeleport.group_id, reconstructionId: activeReconstructionId, x: x_norm, y: y_norm })`, `setActiveTool('pan')`.
  - `handleMarkerClick(teleport)`:
    - Если `activeTool === 'delete'` → `deletePoint(teleport.id)`.
    - Если `mode === 'normal' && teleport.status === 'draft'` → `startLinking(teleport)`, `setActiveTool('teleport')`.
  - `handleModalConfirm({ label, target_building_id, target_floor_number })` → `createDraft(...)`, закрываем модалку, `setActiveTool('pan')`.
- Layout: из референса — `h-screen flex flex-col bg-black`, TopBar сверху (используем существующий `TopBar` или простой header — см. проверку фактического наличия компонента), затем `PlacingBanner` (если в placing-режиме), затем `flex flex-1` с sidebar + column (canvas + dock), затем модалка в `z-50`.

### `frontend/src/pages/TransitionsPage.module.css` (перезапись)
**Purpose:** Tailwind в референсе — но в этом проекте используются CSS-modules. Переносим brutalism-стили референса на classNames + module-CSS где это уместно.
**Implementation details:**
- Fallback: если Tailwind уже подключён в проекте — использовать как в референсе. Если нет — перенести нужные стили в `.module.css` (сетка grid 72px/1fr, grid overlay, orange/black colors, cursor states, shadows).
- Проверить в `frontend/src/index.css` и `tailwind.config.*`, используется ли Tailwind. Если нет — оставить module-CSS и guarded-классы.

### `frontend/src/components/Transitions/TransitionCanvas.tsx` (полная перезапись)
**Purpose:** Центральный канвас с фоном-картинкой плана + оверлеем маркеров + курсором-инструментом.
**Implementation details:**
- Props: `{ reconstruction, teleports, mode, activeTool, onCanvasClick, onMarkerClick }`.
- Контейнер с `position: relative`, центрирует дочернюю картинку.
- Сетка-фон контейнера (как в референсе — `linear-gradient` pattern) под картинкой.
- `<img ref={imgRef} src={reconstruction.plan_file.url} className="max-w-[95%] max-h-[90vh] object-contain border-4 border-black" />`.
  - Если в `ReconstructionListItem` нет `plan_file.url` — дополнительный fetch через `reconstructionApi.getReconstructionById(reconstruction.id)` при смене реконструкции, берём оттуда. Проверить, что уже возвращает endpoint.
  - Fallback: `preview_url` если `plan_file.url` недоступен.
- Курсор:
  - `mode === 'placing_exit'` → `cursor-crosshair` + рамка контейнера оранжевая.
  - `activeTool === 'teleport'` → `cursor-crosshair`.
  - `activeTool === 'pan'` → `cursor-grab`.
  - `activeTool === 'delete'` → курсор дефолтный, маркеры при hover краснеют.
- Клик по картинке:
  - Рассчитываем нормализованные координаты от `imgRef.current.getBoundingClientRect()` (учёт `object-fit: contain` — letterbox игнорируется, клики вне картинки не считаются).
  - `x_norm = (e.clientX - rect.left) / rect.width`, аналогично `y_norm`.
  - Проверка `0 <= x_norm <= 1` — иначе return.
  - Вызов `onCanvasClick(x_norm, y_norm)`.
- Рендер маркеров: для каждого `TeleportView` в `teleports`:
  - `<TransitionMarker teleport={t} activeTool={...} mode={...} onClick={...} />`.
  - Позиционирование: `left: ${t.position_x * 100}%`, `top: ${t.position_y * 100}%`, `transform: translate(-50%, -50%)`.
- Пустое состояние: если `reconstruction` нет — большой placeholder с `MapPin` и текстом "ВЫБЕРИТЕ ЭТАЖ В ЛЕВОМ МЕНЮ".

### `frontend/src/components/Transitions/TransitionMarker.tsx` (полная перезапись)
**Purpose:** Визуальный маркер одной точки телепорта.
**Implementation details:**
- Props: `{ teleport: TeleportView, activeTool, mode, onClick }`.
- Цвета:
  - `teleport.status === 'draft'` → фон `bg-[#FF4500]/20`, рамка `border-[#FF4500]`, текст `text-[#FF4500]`.
  - `teleport.status === 'linked'` → фон `bg-green-500/20`, рамка `border-green-500`, текст `text-green-500`.
  - `activeTool === 'delete'` на hover → `hover:bg-red-500/50 hover:border-red-500 hover:text-white`.
- Иконка: `Trash2` если `activeTool === 'delete'`, иначе `DoorOpen`. Размер 24.
- Cursor: `pointer` если `activeTool === 'delete'` или `(mode === 'normal' && teleport.status === 'draft')`; иначе `default`.
- Подпись — чёрная плашка ниже иконки, с `teleport.label ?? 'TP_' + teleport.id`.
- Hover-scale: `hover:scale-110 transition-transform`.

---

## Files to Modify

### `backend/app/db/models/transition.py`
**What changes:**
- В `TransitionGroup` добавить:
  ```python
  target_hint_building_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
  target_hint_floor_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
  ```
- Поля nullable — у пользовательской сессии target известен при создании draft, но для существующих записей из фазы 4 они `NULL`.

### `backend/app/models/transition.py`
**What changes:**
- `TransitionGroupCreate`: добавить `target_hint_building_id: str | None = None` и `target_hint_floor_number: int | None = None`.
- `TransitionGroupResponse`: добавить те же поля.
- `TransitionGroupUpdate`: добавить (чтобы UI мог переписать target, если пользователь передумал).

### `backend/app/db/repositories/transition_repo.py`
**What changes:**
- `create_group` принимает `target_hint_building_id`, `target_hint_floor_number` и пишет их.
- `update_group` принимает те же + `type` + `label`.

### `backend/app/services/transition_service.py`
**What changes:**
- `create_group` пробрасывает новые поля в repo.
- `delete_point`: после успешного удаления проверяем, остались ли точки в группе. Если `len(group.points) == 0` — удаляем группу через `delete_group`. Лог warning, если ошибка.
- `update_group` принимает и пробрасывает target_hint_*.

### `backend/app/api/transitions.py`
**What changes:**
- **УДАЛИТЬ** endpoint `POST /route/multi` (~строки 123+) — дубликат того, что уже в `navigation.py`.
- `POST /transitions/groups` и `PATCH /transitions/groups/{id}` — принимать новые поля автоматически через обновлённый Pydantic.

### `backend/app/api/__init__.py`
**What changes:** 
- Подключить `buildings_router` (`include_router(buildings_router)`).
- Убедиться, что `navigation_router` подключён и обслуживает `/navigation/route/multi`.

### `frontend/src/types/transitions.ts`
**What changes:**
- Добавить `target_hint_building_id: string | null` и `target_hint_floor_number: number | null` в `TransitionGroupResponse` и `TransitionGroupCreate`.
- Добавить `BuildingListItem` и `FloorListItem` (см. Pydantic-контракты выше).
- Добавить фронтовый UI-тип `TeleportView` (computed вьюха):
  ```ts
  export interface TeleportView {
    id: number;
    group_id: number;
    reconstruction_id: number;
    position_x: number;
    position_y: number;
    label: string | null;
    status: 'draft' | 'linked';
    linked_point_id: number | null;
    target_building_id: string | null;
    target_floor_number: number | null;
    target_reconstruction_id: number | null;
  }
  ```

### `frontend/src/api/transitionsApi.ts`
**What changes:**
- Добавить `listBuildings(): Promise<BuildingListItem[]>` — `GET /buildings`.
- Оставить остальные методы как есть.
- Если `createGroup` и `updateGroup` сейчас не принимают `target_hint_*` — расширить их типы.
- Убедиться, что `POST /navigation/route/multi` бьёт в `/navigation/...`, а не в `/transitions/...` (после удаления дубликата).

### `frontend/src/App.tsx`
**What changes:** 
- Роуты `admin/transitions` и `admin/transitions/:buildingId` остаются.
- `TransitionsPage` должна корректно обрабатывать отсутствие `buildingId` (initial state: список зданий).

### `frontend/src/components/Layout/Sidebar.tsx`
**What changes:** 
- Пункт "Переходы между планами" ведёт на `/admin/transitions` (без конкретного зданияа).

### `frontend/package.json`
**What changes:** 
- Убедиться, что `lucide-react` есть. Если нет — добавить. (По референсу используем большой набор иконок.)

---

## Files to Delete

- `frontend/src/components/Transitions/FloorTree.tsx` — заменён на `TransitionsSidebar`.
- `frontend/src/components/Transitions/GroupPanel.tsx` — не нужен в новой ментальной модели.
- `frontend/src/components/Transitions/LinkPointDialog.tsx` — заменён на `TeleportModal` и click-handler canvas.

---

## Ментальное соответствие референс ↔ backend

| Референс-концепт | Backend-реализация |
|------------------|---------------------|
| `Teleport` (draft) | `TransitionGroup` с 1 `TransitionPoint` + заполненные `target_hint_*` |
| `Teleport` (linked) | `TransitionGroup` с 2 `TransitionPoint` |
| `linkedNodeId` | Вычисляется на клиенте: "другая точка той же группы" |
| `targetFloorId` в референсе | `group.target_hint_floor_number` (для draft) или `linked_point.reconstruction_id` → `floor_number` (для linked) |
| Удаление пары телепортов | `DELETE /transitions/points/{id}` (cleanup пустой группы делает backend service) |

Валидно: один `TransitionGroup` = одна визуальная "пара". При F5 клиент полностью реконструирует `TeleportView[]` из `groups + points + buildings`.

---

## Verification

- [ ] `alembic upgrade head` применяется чисто на локальной SQLite; `alembic downgrade -1` откатывает поля `target_hint_*`.
- [ ] `pytest backend/tests/ -v` зелёный (237+ текущих + новые).
- [ ] Новые backend-тесты:
  - `test_transitions_api.py::test_list_buildings_groups_reconstructions_by_building_id`
  - `test_transitions_api.py::test_list_buildings_sorts_floors_by_number`
  - `test_transitions_api.py::test_list_buildings_skips_reconstructions_without_building_or_floor`
  - `test_transitions_api.py::test_create_group_accepts_and_stores_target_hints`
  - `test_transitions_api.py::test_delete_point_removes_empty_group`
  - `test_transitions_api.py::test_delete_point_keeps_nonempty_group`
  - `test_navigation_api.py::test_route_multi_reachable_only_via_navigation_prefix` (проверить, что старый `POST /transitions/route/multi` возвращает 404, а `POST /navigation/route/multi` работает).
- [ ] `npm run build --prefix frontend` зелёный.
- [ ] В коде нет `rotation_angle` в роли floor-номера (grep `rotation_angle` в `useTransitions*`).
- [ ] В `backend/app/api/transitions.py` нет handler-функции для `route/multi`.
- [ ] E2E happy-path вручную (инструкция в секции User flow выше): draft → F5 → linking → linked → delete → revert to draft.
- [ ] Layout совпадает с референсом на ±пиксель: оранжевый TopBar, 2-уровневый sidebar с коллапсом, док-бар, модалка с `shadow-[16px_16px_0px_0px_#FF4500]`.

---

## Порядок коммитов (рекомендация)

1. **PR A: `transitions: backend buildings endpoint + group target_hints + cleanup dup route_multi`** — шаги 1.1-1.6 (backend). Зелёные тесты.
2. **PR B: `transitions: UI redesign (brutalism, jump-flow)`** — всё frontend + удаление старых компонентов. 

Между PR A и PR B фронт не ломается: старый UI продолжает работать с расширенным API (новые поля optional).

---

## Risks & notes

- **Tailwind.** Референс написан на Tailwind-классах. Если проект не использует Tailwind — перенести ключевые стили (цвета, spacings, shadows) в CSS-modules, а семантические утилиты (flex/grid) оставить через обычные classNames. Проверить `tailwind.config.*` и `postcss.config.*` перед началом.
- **`plan_file.url` vs `preview_url`.** В `ReconstructionListItem` сейчас только `preview_url`. Для полного плана — нужен дополнительный fetch через `GET /reconstruction/reconstructions/{id}`, который возвращает `ReconstructionDetail` с `plan_file.url`. Сделать lazy-fetch при первом выборе этажа и кэшировать в хуке.
- **Состояние `mode === 'placing_exit'` при навигации.** Если пользователь жмёт браузерный Back в этом режиме — flow сломается. Решение: при unmount `TransitionsPage` или при смене `buildingId` в URL (если не через `startLinking`) — сбрасывать mode. Простой способ — слушать `location.pathname` в хуке.
- **Мульти-точечные группы.** Если в БД уже есть группа с 3+ точками (после ручного создания через API для тестов) — UI покажет три "linked" маркера, но они будут ссылаться друг на друга неоднозначно. Для MVP считаем, что `linked_point_id` = первая "другая" точка в группе; это корректно для парной модели. Пред-проверка: при mount предупредить в console.warn, если есть группы с >2 точек.
- **Sidebar mobile-адаптация.** Из scope исключаем — это admin-панель, только desktop.
