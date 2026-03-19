# Тикет 19: Навигационный граф — генерация (backend) + экран редактора (frontend)

**Приоритет:** Высокий (ключевая фича диплома)  
**Тип:** Feature (Research → Design уже выполнены, см. ADR документ)  
**Оценка:** Крупная фича, разбита на подзадачи внутри тикета

**Затрагиваемые файлы:**

Backend (новые):
- `backend/app/processing/nav_graph.py` — pure functions генерации графа
- `backend/app/services/nav_service.py` — сервис-оркестратор
- `backend/app/api/reconstruction.py` — +1 endpoint (POST /nav-graph)
- `backend/app/models/reconstruction.py` — +Pydantic модели
- `backend/tests/processing/test_nav_graph.py` — тесты

Backend (изменения):
- `backend/requirements.txt` — новые зависимости

Frontend (новые):
- `frontend/src/components/Wizard/StepNavGraph.tsx` — новый шаг wizard'а
- `frontend/src/components/Editor/NavGraphCanvas.tsx` — canvas визуализации графа
- `frontend/src/components/Editor/NavGraphCanvas.module.css`
- `frontend/src/components/Wizard/StepNavGraph.module.css`

Frontend (изменения):
- `frontend/src/hooks/useWizard.ts` — 5→6 шагов, новый state, `buildNavGraph()`
- `frontend/src/pages/WizardPage.tsx` — новый case 4, сдвиг шагов
- `frontend/src/types/wizard.ts` — DoorAnnotation + room_id, новые типы
- `frontend/src/components/Wizard/StepIndicator.tsx` — 6 кружков

**НЕ МЕНЯТЬ:** `apiService.ts`, `MeshViewer.tsx`, HSV диапазоны в pipeline.py

---

## Обзор

### Новый flow wizard'а (5 → 6 шагов):

```
1. Загрузка          — без изменений
2. Препроцессинг     — без изменений
3. Редактор стен     — "ПОСТРОИТЬ" → сохраняет маску + аннотации + генерирует граф
4. ** НОВОЕ: Навигационный граф **  — визуализация + редактирование графа
5. Просмотр 3D       — MeshViewer + маршрутизация (Тикет 20)
6. Сохранение        — без изменений
```

### Что происходит при нажатии "ПОСТРОИТЬ" на шаге 3:

```
saveMaskAndAnnotations(blob, rooms, doors)  → editedMaskId
buildNavGraph(editedMaskId, rooms, doors)   → navGraphId
→ Переход на шаг 4 (Навигационный граф)
```

`buildMesh` переносится на шаг 4 → шаг 5. Пользователь сначала проверяет и редактирует граф, потом строит 3D.

### Экран навигационного графа (шаг 4):

```
┌─────────────────────────────────────┬──────────────────────┐
│                                     │ // НАВИГАЦИОННЫЙ     │
│                                     │    ГРАФ              │
│    Canvas: маска + overlay графа    │                      │
│                                     │ Узлов: 47            │
│    ● corridor nodes (серые)         │ Рёбер: 52            │
│    ● room nodes (оранжевые)         │ Комнат: 12           │
│    ● door nodes (зелёные)           │ Дверей: 8            │
│    — corridor edges (белые тонкие)  │                      │
│    — room-door edges (оранжевые)    │ ──────────────────── │
│    — door-corridor (зелёные)        │ // ЛЕГЕНДА           │
│                                     │                      │
│                                     │ ● Коридор            │
│                                     │ ● Комната            │
│                                     │ ● Дверь              │
│                                     │ ● Вход в коридор     │
│                                     │                      │
│                                     │ ──────────────────── │
│                                     │ // ДЕЙСТВИЯ          │
│                                     │                      │
│                                     │ [Перестроить граф]    │
│                                     │                      │
├─────────────────────────────────────┴──────────────────────┤
│  Назад                                   > ПОСТРОИТЬ 3D   │
└────────────────────────────────────────────────────────────┘
```

Дизайн: брутализм, тёмная тема, monospace заголовки, sans-serif контент. Панель справа — `#0d0d0d`, кнопки — `#1a1a1a`, акцент — `#FF4500`. Точно как на шаге 3 (редактор стен).

---

## Подзадача 1: Новые зависимости

**Файл:** `backend/requirements.txt`

Добавить:
```
scikit-image>=0.22.0
sknw>=0.3
networkx>=3.2
shapely>=2.0
```

Проверить что `scipy` уже есть (нужен для `cKDTree` в будущем).

**Установка:** `pip install scikit-image sknw networkx shapely --break-system-packages`

---

## Подзадача 2: Pure functions — `backend/app/processing/nav_graph.py`

Новый файл с 5 чистыми функциями. Каждая принимает данные, возвращает результат, без side effects.

### 2.1. `extract_corridor_mask`

Извлекает маску коридоров из бинарной маски стен и аннотаций комнат.

