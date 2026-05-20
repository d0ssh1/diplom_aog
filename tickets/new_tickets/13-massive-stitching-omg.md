# Тикет: Transition Points — мульти-план маршрут в Diplom3D

## Контекст

Текущий подход к связи планов эвакуации — stitching: `StitchingService` склеивает несколько изображений через affine-трансформации + clipping + merge в одну большую реконструкцию. Такой подход проваливается на вертикальных связях (этажи одного здания, несколько зданий) и на лифтах/лестницах с нетривиальной cost-функцией.

Переходим на модель **точек перехода**. Каждый план остаётся независимым, пользователь размечает на нём точки "отсюда попадаешь на другой план", точки группируются (пара A11↔A10, лифт на 5 этажей = группа из 5 точек). При построении маршрута nav-графы отдельных реконструкций объединяются в единый супер-граф с рёбрами-переходами, и A* идёт по нему один раз.

Модель данных должна сразу поддерживать разные типы переходов (проход/лестница/лифт), но сама настройка cost-функций — вне этого тикета.

## Ключевые решения (согласованы)

1. **Разметка** — отдельная страница `/admin/transitions/:buildingId`. Transition point — сущность межпланная, класть в per-plan editor концептуально неверно.
2. **StitchingPage и вся stitching-инфраструктура** — удаляются целиком. Отдельным шагом, первым в тикете, чтобы расчистить место.
3. **Иерархия** — добавляем `Reconstruction.floor_id: int | None` (FK → `floors.id`), удаляем ненужный `Floor.reconstruction_id`. Денормализованные `Reconstruction.building_id: String` + `floor_number: Integer` остаются как UI-заполнители, их миграция на канонический `floor_id` — отдельный тикет.
4. **Алгоритм маршрутизации** — супер-граф + один вызов `nx.astar_path`. NetworkX уже используется (`backend/app/processing/nav_graph.py:455`), размер объединённого графа для типичного здания — единицы тысяч вершин, это 10–50 мс. Двухуровневый поиск даёт формальный риск субоптимума без выигрыша.
5. **Соединение transition point с локальным nav-графом** — snap к ближайшему corridor/door node в радиусе R (15% от min(mask_width, mask_height)). Не нашли — отклоняем сохранение точки с explanation. Проверка выполняется при создании/перемещении точки.
6. **type на уровне группы, не точки** — семантика "лестничная клетка А" привязана к группе. TransitionPoint наследует тип от группы. У точки есть только опциональный `label` для UI.

## Важные расхождения реальности с исходным handover

- Координаты в nav-графе **пиксельные**, не нормализованные ([nav_graph.py:205-211](backend/app/processing/nav_graph.py:205)). `scale_factor` в метаданных переводит пиксели в метры. Transition point хранится нормализованным `[0,1]`, денормализация в пиксели конкретного плана — в момент сборки супер-графа.
- Nav-граф **не в БД**, а в файле `{mask_id}_nav.json` рядом с маской ([nav_service.py:67-69](backend/app/services/nav_service.py:67)). Мульти-план = загрузить N таких файлов.
- `api/navigation.py` — **целиком заглушка** ([navigation.py:16-77](backend/app/api/navigation.py:16)), реальные endpoints живут в `api/reconstruction.py:314-357`. Переезжаем на `api/navigation.py`, попутно убирая stubs.
- Node IDs уже префиксованы (`room_{id}`, `door_{id}`, целые числа для corridor) — при склейке добавляем `plan_{reconstruction_id}_`, конфликтов не будет.

---

## Реализация — по шагам

### Шаг 1: Удаление stitching-инфраструктуры

**Backend — удалить целиком:**
- [backend/app/services/stitching_service.py](backend/app/services/stitching_service.py) (841 стр.)
- [backend/app/api/stitching.py](backend/app/api/stitching.py) (53 стр.)
- [backend/app/models/stitching.py](backend/app/models/stitching.py) (69 стр.)
- [backend/app/processing/stitching/](backend/app/processing/stitching/) — весь пакет (625 стр. по 5 файлам)
- [backend/tests/services/test_stitching_service.py](backend/tests/services/test_stitching_service.py) (592 стр.)
- [backend/tests/api/test_stitching_api.py](backend/tests/api/test_stitching_api.py) (290 стр.)
- [backend/tests/processing/stitching/](backend/tests/processing/stitching/) — весь пакет

