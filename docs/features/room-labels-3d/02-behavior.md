# Behavior: Room Labels 3D

## Data Flow Diagrams

### DFD: Wizard Flow (StepView3D)

```mermaid
flowchart LR
  WallEditor([WallEditorCanvas\nШаг 3]) -->|rooms: RoomAnnotation\[\]| State[useWizard state]
  State -->|rooms| StepView3D
  StepView3D -->|rooms + showRooms| MeshViewer
  MeshViewer -->|rooms + modelRef| RoomOverlay
  RoomOverlay -->|3D positions| R3FScene[R3F Scene\nHtml + Box]
```

### DFD: EditPlanPage Flow

```mermaid
flowchart LR
  User([User]) -->|открывает EditPlanPage| Page[EditPlanPage]
  Page -->|GET /reconstructions/{id}/vectors| API[FastAPI]
  API -->|VectorizationResult| Page
  Page -->|fromVectorRoom\(\)| Rooms[RoomDisplay\[\]]
  Rooms -->|rooms + showRooms| MeshViewer
  MeshViewer -->|rooms + modelRef| RoomOverlay
  RoomOverlay -->|3D positions| R3FScene[R3F Scene]
```

---

## Sequence Diagrams

### Use Case 1: Пользователь включает отображение кабинетов в wizard

```mermaid
sequenceDiagram
actor User
participant StepView3D
participant MeshViewer
participant GlbModel
participant RoomOverlay

Note over StepView3D: rooms=state.rooms from useWizard
Note over StepView3D: showRooms=false (initial)

User->>StepView3D: нажимает «Кабинеты»
StepView3D->>StepView3D: setShowRooms(true)
StepView3D->>MeshViewer: props: rooms=[...], showRooms=true
MeshViewer->>GlbModel: props: rooms=[...], showRooms=true
GlbModel->>RoomOverlay: mount c props: modelRef, rooms, visible=true

RoomOverlay->>RoomOverlay: useEffect — вычисляет bounding box\n из modelRef.current
RoomOverlay->>RoomOverlay: вычисляет 3D позиции\n для каждой комнаты
RoomOverlay-->>User: рендерит Box+Html метки в 3D сцене
```

**Error cases:**

| Условие | Поведение |
|---------|-----------|
| `modelRef.current` не готов | skip — position = [0,0,0], Box не рендерится |
| `rooms` = [] | `visible=true`, но ничего не рендерится |
| room без имени | отображается `room_type` вместо имени |

---

### Use Case 2: Загрузка комнат для сохранённой реконструкции (EditPlanPage)

```mermaid
sequenceDiagram
actor User
participant EditPlanPage
participant API as GET /vectors
participant MeshViewer

User->>EditPlanPage: открывает /admin/edit/42
EditPlanPage->>API: GET /reconstructions/42/vectors
API-->>EditPlanPage: VectorizationResult { rooms: VectorRoom[] }
EditPlanPage->>EditPlanPage: fromVectorRoom(vr.rooms) → RoomDisplay[]
EditPlanPage->>MeshViewer: props: rooms=[...], showRooms=false
Note over MeshViewer: кнопка «Кабинеты» активна

User->>EditPlanPage: нажимает «Кабинеты»
EditPlanPage->>MeshViewer: showRooms=true
MeshViewer-->>User: отображает метки
```

**Error cases:**

| Условие | HTTP | Поведение |
|---------|------|-----------|
| Vectors не сохранены | 404 | `rooms=[]`, кнопка неактивна/скрыта |
| Сетевая ошибка | — | `rooms=[]`, silent fail, кнопка скрыта |

---

### Use Case 3: Пользователь выключает отображение

```mermaid
sequenceDiagram
actor User
participant StepView3D
participant MeshViewer
participant RoomOverlay

User->>StepView3D: повторно нажимает «Кабинеты»
StepView3D->>StepView3D: setShowRooms(false)
StepView3D->>MeshViewer: props: showRooms=false
MeshViewer->>GlbModel: props: showRooms=false
GlbModel->>RoomOverlay: props: visible=false
RoomOverlay-->>User: return null → метки исчезают
```

---

### Use Case 4: Размонтирование компонента

```mermaid
sequenceDiagram
participant GlbModel
participant RoomOverlay
participant drei_Html as @react-three/drei Html

GlbModel->>RoomOverlay: unmount
RoomOverlay->>RoomOverlay: useEffect cleanup:\nref.current?.dispose() для каждой Box геометрии
RoomOverlay->>drei_Html: Html unmount (drei сам очищает DOM-портал)
Note over RoomOverlay: нет утечек memory
```

---

## Визуальный стиль (как в route building)

### В route building (`FloorRouteView.tsx:55-86`)
```
Box: color="#FF4500", opacity=0.4, depthWrite=false, side=DoubleSide
Html: цвет текста white, fontWeight=500, textShadow
```

### Room Labels (все комнаты — менее насыщенный вариант)
```
Box: color=ROOM_COLORS[room_type], opacity=0.15, depthWrite=false, side=DoubleSide
Html: цвет текста white, fontWeight=500, textShadow, fontSize=13px
```

Меньшая opacity (0.15 vs 0.4) — потому что комнат много и стены за ними должны быть видны.
Цвет по типу комнаты — потому что так легче ориентироваться.