```python
import numpy as np
import cv2
import logging
import time
from skimage.morphology import skeletonize, binary_closing, square

logger = logging.getLogger(__name__)


def extract_corridor_mask(
    wall_mask: np.ndarray,
    rooms: list[dict],
    mask_width: int,
    mask_height: int,
) -> np.ndarray:
    """
    Извлекает маску проходимого пространства (коридоры) из бинарной маски.
    
    1. Инвертирует маску стен (белое=стены → чёрное=стены, белое=свободно)
    2. Вычитает bounding boxes комнат (room, staircase, elevator)
    3. Тип 'corridor' — НЕ вычитается (остаётся как транзитная зона)
    
    Args:
        wall_mask: бинарная маска (uint8, 255=стена, 0=свободно) 
                   ИЛИ (255=стена/белое на текущей маске)
        rooms: список аннотаций комнат с нормализованными координатами:
               [{"room_type": "room", "x": 0.1, "y": 0.2, "width": 0.15, "height": 0.1}, ...]
        mask_width: ширина маски в пикселях
        mask_height: высота маски в пикселях
    
    Returns:
        corridor_mask: бинарная маска (uint8, 255=проходимое/коридор, 0=стена/комната)
    """
    t0 = time.perf_counter()
    
    # 1. Инвертируем: на маске стены=белое(255), свободно=чёрное(0)
    #    Нам нужно: коридор=белое, стена=чёрное
    free_space = cv2.bitwise_not(wall_mask)
    
    # 2. Вычитаем комнаты (кроме corridor)
    room_types_to_subtract = {'room', 'staircase', 'elevator'}
    
    for room in rooms:
        if room.get('room_type', 'room') in room_types_to_subtract:
            # Денормализация координат
            x = int(room['x'] * mask_width)
            y = int(room['y'] * mask_height)
            w = int(room['width'] * mask_width)
            h = int(room['height'] * mask_height)
            
            # Закрашиваем чёрным (не коридор)
            cv2.rectangle(free_space, (x, y), (x + w, y + h), 0, -1)
    
    logger.info("extract_corridor_mask: %dx%d, %d rooms subtracted, %.1fms",
                mask_width, mask_height, 
                sum(1 for r in rooms if r.get('room_type', 'room') in room_types_to_subtract),
                (time.perf_counter() - t0) * 1000)
    
    return free_space
```

### 2.2. `build_skeleton`

Морфологическая очистка + скелетонизация.

```python
def build_skeleton(corridor_mask: np.ndarray) -> np.ndarray:
    """
    Применяет морфологическое закрытие и скелетонизацию к маске коридоров.
    
    Args:
        corridor_mask: бинарная маска коридоров (uint8, 255=коридор)
    
    Returns:
        skeleton: бинарный скелет (uint8, 255=скелет, 0=фон)
    """
    t0 = time.perf_counter()
    
    # Конвертируем в bool для skimage
    binary = corridor_mask > 0
    
    # Морфологическое закрытие (заполняет мелкие дыры)
    cleaned = binary_closing(binary, square(5))
    
    # Скелетонизация (медиальная ось)
    skeleton = skeletonize(cleaned)
    
    # Обратно в uint8
    result = (skeleton.astype(np.uint8)) * 255
    
    logger.info("build_skeleton: %.1fms", (time.perf_counter() - t0) * 1000)
    return result
```

### 2.3. `build_topology_graph`

Конвертация растрового скелета в NetworkX граф через sknw.

```python
import sknw
import networkx as nx


def build_topology_graph(skeleton: np.ndarray) -> nx.Graph:
    """
    Строит топологический граф из пиксельного скелета.
    
    Пиксели с 1 соседом → конечные точки (тупики)
    Пиксели с 2 соседями → часть ребра
    Пиксели с 3+ соседями → точки ветвления (узлы)
    
    Args:
        skeleton: бинарный скелет (uint8, 255=скелет)
    
    Returns:
        nx.Graph с узлами (pos=(x,y), type='corridor_node')
                  и рёбрами (weight=длина, pts=[(x,y),...], type='corridor_edge')
    """
    t0 = time.perf_counter()
    
    # sknw ожидает uint16
    skel_input = (skeleton > 0).astype(np.uint16)
    
    graph_sk = sknw.build_sknw(skel_input, multi=False, iso=False)
    
    G = nx.Graph()
    
    # Копируем узлы (sknw возвращает координаты в формате (row, col) = (Y, X))
    for node_id in graph_sk.nodes():
        cy, cx = graph_sk.nodes[node_id]['o']
        G.add_node(
            int(node_id),
            type='corridor_node',
            pos=(float(cx), float(cy)),
        )
    
    # Копируем рёбра с промежуточными точками
    for u, v, edge_data in graph_sk.edges(data=True):
        weight = float(edge_data.get('weight', 0))
        # Транспонируем (Y,X) → (X,Y)
        pts = [(float(pt[1]), float(pt[0])) for pt in edge_data.get('pts', [])]
        G.add_edge(
            int(u), int(v),
            weight=weight,
            pts=pts,
            type='corridor_edge',
        )
    
    logger.info("build_topology_graph: %d nodes, %d edges, %.1fms",
                G.number_of_nodes(), G.number_of_edges(),
                (time.perf_counter() - t0) * 1000)
    return G
```