**Backend — изменить:**
- [backend/app/api/__init__.py](backend/app/api/__init__.py) — убрать `include_router(stitching_router)`
- [backend/app/api/deps.py:53-57](backend/app/api/deps.py:53) — удалить `get_stitching_service`
- [backend/requirements.txt](backend/requirements.txt) — проверить, используется ли `shapely` и `opencv-python` где-то ещё (grep по `from shapely`, `import cv2`). Если только в stitching — выпилить зависимости.

**Frontend — удалить целиком:**
- [frontend/src/pages/StitchingPage.tsx](frontend/src/pages/StitchingPage.tsx) (148 стр.)
- [frontend/src/components/Stitching/](frontend/src/components/Stitching/) — все 6 файлов (630 стр.)
- [frontend/src/hooks/useStitching.ts](frontend/src/hooks/useStitching.ts) (220 стр.)
- [frontend/src/hooks/useStitchingCanvas.ts](frontend/src/hooks/useStitchingCanvas.ts)
- [frontend/src/hooks/useStitchingHistory.ts](frontend/src/hooks/useStitchingHistory.ts) (71 стр.)
- [frontend/src/types/stitching.ts](frontend/src/types/stitching.ts) (144 стр.)
- Все `*.module.css` в `components/Stitching/`

**Frontend — изменить:**
- [frontend/src/App.tsx:23](frontend/src/App.tsx:23) — удалить route `/admin/stitching`
- [frontend/src/components/Layout/Sidebar.tsx:44-49](frontend/src/components/Layout/Sidebar.tsx:44) — удалить ссылку "Сшивание планов"
- [frontend/src/api/apiService.ts](frontend/src/api/apiService.ts) — удалить метод `postStitching` и всё, что только им используется
- [frontend/package.json](frontend/package.json) — проверить `fabric.js` (grep `import.*fabric`). Если только в stitching — убрать.

Проверка: `pytest backend/` зелёный, `npm run build` зелёный.

---

### Шаг 2: Миграция иерархии — Reconstruction.floor_id

**Alembic-миграция** (ручной стиль, как `d9e0f1g2h3i4_*`):
- `op.add_column('reconstructions', sa.Column('floor_id', sa.Integer(), nullable=True))`
- `op.create_foreign_key('fk_reconstructions_floor_id', 'reconstructions', 'floors', ['floor_id'], ['id'], ondelete='SET NULL')`
- `op.drop_constraint(...)` + `op.drop_column('floors', 'reconstruction_id')`
- Data migration: **не требуется** — никто `Floor.reconstruction_id` не заполнял, relationships закомментированы.
- `downgrade()` — зеркально.

**ORM изменения:**
- [backend/app/db/models/reconstruction.py](backend/app/db/models/reconstruction.py): добавить `floor_id: Mapped[int | None] = mapped_column(ForeignKey("floors.id"), nullable=True, index=True)` и `floor = relationship("Floor", back_populates="reconstructions")`.
- [backend/app/db/models/building.py](backend/app/db/models/building.py): удалить `reconstruction_id` из `Floor`, раскомментировать и исправить relationship:
  - `Building.floors = relationship("Floor", back_populates="building", cascade="all, delete-orphan")`
  - `Floor.building = relationship("Building", back_populates="floors")`
  - `Floor.reconstructions = relationship("Reconstruction", back_populates="floor")`

**Denormalized поля** (`Reconstruction.building_id: String`, `floor_number: Integer`) — **не трогаем**, оставляем как UI-заполнители. Wizard StepSave и Dashboard продолжают работать. Их миграция через `floor_id` — отдельный тикет после того, как новая разметка освоится.

---

### Шаг 3: ORM и миграция для TransitionGroup / TransitionPoint

**Новый файл** `backend/app/db/models/transition.py`:

```python
class TransitionGroup(Base):
    __tablename__ = "transition_groups"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="passage")  # passage | stairs | elevator
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    points: Mapped[list["TransitionPoint"]] = relationship(back_populates="group", cascade="all, delete-orphan")

class TransitionPoint(Base):
    __tablename__ = "transition_points"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reconstruction_id: Mapped[int] = mapped_column(ForeignKey("reconstructions.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("transition_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    position_x: Mapped[float] = mapped_column(Float, nullable=False)  # нормализованные [0,1]
    position_y: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    group: Mapped["TransitionGroup"] = relationship(back_populates="points")
    reconstruction: Mapped["Reconstruction"] = relationship()
```