### 2.4. `prune_dendrites`

Итеративное удаление коротких тупиковых ветвей.

```python
def prune_dendrites(G: nx.Graph, min_branch_length: float = 20.0) -> nx.Graph:
    """
    Удаляет короткие тупиковые ответвления скелета (дендриты).
    
    Узел со степенью 1 = тупик. Если ребро к нему короче min_branch_length — удаляем.
    Повторяем пока граф не стабилизируется.
    
    Args:
        G: топологический граф
        min_branch_length: минимальная длина ветви в пикселях (меньше — удаляем)
    
    Returns:
        Очищенный граф (тот же объект, in-place)
    """
    t0 = time.perf_counter()
    removed_total = 0
    
    changed = True
    while changed:
        changed = False
        dead_ends = [n for n, deg in dict(G.degree()).items() if deg == 1]
        
        for node in dead_ends:
            if node not in G:
                continue
            neighbors = list(G.neighbors(node))
            if not neighbors:
                continue
            neighbor = neighbors[0]
            edge_data = G.get_edge_data(node, neighbor)
            if edge_data and edge_data.get('weight', float('inf')) < min_branch_length:
                G.remove_node(node)
                changed = True
                removed_total += 1
    
    logger.info("prune_dendrites: removed %d dead ends, %.1fms",
                removed_total, (time.perf_counter() - t0) * 1000)
    return G
```

### 2.5. `integrate_semantics`

Добавление комнат и дверей в граф, snap дверей к скелету.

```python
from shapely.geometry import Point, LineString
import math


def integrate_semantics(
    G: nx.Graph,
    rooms: list[dict],
    doors: list[dict],
    mask_width: int,
    mask_height: int,
) -> nx.Graph:
    """
    Интегрирует семантические объекты (комнаты, двери) в топологический граф коридоров.
    
    1. Комнаты → узлы-центроиды (тип 'room')
    2. Двери → узлы-середины линий (тип 'door')
    3. Связь комната→дверь (через door.room_id или эвристика ближайшей)
    4. Snap дверь → скелет коридора (Shapely project/interpolate)
    5. Расщепление ребра коридора в точке snap
    
    Args:
        G: граф коридоров (после prune_dendrites)
        rooms: [{"id": "...", "name": "1103", "room_type": "room", 
                 "x": 0.1, "y": 0.2, "width": 0.15, "height": 0.1}, ...]
        doors: [{"id": "...", "room_id": "room_1103" | null,
                 "x1": 0.3, "y1": 0.5, "x2": 0.32, "y2": 0.5}, ...]
        mask_width, mask_height: размеры маски в пикселях
    
    Returns:
        Обогащённый граф с комнатами, дверями и точками входа в коридор
    """
    t0 = time.perf_counter()
    
    # --- 1. Узлы комнат ---
    room_nodes = {}
    for room in rooms:
        # Денормализация
        rx = room['x'] * mask_width
        ry = room['y'] * mask_height
        rw = room['width'] * mask_width
        rh = room['height'] * mask_height
        cx = rx + rw / 2.0
        cy = ry + rh / 2.0
        
        node_id = f"room_{room['id']}"
        G.add_node(node_id, type='room', pos=(cx, cy),
                   room_id=room['id'], room_name=room.get('name', ''),
                   room_type=room.get('room_type', 'room'),
                   bbox=(rx, ry, rw, rh))
        room_nodes[room['id']] = node_id
    
    # --- 2. Подготовка геометрии коридоров для snap ---
    edges_geometry = []
    for u, v, data in list(G.edges(data=True)):
        if data.get('type') == 'corridor_edge' and data.get('pts'):
            pts = data['pts']
            if len(pts) >= 2:
                line = LineString(pts)
                edges_geometry.append((u, v, line, data))
    
    # --- 3. Обработка дверей ---
    for door in doors:
        # Денормализация координат двери
        dx1 = door['x1'] * mask_width
        dy1 = door['y1'] * mask_height
        dx2 = door['x2'] * mask_width
        dy2 = door['y2'] * mask_height
        
        # Середина линии двери
        dmx = (dx1 + dx2) / 2.0
        dmy = (dy1 + dy2) / 2.0
        
        door_node_id = f"door_{door['id']}"
        G.add_node(door_node_id, type='door', pos=(dmx, dmy), door_id=door['id'])
        
        # --- 3a. Связь дверь→комната ---
        linked_room_node = None
        
        # Приоритет: явная привязка door.room_id
        if door.get('room_id') and door['room_id'] in room_nodes:
            linked_room_node = room_nodes[door['room_id']]
        else:
            # Fallback: ближайшая комната
            min_dist = float('inf')
            for r_id, r_node in room_nodes.items():
                rx, ry = G.nodes[r_node]['pos']
                dist = math.hypot(rx - dmx, ry - dmy)
                if dist < min_dist:
                    min_dist = dist
                    linked_room_node = r_node
        
        if linked_room_node:
            room_pos = G.nodes[linked_room_node]['pos']
            dist_room_door = math.hypot(room_pos[0] - dmx, room_pos[1] - dmy)
            G.add_edge(linked_room_node, door_node_id,
                       weight=dist_room_door, type='room_to_door')
        
        # --- 3b. Snap дверь → скелет коридора ---
        door_pt = Point(dmx, dmy)
        best_dist = float('inf')
        best_snap = None
        best_edge = None
        
        for u, v, geom_line, edge_data in edges_geometry:
            proj_dist = geom_line.project(door_pt)
            snap_pt = geom_line.interpolate(proj_dist)
            dist_to_corridor = door_pt.distance(snap_pt)
            
            if dist_to_corridor < best_dist:
                best_dist = dist_to_corridor
                best_snap = snap_pt
                best_edge = (u, v, geom_line, edge_data)
        
        if best_snap and best_edge:
            u, v, geom_line, edge_data = best_edge
            entry_node_id = f"entry_{door['id']}"
            ex, ey = best_snap.x, best_snap.y
            
            G.add_node(entry_node_id, type='corridor_entry', pos=(ex, ey))
            G.add_edge(door_node_id, entry_node_id,
                       weight=best_dist, type='door_to_corridor')
            
            # --- 3c. Расщепление ребра коридора ---
            u_pos = np.array(G.nodes[u]['pos'])
            v_pos = np.array(G.nodes[v]['pos'])
            entry_pos = np.array([ex, ey])
            
            dist_u_entry = float(np.linalg.norm(u_pos - entry_pos))
            dist_v_entry = float(np.linalg.norm(v_pos - entry_pos))
            
            # Разбиваем pts на два сегмента
            proj_normalized = geom_line.project(best_snap, normalized=True)
            total_pts = edge_data.get('pts', [])
            split_idx = max(1, int(len(total_pts) * proj_normalized))
            pts_u_to_entry = total_pts[:split_idx] + [(ex, ey)]
            pts_entry_to_v = [(ex, ey)] + total_pts[split_idx:]
            
            if G.has_edge(u, v):
                G.remove_edge(u, v)
            
            G.add_edge(u, int(entry_node_id.split('_')[-1]) if isinstance(u, int) else entry_node_id,
                       weight=dist_u_entry, type='corridor_edge', pts=pts_u_to_entry)
            # Упрощённый вариант — использовать entry_node_id как строку:
            G.add_edge(entry_node_id, u, weight=dist_u_entry,
                       type='corridor_edge', pts=pts_u_to_entry)
            G.add_edge(entry_node_id, v, weight=dist_v_entry,
                       type='corridor_edge', pts=pts_entry_to_v)
            
            # Удаляем дублирующее ребро если создалось
            # (sknw использует int ID, наши семантические — строки)
    
    logger.info("integrate_semantics: +%d rooms, +%d doors, %.1fms",
                len(rooms), len(doors), (time.perf_counter() - t0) * 1000)
    return G
```

**Примечание:** Расщепление ребра — самая хрупкая часть. При реализации нужно аккуратно обработать типы node_id (int для corridor_node, string для семантических). Возможно стоит с самого начала использовать строковые ID для всех узлов.

---

## Подзадача 3: Сериализация графа

Функция для сохранения и загрузки графа + метаданные.

```python
import json
from networkx.readwrite import json_graph


def serialize_nav_graph(
    G: nx.Graph,
    mask_width: int,
    mask_height: int,
    scale_factor: float,
) -> dict:
    """
    Сериализует граф в JSON-совместимый словарь.
    
    Включает метаданные (размеры маски, scale_factor)
    для координатной трансформации 2D→3D в Тикете 20.
    """
    graph_data = json_graph.node_link_data(G)
    
    return {
        "version": 1,
        "metadata": {
            "mask_width": mask_width,
            "mask_height": mask_height,
            "scale_factor": scale_factor,
            "nodes_count": G.number_of_nodes(),
            "edges_count": G.number_of_edges(),
            "room_nodes": [n for n, d in G.nodes(data=True) if d.get('type') == 'room'],
            "door_nodes": [n for n, d in G.nodes(data=True) if d.get('type') == 'door'],
        },
        "graph": graph_data,
    }


def deserialize_nav_graph(data: dict) -> tuple[nx.Graph, dict]:
    """
    Восстанавливает граф из JSON.
    Returns: (nx.Graph, metadata_dict)
    """
    G = json_graph.node_link_graph(data["graph"])
    return G, data["metadata"]
```