**Alembic-миграция** — создание двух таблиц с индексами по `reconstruction_id`, `group_id`, `building_id`.

`building_id` на группе — **nullable**, чтобы поддержать мосты между зданиями в будущем (группа без привязки к зданию = "межздание").

Валидация `type` — на Pydantic уровне (`Literal["passage", "stairs", "elevator"]` с default `"passage"`). Никакого SQL enum.

---

### Шаг 4: Pydantic модели

**Новый файл** `backend/app/models/transition.py`:

```python
class TransitionGroupCreate(BaseModel):
    building_id: int | None = None
    type: Literal["passage", "stairs", "elevator"] = "passage"
    label: str | None = None

class TransitionGroupUpdate(BaseModel):
    type: Literal["passage", "stairs", "elevator"] | None = None
    label: str | None = None

class TransitionGroupResponse(BaseModel):
    id: int
    building_id: int | None
    type: str
    label: str | None
    point_ids: list[int]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TransitionPointCreate(BaseModel):
    reconstruction_id: int
    group_id: int
    position_x: float = Field(ge=0.0, le=1.0)
    position_y: float = Field(ge=0.0, le=1.0)
    label: str | None = None

class TransitionPointUpdate(BaseModel):
    position_x: float | None = Field(default=None, ge=0.0, le=1.0)
    position_y: float | None = Field(default=None, ge=0.0, le=1.0)
    label: str | None = None

class TransitionPointResponse(BaseModel):
    id: int
    reconstruction_id: int
    group_id: int
    position_x: float
    position_y: float
    label: str | None
    snapped_node_id: str | None  # результат снапа к nav-графу, для отладки в UI
    model_config = ConfigDict(from_attributes=True)

class MultiPlanRouteRequest(BaseModel):
    from_reconstruction_id: int
    from_room_id: str
    to_reconstruction_id: int
    to_room_id: str

class MultiPlanRouteSegment(BaseModel):
    reconstruction_id: int
    reconstruction_name: str | None
    floor_label: str | None         # "Здание А, этаж 11"
    coordinates: list[list[float]]  # пиксели → метры своей системы плана
    transition_out_point_id: int | None  # точка, через которую покидаем сегмент

class MultiPlanRouteResponse(BaseModel):
    status: Literal["success", "no_path", "error"]
    message: str | None = None
    total_distance_meters: float | None = None
    segments: list[MultiPlanRouteSegment] = []
```

**Стиль**: `model_config = ConfigDict(from_attributes=True)` (Pydantic v2), не старый `class Config`. Остальной код постепенно на v2 — отдельный тикет.

---

### Шаг 5: Repository

**Новый файл** `backend/app/db/repositories/transition_repo.py`:

Методы:
- `create_group(building_id, type, label, user_id) -> TransitionGroup`
- `get_group(group_id) -> TransitionGroup | None` (с `selectinload(TransitionGroup.points)`)
- `list_groups_by_building(building_id) -> list[TransitionGroup]`
- `update_group(group_id, type, label) -> TransitionGroup | None`
- `delete_group(group_id) -> bool`
- `create_point(reconstruction_id, group_id, x, y, label, user_id) -> TransitionPoint`
- `get_point(point_id) -> TransitionPoint | None`
- `list_points_by_reconstruction(reconstruction_id) -> list[TransitionPoint]`
- `list_points_by_building(building_id) -> list[TransitionPoint]` (join через Reconstruction.floor.building)
- `update_point(point_id, x, y, label) -> TransitionPoint | None`
- `delete_point(point_id) -> bool`

Паттерн — как `ReconstructionRepository`: AsyncSession, `await self._session.commit()`, `await self._session.refresh()` ([reconstruction_repo.py:15-193](backend/app/db/repositories/reconstruction_repo.py:15)).

---

### Шаг 6: Processing — супер-граф

**Новый файл** `backend/app/processing/multi_plan_graph.py`:

Функции:

```python
def snap_to_graph(G: nx.Graph, x_px: float, y_px: float, radius_px: float) -> str | int | None:
    """Ищет ближайший corridor_node/door по pos. Возвращает node_id или None."""

def build_super_graph(
    plan_data: list[PlanData],            # reconstruction_id, deserialized G, mask_width, mask_height, scale_factor
    transition_points: list[TransitionPointData],  # id, reconstruction_id, group_id, x_norm, y_norm
    group_edge_weight: Callable[[GroupData], float] = lambda g: 0.0,
) -> tuple[nx.Graph, dict[int, str]]:
    """
    1. Для каждого плана префиксует node_ids: 'plan_{rid}_{orig_id}', сохраняет attrs.
    2. Для каждой transition_point:
         a. Денормализует (x_norm*mask_width, y_norm*mask_height) → пиксели этого плана.
         b. Snap к ближайшему corridor/door в радиусе. Если None — пропускает с warning (UI не должен позволить создать такую точку, но защитимся).
         c. Создаёт вершину 'transition_{tp_id}' с pos в пикселях, atrr type='transition'.
         d. Ребро transition_{tp_id} ↔ snapped_node с weight = euclidean_px * scale_factor (в метрах).
    3. Для каждой группы: добавляет clique-рёбра между всеми её точками, weight = group_edge_weight(group).
    Возвращает (G_super, mapping: tp_id → node_id в супер-графе).
    """

def find_multi_plan_route(
    G_super: nx.Graph,
    from_node_id: str,          # 'plan_{from_rid}_room_{from_room}'
    to_node_id: str,
    plan_metadata: dict[int, PlanMetadata],  # для перевода px→метры и склейки сегментов
) -> MultiPlanRouteResult:
    """
    1. nx.astar_path(G_super, from_node, to_node, heuristic=..., weight='weight').
    2. Проходит по path. Разбивает на сегменты по смене reconstruction_id (или на transition-рёбрах).
    3. В каждом сегменте применяет los_prune (переиспользуем из nav_service) + transform 2d→3d локальной системы плана.
    4. Возвращает список сегментов + total_distance.
    """
```

Heuristic для `astar_path`: Евклидово расстояние по `pos` в пикселях. Между планами (разные системы координат) — осторожно: либо использовать ноль (`lambda a, b: 0`, фактически сводится к Dijkstra) для простоты, либо нормировать через scale_factor. На MVP берём **нулевую heuristic** (Dijkstra-эквивалент) — графы маленькие, это безопасно и корректно.

---

### Шаг 7: Service-слой

**Новый файл** `backend/app/services/transition_service.py`:

- `create_point(data, user_id)` — валидирует: reconstruction существует, nav-граф построен (есть файл), координата снапится в радиусе R (иначе `ValueError("point out of reachable area")`).
- `create_group(data, user_id)` — создаёт группу.
- `update_point` / `delete_point` / `delete_group` — CRUD.
- `list_points_for_reconstruction(reconstruction_id)` — для UI.
- `list_groups_for_building(building_id)` — для UI.

**Расширение** `backend/app/services/nav_service.py` (НЕ новый класс, существующий):

```python
async def find_multi_plan_route(
    self,
    from_reconstruction_id: int,
    from_room_id: str,
    to_reconstruction_id: int,
    to_room_id: str,
) -> MultiPlanRouteResponse:
    """
    1. Через TransitionRepository найти все реконструкции, достижимые транзитивно через группы
       из from_reconstruction_id. Если to_reconstruction_id не в замыкании → no_path.
    2. Загрузить nav-графы (load_graph + deserialize) для каждой в замыкании.
    3. Загрузить все transition_points в замыкании.
    4. build_super_graph(...).
    5. find_multi_plan_route(G_super, 'plan_{from}_room_{from_room}', 'plan_{to}_room_{to_room}', ...).
    6. Вернуть MultiPlanRouteResponse.
    """
```

Почему не новый класс: логика однородна с локальным `find_route`, а дублирование load_graph/deserialize не нужно.

---

### Шаг 8: API endpoints

**Новый файл** `backend/app/api/transitions.py`:

```
POST   /transitions/groups                           → create_group
GET    /transitions/groups?building_id=X             → list_groups_by_building
PATCH  /transitions/groups/{id}                      → update_group
DELETE /transitions/groups/{id}                      → delete_group

POST   /transitions/points                           → create_point
PATCH  /transitions/points/{id}                      → update_point
DELETE /transitions/points/{id}                      → delete_point

GET    /transitions/reconstructions/{id}/points      → list_points_by_reconstruction
GET    /transitions/buildings/{id}/points            → list_points_by_building (с expanded groups)
```

Стиль: `APIRouter(prefix="/transitions", tags=["transitions"])`, service injection через `Depends(get_transition_service)`.