**Файл на диске:** `uploads/masks/{maskFileId}_nav.json`

---

## Подзадача 4: Сервис-оркестратор — `backend/app/services/nav_service.py`

```python
class NavService:
    async def build_graph(
        self,
        mask_file_id: str,
        rooms: list[dict],
        doors: list[dict],
        scale_factor: float = 0.05,
    ) -> dict:
        """
        Полный пайплайн генерации навигационного графа.
        
        1. Читает маску с диска
        2. extract_corridor_mask
        3. build_skeleton
        4. build_topology_graph
        5. prune_dendrites
        6. integrate_semantics
        7. serialize + сохранить JSON
        8. Вернуть метаданные
        """
        # 1. Загрузка маски
        mask_path = self._find_mask_file(mask_file_id)
        wall_mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        h, w = wall_mask.shape[:2]
        
        # 2–6. Пайплайн
        corridor_mask = extract_corridor_mask(wall_mask, rooms, w, h)
        skeleton = build_skeleton(corridor_mask)
        G = build_topology_graph(skeleton)
        G = prune_dendrites(G, min_branch_length=20.0)
        G = integrate_semantics(G, rooms, doors, w, h)
        
        # 7. Сериализация
        nav_data = serialize_nav_graph(G, w, h, scale_factor)
        
        nav_path = mask_path.replace('.png', '_nav.json')
        with open(nav_path, 'w') as f:
            json.dump(nav_data, f)
        
        # 8. Опционально: сохранить скелет как PNG для визуализации
        skeleton_path = mask_path.replace('.png', '_skeleton.png')
        cv2.imwrite(skeleton_path, skeleton)
        
        return nav_data["metadata"]
```

---

## Подзадача 5: API endpoint

**Файл:** `backend/app/api/reconstruction.py`

```python
# Pydantic модели (в reconstruction.py или отдельном файле)
class BuildNavGraphRequest(BaseModel):
    mask_file_id: str
    rooms: list[dict]     # RoomAnnotation как dict
    doors: list[dict]     # DoorAnnotation как dict
    scale_factor: float = 0.05

class BuildNavGraphResponse(BaseModel):
    graph_id: str         # = mask_file_id
    nodes_count: int
    edges_count: int
    room_nodes: list[str]
    door_nodes: list[str]


# Endpoint
@router.post("/nav-graph", response_model=BuildNavGraphResponse)
async def build_nav_graph(request: BuildNavGraphRequest):
    svc = NavService()
    metadata = await svc.build_graph(
        mask_file_id=request.mask_file_id,
        rooms=request.rooms,
        doors=request.doors,
        scale_factor=request.scale_factor,
    )
    return BuildNavGraphResponse(
        graph_id=request.mask_file_id,
        **metadata,
    )
```

Также добавить **GET endpoint** для получения данных графа (узлы, рёбра, координаты) — нужен фронтенду для визуализации:

```python
@router.get("/nav-graph/{graph_id}")
async def get_nav_graph(graph_id: str):
    """Возвращает полный граф для визуализации на фронтенде."""
    svc = NavService()
    nav_data = svc.load_graph(graph_id)  # читает JSON с диска
    return nav_data  # { metadata: {...}, graph: { nodes: [...], links: [...] } }
```

---

## Подзадача 6: Типы и DoorAnnotation — привязка к комнате

**Файл:** `frontend/src/types/wizard.ts`

Добавить `room_id` в `DoorAnnotation`:

```typescript
export interface DoorAnnotation {
  id: string;
  x1: number;  // нормализованные 0–1
  y1: number;
  x2: number;
  y2: number;
  room_id?: string | null;  // ← НОВОЕ: ID комнаты, к которой привязана дверь
}
```

**Файл:** `WallEditorCanvas.tsx`

При создании двери — привязывать к ближайшей комнате:

```typescript
// В секции tool === 'door', после создания линии:
// Найти ближайшую комнату
const doorMidX = (startPoint.x + endX) / 2 / canvas.getWidth();
const doorMidY = (startPoint.y + endY) / 2 / canvas.getHeight();

let closestRoomId: string | null = null;
let minDist = Infinity;
for (const room of roomsRef.current) {
  const roomCx = room.x + room.width / 2;
  const roomCy = room.y + room.height / 2;
  const dist = Math.hypot(roomCx - doorMidX, roomCy - doorMidY);
  if (dist < minDist) {
    minDist = dist;
    closestRoomId = room.id;
  }
}

doorsRef.current.push({
  id,
  x1: startPoint.x / canvas.getWidth(),
  y1: startPoint.y / canvas.getHeight(),
  x2: endX / canvas.getWidth(),
  y2: endY / canvas.getHeight(),
  room_id: closestRoomId,  // ← привязка
});
```