**Перезапись** [backend/app/api/navigation.py](backend/app/api/navigation.py): удалить оба stub-endpoint'а, добавить:

```
POST /navigation/route/multi → nav_service.find_multi_plan_route (MultiPlanRouteResponse)
```

**Правки**:
- [backend/app/api/__init__.py](backend/app/api/__init__.py): добавить `transitions_router` в include.
- [backend/app/api/deps.py](backend/app/api/deps.py): добавить `get_transition_repo`, `get_transition_service`.

---

### Шаг 9: Frontend — API-клиент и типы

**Новый файл** `frontend/src/types/transitions.ts`:

```ts
export type TransitionType = 'passage' | 'stairs' | 'elevator';

export interface TransitionGroup {
  id: number;
  building_id: number | null;
  type: TransitionType;
  label: string | null;
  point_ids: number[];
  created_at: string;
}

export interface TransitionPoint {
  id: number;
  reconstruction_id: number;
  group_id: number;
  position_x: number;  // [0,1]
  position_y: number;  // [0,1]
  label: string | null;
  snapped_node_id: string | null;
}

export interface MultiPlanRouteSegment {
  reconstruction_id: number;
  reconstruction_name: string | null;
  floor_label: string | null;
  coordinates: [number, number, number][];
  transition_out_point_id: number | null;
}

export interface MultiPlanRouteResult {
  status: 'success' | 'no_path' | 'error';
  message?: string;
  total_distance_meters?: number;
  segments: MultiPlanRouteSegment[];
}
```

**Правки** [frontend/src/api/apiService.ts](frontend/src/api/apiService.ts) — добавить группу `transitionApi`:

```ts
export const transitionApi = {
  createGroup, updateGroup, deleteGroup, listGroupsByBuilding,
  createPoint, updatePoint, deletePoint,
  listPointsByReconstruction, listPointsByBuilding,
};

export const navigationApi = {
  // существующий buildRoute → удалить (был orphan)
  findMultiPlanRoute: (req: MultiPlanRouteRequest) => ...,
};
```

---

### Шаг 10: Frontend — страница /admin/transitions/:buildingId

**Новый файл** `frontend/src/pages/TransitionsPage.tsx`:

Layout (трёхколонник):
- **Слева**: `FloorTree` — список этажей здания, каждый этаж ссылается на одну Reconstruction через floor_id. Клик — выбирает активный план.
- **Центр**: `TransitionCanvas` — изображение плана (URL из `Reconstruction.plan_file.url`), overlay с точками, groups-подсветка при hover. Клик по пустому месту — поставить точку (предварительный mode "добавление"); клик по точке — выбрать; Shift+click — добавить к группе.
- **Справа**: `GroupPanel` — свойства выбранной точки / группы:
  - Точка: label, координаты, список связанных точек (с floor label), кнопки "Связать с…" и "Удалить".
  - Группа: type (select), label, точки в группе.

**Новые компоненты**:
- `frontend/src/components/Transitions/FloorTree.tsx` — ~80 стр.
- `frontend/src/components/Transitions/TransitionCanvas.tsx` — ~200 стр. Чистый HTML5 Canvas или SVG overlay, **без Fabric.js** (мы его выпилили). Отображает картинку плана + маркеры точек.
- `frontend/src/components/Transitions/TransitionMarker.tsx` — визуальный маркер точки с цветом по типу группы.
- `frontend/src/components/Transitions/GroupPanel.tsx` — правая панель.
- `frontend/src/components/Transitions/LinkPointDialog.tsx` — модалка выбора целевого плана и точки для связи.

**Новый хук** `frontend/src/hooks/useTransitions.ts` — состояние страницы (building, floors[], selectedFloorId, points[], groups[], selectedPointId), API-вызовы, optimistic updates при CRUD.

**Правки**:
- [frontend/src/App.tsx](frontend/src/App.tsx) — добавить route `<Route path="admin/transitions/:buildingId" element={<TransitionsPage />} />`.
- [frontend/src/components/Layout/Sidebar.tsx](frontend/src/components/Layout/Sidebar.tsx) — добавить пункт "Переходы между планами" (ссылка с выбором здания — например, `/admin/transitions/pick`, либо списком из Dashboard).

**Предусловие на UI**: страница доступна, если у здания есть ≥1 реконструкция с построенным nav-графом. Если нет — пустое состояние "сначала обработайте планы в Wizard".