---

## Подзадача 7: Wizard — 5→6 шагов

**Файл:** `frontend/src/hooks/useWizard.ts`

Добавить в `WizardState`:

```typescript
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6;  // было до 5
  // ... существующие поля ...
  navGraphId: string | null;       // НОВОЕ
  navGraphData: NavGraphData | null; // НОВОЕ — для визуализации
}
```

Добавить `buildNavGraph`:

```typescript
const buildNavGraph = useCallback(async (maskId: string, rooms: RoomAnnotation[], doors: DoorAnnotation[]) => {
  setState((s) => ({ ...s, isLoading: true, error: null }));
  try {
    const data = await reconstructionApi.buildNavGraph(maskId, rooms, doors);
    setState((s) => ({
      ...s,
      navGraphId: data.graph_id,
      isLoading: false,
      step: 4,  // Переход на новый шаг
    }));
    return data;
  } catch {
    setState((s) => ({ ...s, isLoading: false, error: 'Ошибка построения графа' }));
    return null;
  }
}, []);
```

Обновить `nextStep` и `prevStep`: max step = 6. Обновить `buildMesh` → вызывается из шага 4, переводит на шаг 5.

**Файл:** `frontend/src/pages/WizardPage.tsx`

```typescript
// handleNext:
} else if (state.step === 3 && canvasRef.current) {
  const blob = await canvasRef.current.getBlob();
  const { rooms, doors } = canvasRef.current.getAnnotations();
  const editedMaskId = await wizard.saveMaskAndAnnotations(blob, rooms, doors);
  if (editedMaskId) {
    await wizard.buildNavGraph(editedMaskId, rooms, doors);
    // → переход на шаг 4 (NavGraph) внутри buildNavGraph
  }
} else if (state.step === 4) {
  // Кнопка "> ПОСТРОИТЬ 3D"
  await wizard.buildMesh(state.editedMaskFileId || state.maskFileId);
  // → переход на шаг 5 (View3D) внутри buildMesh
} else if (state.step === 5) {
  wizard.nextStep(); // → шаг 6 (Save)
}

// renderStep:
case 4:
  return (
    <StepNavGraph
      navGraphId={state.navGraphId}
      maskUrl={...}   // отредактированная маска для фона
    />
  );
case 5:
  return <StepView3D ... />;
case 6:
  return <StepSave ... />;
```

Обновить `nextLabel`:
```typescript
nextLabel={
  state.step === 3 ? '> ПОСТРОИТЬ ГРАФ' :
  state.step === 4 ? '> ПОСТРОИТЬ 3D' :
  undefined
}
```

---

## Подзадача 8: Компонент StepNavGraph (frontend)

**Файл:** `frontend/src/components/Wizard/StepNavGraph.tsx`

Новый шаг wizard'а. Показывает маску с наложенным графом. Справа — панель с информацией и легендой.

### Визуализация графа на Canvas

Использовать обычный HTML Canvas (не Fabric.js — тут не нужно редактирование объектов, только отрисовка):

```typescript
interface StepNavGraphProps {
  navGraphId: string | null;
  maskUrl: string;
}

export const StepNavGraph: React.FC<StepNavGraphProps> = ({ navGraphId, maskUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [graphData, setGraphData] = useState<NavGraphData | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, rooms: 0, doors: 0 });
  
  // Загрузка данных графа
  useEffect(() => {
    if (!navGraphId) return;
    reconstructionApi.getNavGraph(navGraphId).then((data) => {
      setGraphData(data);
      setStats({
        nodes: data.metadata.nodes_count,
        edges: data.metadata.edges_count,
        rooms: data.metadata.room_nodes.length,
        doors: data.metadata.door_nodes.length,
      });
    });
  }, [navGraphId]);
  
  // Отрисовка
  useEffect(() => {
    if (!canvasRef.current || !graphData) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    // Загружаем маску как фон
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
      
      // Рисуем рёбра
      for (const link of graphData.graph.links) {
        const sourceNode = graphData.graph.nodes.find(n => n.id === link.source);
        const targetNode = graphData.graph.nodes.find(n => n.id === link.target);
        if (!sourceNode || !targetNode) continue;
        
        // Цвет по типу ребра
        const color = link.type === 'corridor_edge' ? 'rgba(255,255,255,0.4)' :
                      link.type === 'room_to_door' ? '#FF4500' :
                      link.type === 'door_to_corridor' ? '#4CAF50' :
                      'rgba(255,255,255,0.2)';
        
        ctx.strokeStyle = color;
        ctx.lineWidth = link.type === 'corridor_edge' ? 1 : 2;
        ctx.beginPath();
        // Если есть pts — рисуем по точкам, иначе прямая
        const pts = link.pts;
        if (pts && pts.length > 1) {
          ctx.moveTo(pts[0][0] * scaleX, pts[0][1] * scaleY);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0] * scaleX, pts[i][1] * scaleY);
          }
        } else {
          ctx.moveTo(sourceNode.pos[0] * scaleX, sourceNode.pos[1] * scaleY);
          ctx.lineTo(targetNode.pos[0] * scaleX, targetNode.pos[1] * scaleY);
        }
        ctx.stroke();
      }
      
      // Рисуем узлы
      for (const node of graphData.graph.nodes) {
        const [x, y] = [node.pos[0] * scaleX, node.pos[1] * scaleY];
        const radius = node.type === 'room' ? 6 :
                       node.type === 'door' ? 5 :
                       node.type === 'corridor_entry' ? 4 : 3;
        const color = node.type === 'room' ? '#FF4500' :
                      node.type === 'door' ? '#4CAF50' :
                      node.type === 'corridor_entry' ? '#2196F3' :
                      '#666';
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Подпись для комнат
        if (node.type === 'room' && node.room_name) {
          ctx.fillStyle = '#FF4500';
          ctx.font = '10px Courier New';
          ctx.fillText(node.room_name, x + 8, y + 4);
        }
      }
    };
    img.src = maskUrl;
  }, [graphData, maskUrl]);
  
  return (
    <div className={styles.step}>
      <div className={styles.canvasArea}>
        <div className={styles.gridBg} />
        <div className={styles.canvasBox}>
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
      </div>
      
      <div className={panelStyles.panel}>
        <div className={panelStyles.inner}>
          {/* Статистика */}
          <div>
            <div className={panelStyles.sectionTitle}>// НАВИГАЦИОННЫЙ ГРАФ</div>
            <div className={styles.statsGrid}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.nodes}</span>
                <span className={styles.statLabel}>Узлов</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.edges}</span>
                <span className={styles.statLabel}>Рёбер</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.rooms}</span>
                <span className={styles.statLabel}>Комнат</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.doors}</span>
                <span className={styles.statLabel}>Дверей</span>
              </div>
            </div>
          </div>
          
          <div className={panelStyles.sectionDivider} />
          
          {/* Легенда */}
          <div>
            <div className={panelStyles.sectionTitle}>// ЛЕГЕНДА</div>
            <div className={styles.legendSection}>
              <div className={styles.legendItem}>
                <span className={styles.dot} style={{ background: '#666' }} />
                <span>Узел коридора</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.dot} style={{ background: '#FF4500' }} />
                <span>Комната</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.dot} style={{ background: '#4CAF50' }} />
                <span>Дверь</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.dot} style={{ background: '#2196F3' }} />
                <span>Вход в коридор</span>
              </div>
            </div>
          </div>
          
          <div className={panelStyles.sectionDivider} />
          
          {/* Действия */}
          <div>
            <div className={panelStyles.sectionTitle}>// ДЕЙСТВИЯ</div>
            <div className={styles.actionsSection}>
              <button className={styles.actionBtn} onClick={handleRebuild}>
                Перестроить граф
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### CSS (StepNavGraph.module.css)

Переиспользует существующие стили из `StepWallEditor.module.css` (`.step`, `.canvasArea`, `.gridBg`, `.canvasBox`) + добавляет:

```css
.statsGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 16px 12px;
}

.statItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.statValue {
  font-family: 'Courier New', monospace;
  font-size: 24px;
  font-weight: 700;
  color: #FF4500;
}

.statLabel {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  color: #666;
}

.legendSection {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 12px;
}

.legendItem {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  color: #999;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.actionBtn {
  width: 100%;
  padding: 12px 16px;
  background: #1a1a1a;
  border: 2px solid transparent;
  color: #999;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  cursor: pointer;
  border-radius: 0;
  transition: border-color 0.15s, color 0.15s;
}

.actionBtn:hover {
  border-color: #FF4500;
  color: #FF4500;
}
```

---

## Подзадача 9: Тесты — `backend/tests/processing/test_nav_graph.py`

```python
import numpy as np
import pytest
from app.processing.nav_graph import (
    extract_corridor_mask,
    build_skeleton,
    build_topology_graph,
    prune_dendrites,
    integrate_semantics,
)


class TestExtractCorridorMask:
    def test_inverts_mask(self):
        """Белые стены → чёрные, чёрное свободное → белое."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[0:10, :] = 255  # стена сверху
        result = extract_corridor_mask(mask, [], 100, 100)
        assert result[50, 50] == 255  # свободное пространство
        assert result[5, 50] == 0     # стена

    def test_subtracts_rooms(self):
        """Комнаты вычитаются из свободного пространства."""
        mask = np.zeros((100, 100), dtype=np.uint8)  # всё свободно
        rooms = [{"room_type": "room", "x": 0.2, "y": 0.2, "width": 0.3, "height": 0.3}]
        result = extract_corridor_mask(mask, rooms, 100, 100)
        assert result[35, 35] == 0  # внутри комнаты — не коридор

    def test_corridor_type_not_subtracted(self):
        """Тип 'corridor' НЕ вычитается."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        rooms = [{"room_type": "corridor", "x": 0.2, "y": 0.2, "width": 0.3, "height": 0.3}]
        result = extract_corridor_mask(mask, rooms, 100, 100)
        assert result[35, 35] == 255  # остаётся как коридор