---

### Шаг 11: Frontend — мульти-план маршрут в MeshViewer

**Правки** [frontend/src/components/MeshViewer/NavigationPath.tsx](frontend/src/components/MeshViewer/NavigationPath.tsx):

Текущий компонент принимает `coordinates: number[][] | null` и рисует одну `CatmullRomCurve3`. Для мульти-плана маршрута:

Вариант A (минимальный, MVP): сплющить `segments` в единый массив coordinates, отдать как сейчас. Потеряем визуальное различие этажей, но маршрут виден.

**Вариант B (Recommended)**: отрендерить **N кривых**, по одной на segment, разных оттенков оранжевого. Плюс marker-sprite на границе сегментов (место transition point) с label из `segment.floor_label`. Минимум дополнительного кода: map по `segments` в `NavigationPath`.

**Новый компонент** `frontend/src/components/MeshViewer/MultiPlanRoutePanel.tsx` — замена `RoutePanel` для мульти-плана: показывает список сегментов с этажами и общей дистанцией.

**Новый селектор from/to** — где-то в Dashboard или на отдельной странице `/admin/routes/:buildingId` (опционально в этом тикете, но проще: отдельная страница `/admin/route-test/:buildingId` с двумя dropdown'ами building→floor→room + "Построить маршрут" → визуализация в MeshViewer). Для acceptance тест-страница должна быть.

---

## Тесты

### Backend

- `backend/tests/processing/test_multi_plan_graph.py`:
  - `test_snap_finds_nearest_corridor_node_within_radius`
  - `test_snap_returns_none_when_no_node_in_radius`
  - `test_build_super_graph_prefixes_node_ids`
  - `test_build_super_graph_adds_transition_clique_edges`
  - `test_find_route_across_two_plans_via_single_group`
  - `test_find_route_chooses_cheapest_when_two_groups_connect_same_plans`
  - `test_no_path_when_target_plan_not_reachable`
- `backend/tests/services/test_transition_service.py`:
  - CRUD для групп и точек, валидация координат, snap-валидация при create_point.
- `backend/tests/api/test_transitions_api.py`:
  - Все endpoints, 200/400/404 кейсы.
- `backend/tests/api/test_navigation_api.py`:
  - `POST /navigation/route/multi` — success, no_path, unknown_reconstruction.

Паттерн — как [backend/tests/processing/test_nav_graph.py](backend/tests/processing/test_nav_graph.py) и [backend/tests/api/test_reconstruction_api.py](backend/tests/api/test_reconstruction_api.py).

### Frontend

- Минимум: smoke-тест TransitionsPage (рендер с мок-данными, клик создаёт точку через mock API).

---

## Acceptance criteria

1. `pytest backend/` и `npm run build` зелёные. Stitching полностью удалён, упоминаний `stitching` в коде нет (grep чистый).
2. Миграция `Reconstruction.floor_id` + удаление `Floor.reconstruction_id` применяется и откатывается чисто на локальном SQLite.
3. Таблицы `transition_groups` и `transition_points` создаются миграцией, ORM relationships работают (в pytest).
4. `POST /transitions/points` с невалидной координатой (точка вне проходимой зоны, snap не находит узла в радиусе) возвращает 400 с explanation.
5. `POST /transitions/groups` + два `POST /transitions/points` + `POST /navigation/route/multi` между двумя комнатами на разных реконструкциях возвращает `status=success`, `segments.length == 2`, непустые `coordinates` в каждом сегменте, положительный `total_distance_meters`.
6. Страница `/admin/transitions/:buildingId` позволяет: выбрать этаж, поставить точку на canvas, связать с точкой на другом этаже (создать группу), увидеть цветной маркер по типу группы, удалить точку/группу.
7. MeshViewer рисует мульти-план маршрут (B-вариант: разные сегменты-кривые + панель с этажами).
8. `GET /health` и основной пользовательский флоу (upload → mask → nav graph → build mesh → save → single-plan route) продолжают работать без регрессий.

## Вне тикета

- **Cost-функции** для stairs/elevator — `group_edge_weight` сейчас всегда `0.0`. Настройка весов и UI для них — отдельный тикет.
- **Миграция Reconstruction.building_id / floor_number → floor_id** — отдельный тикет (нужна data migration: подобрать/создать Floor по (building_id_str, floor_number), проставить floor_id, потом удалить denormalized поля).
- **Dashboard — группировка по зданиям** — отдельный тикет. Сейчас Dashboard остаётся flat.
- **Реальное извлечение user_id из JWT** (сейчас `created_by` берём так же, как делает upload.py — placeholder или `get_current_user` stub). Отдельный auth-тикет.
- **Pydantic v1 → v2 миграция** для оставшихся `class Config` в `models/building.py` и других. Косметически.
- **Удаление fabric.js / shapely / opencv** из зависимостей, если они становятся орфанами после шага 1 — проверяем grep'ом, удаляем если безопасно. Если где-то ещё используются — отдельный тикет.

## Порядок коммитов

Разделить на 4 PR для безопасного review:

1. **PR1 "remove stitching"** — шаг 1 полностью. Зелёные тесты.
2. **PR2 "reconstruction.floor_id"** — шаг 2. Миграция + ORM.
3. **PR3 "transition points backend"** — шаги 3–8. ORM, миграция, Pydantic, repo, processing, service, API. Тесты.
4. **PR4 "transition points frontend"** — шаги 9–11. UI, интеграция с MeshViewer.

## Критические файлы — карта изменений

**Создаются:**
- `backend/app/db/models/transition.py`
- `backend/app/models/transition.py`
- `backend/app/db/repositories/transition_repo.py`
- `backend/app/services/transition_service.py`
- `backend/app/processing/multi_plan_graph.py`
- `backend/app/api/transitions.py`
- `backend/alembic/versions/<ts>_reconstruction_floor_id.py`
- `backend/alembic/versions/<ts>_transition_points.py`
- `backend/tests/processing/test_multi_plan_graph.py`
- `backend/tests/services/test_transition_service.py`
- `backend/tests/api/test_transitions_api.py`
- `backend/tests/api/test_navigation_api.py`
- `frontend/src/pages/TransitionsPage.tsx`
- `frontend/src/components/Transitions/*` (5 файлов)
- `frontend/src/components/MeshViewer/MultiPlanRoutePanel.tsx`
- `frontend/src/hooks/useTransitions.ts`
- `frontend/src/types/transitions.ts`

**Изменяются:**
- `backend/app/db/models/reconstruction.py` — floor_id FK + relationship
- `backend/app/db/models/building.py` — удалить Floor.reconstruction_id, раскомментить relationships
- `backend/app/services/nav_service.py` — метод find_multi_plan_route
- `backend/app/api/navigation.py` — перезапись (stubs → реальный multi endpoint)
- `backend/app/api/__init__.py` — подключить transitions_router, удалить stitching_router
- `backend/app/api/deps.py` — + get_transition_repo/service, − get_stitching_service
- `frontend/src/App.tsx` — + route transitions, − route stitching
- `frontend/src/components/Layout/Sidebar.tsx` — пункт "Переходы между планами" вместо "Сшивание планов"
- `frontend/src/api/apiService.ts` — + transitionApi, + findMultiPlanRoute, − postStitching, − buildRoute (orphan)
- `frontend/src/components/MeshViewer/NavigationPath.tsx` — поддержка сегментов

**Удаляются:**
- Весь stitching surface (список в шаге 1).

## Верификация end-to-end

1. `alembic upgrade head` на свежей SQLite — без ошибок. `alembic downgrade -2` → `alembic upgrade head` — идемпотентно.
2. `pytest backend/ -v` — всё зелёное.
3. Запустить backend, открыть фронт. Wizard: загрузить план здания А этаж 11, сохранить с `building_id="A"`, `floor_number=11`. Повторить для этажа 10. В БД вручную создать две записи в `floors` (id=1 building=A number=11, id=2 building=A number=10) и проставить Reconstruction.floor_id.
4. Зайти на `/admin/transitions/<id здания A>`. Увидеть оба этажа. На этаже 11 поставить точку у лестницы. На этаже 10 поставить точку в том же месте. Связать — получить группу `passage`.
5. На тестовой странице маршрута выбрать `этаж 11, комната A304` → `этаж 10, комната A204`, нажать "Построить маршрут". Ожидание: успех, `total_distance_meters > 0`, в MeshViewer видны 2 сегмента.
6. `GET /transitions/buildings/<id>/points` возвращает обе точки с корректным `group_id`.
7. Удалить группу через `DELETE /transitions/groups/<id>` — точки удаляются каскадно. Повторный маршрут → `no_path`.