class TestBuildSkeleton:
    def test_produces_thin_skeleton(self):
        """Скелет должен быть не толще 1 пикселя."""
        corridor = np.zeros((100, 200), dtype=np.uint8)
        corridor[40:60, 10:190] = 255  # Горизонтальный коридор 20px
        skeleton = build_skeleton(corridor)
        assert np.any(skeleton > 0)
        # Скелет должен быть значительно тоньше оригинала
        assert np.sum(skeleton > 0) < np.sum(corridor > 0) / 5


class TestBuildTopologyGraph:
    def test_creates_graph_from_skeleton(self):
        """Из скелета создаётся граф с узлами и рёбрами."""
        corridor = np.zeros((100, 200), dtype=np.uint8)
        corridor[45:55, 10:190] = 255
        skeleton = build_skeleton(corridor)
        G = build_topology_graph(skeleton)
        assert G.number_of_nodes() > 0
        assert G.number_of_edges() > 0


class TestPruneDendrites:
    def test_removes_short_branches(self):
        """Короткие тупики удаляются."""
        import networkx as nx
        G = nx.Graph()
        G.add_node(0, type='corridor_node', pos=(0, 0))
        G.add_node(1, type='corridor_node', pos=(100, 0))
        G.add_node(2, type='corridor_node', pos=(50, 0))
        G.add_node(3, type='corridor_node', pos=(50, 10))  # Короткий тупик
        G.add_edge(0, 2, weight=50, type='corridor_edge')
        G.add_edge(2, 1, weight=50, type='corridor_edge')
        G.add_edge(2, 3, weight=10, type='corridor_edge')  # < 20 → удалить
        G = prune_dendrites(G, min_branch_length=20.0)
        assert 3 not in G.nodes()
```

---

## Порядок реализации

1. Зависимости (`requirements.txt`)
2. `nav_graph.py` — 5 pure functions + сериализация
3. `nav_service.py` — оркестратор
4. API endpoints (`POST /nav-graph`, `GET /nav-graph/{id}`)
5. Тесты `test_nav_graph.py`
6. `types/wizard.ts` — DoorAnnotation + room_id
7. `WallEditorCanvas.tsx` — привязка двери к комнате
8. `useWizard.ts` — 6 шагов, buildNavGraph, navGraphId
9. `WizardPage.tsx` — новый step 4, сдвиг шагов
10. `StepIndicator.tsx` — 6 кружков
11. `StepNavGraph.tsx` + CSS — экран визуализации графа
12. `npx tsc --noEmit` + `pytest`

---

## Чеклист после реализации

**Backend:**
- [ ] `scikit-image`, `sknw`, `networkx`, `shapely` установлены
- [ ] `extract_corridor_mask` — инвертирует маску, вычитает комнаты, НЕ вычитает corridor
- [ ] `build_skeleton` — скелетонизация, скелет толщиной 1px
- [ ] `build_topology_graph` — граф из скелета, координаты (X,Y) а не (Y,X)
- [ ] `prune_dendrites` — тупики < 20px удалены
- [ ] `integrate_semantics` — комнаты, двери, snap к коридору, расщепление рёбер
- [ ] `serialize_nav_graph` — JSON с metadata (scale_factor, mask_width/height)
- [ ] `POST /nav-graph` — принимает mask_file_id + rooms + doors, сохраняет JSON
- [ ] `GET /nav-graph/{id}` — возвращает полные данные графа
- [ ] Тесты — pass
- [ ] `pytest` — pass

**Frontend:**
- [ ] `DoorAnnotation.room_id` — привязка к ближайшей комнате при создании
- [ ] Wizard — 6 шагов (индикатор показывает 6 кружков)
- [ ] Шаг 3: "ПОСТРОИТЬ" → saveMask + buildNavGraph → шаг 4
- [ ] Шаг 4: StepNavGraph — маска + overlay графа (узлы, рёбра, подписи)
- [ ] Шаг 4: панель справа — статистика (узлов/рёбер/комнат/дверей)
- [ ] Шаг 4: панель справа — легенда цветов
- [ ] Шаг 4: панель справа — кнопка "Перестроить граф"
- [ ] Шаг 4: "ПОСТРОИТЬ 3D" → buildMesh → шаг 5
- [ ] Шаг 5: View3D — без изменений
- [ ] Шаг 6: Save — без изменений
- [ ] Дизайн: брутализм, тёмная тема, шрифты как на шаге 3
- [ ] `npx tsc --noEmit` — без ошибок