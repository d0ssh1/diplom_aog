# Тикет 20: A* поиск маршрута + визуализация пути в 3D-модели

**Приоритет:** Высокий (завершающая фича навигации)  
**Предыдущий тикет:** 19 (навигационный граф — выполнен)  
**Документация:** ADR «Построение топологического навигационного графа» (разделы 6–8)

**Затрагиваемые файлы:**

Backend (изменения):
- `backend/app/processing/nav_graph.py` — новая функция `find_route()`
- `backend/app/services/nav_service.py` — метод `find_route()`, координатная трансформация 2D→3D
- `backend/app/api/reconstruction.py` — новый endpoint `POST /route`
- `backend/app/models/reconstruction.py` — Pydantic модели `FindRouteRequest`, `FindRouteResponse`
- `backend/tests/processing/test_nav_graph.py` — тесты маршрутизации

Frontend (новые):
- `frontend/src/components/MeshViewer/NavigationPath.tsx` — CatmullRomCurve3 сплайн маршрута
- `frontend/src/components/MeshViewer/RoutePanel.tsx` — UI панель «Откуда → Куда»
- `frontend/src/components/MeshViewer/RoutePanel.module.css`

Frontend (изменения):
- `frontend/src/components/Wizard/StepView3D.tsx` — интеграция RoutePanel + NavigationPath
- `frontend/src/hooks/useWizard.ts` — rooms[] в state для передачи на шаг 5
- `frontend/src/api/apiService.ts` — ⚠️ ТОЛЬКО добавить `findRoute()` метод (не менять существующее)

**НЕ МЕНЯТЬ:** `MeshViewer.tsx` (внутреннюю логику Three.js viewer'а), существующие методы в `apiService.ts`

---

## Обзор

### Flow пользователя:

```
Шаг 5 (View 3D): пользователь видит 3D-модель здания
  → Справа панель: два dropdown «Откуда» и «Куда» (список размеченных комнат)
  → Выбирает комнату А и комнату Б
  → Нажимает «Построить маршрут»
  → Backend: A* на навигационном графе → массив 3D-координат
  → Frontend: рисует CatmullRomCurve3 сплайн поверх 3D-модели
  → Показывает дистанцию и время
```

### Архитектура:

```
Frontend                          Backend
────────                          ───────
RoutePanel.tsx                    POST /api/v1/route
  ├─ dropdown «Откуда»              ├─ Загрузить nav.json с диска
  ├─ dropdown «Куда»                ├─ Восстановить nx.Graph
  ├─ кнопка «Построить»             ├─ nx.astar_path (евклидова эвристика)
  └─ дистанция / время              ├─ Реконструировать pts маршрута
                                    ├─ Координатная трансформация 2D→3D
NavigationPath.tsx                  └─ Вернуть JSON с 3D-координатами
  ├─ CatmullRomCurve3
  ├─ centripetal сплайн
  └─ depthTest: false
```

---

## Подзадача 1: Backend — функция `find_route()` в `nav_graph.py`

Добавить в конец файла `backend/app/processing/nav_graph.py`:

```python
def find_route(
    G: nx.Graph,
    from_room_id: str,
    to_room_id: str,
) -> dict | None:
    """
    Поиск кратчайшего пути A* между двумя комнатами.
    
    Возвращает маршрут как список 2D-координат (пиксельных)
    с реконструированными промежуточными точками из pts рёбер.
    
    Args:
        G: навигационный граф (после integrate_semantics)
        from_room_id: ID комнаты-источника (например "room_abc123")
        to_room_id: ID комнаты-назначения
    
    Returns:
        dict с полями:
          - "path_nodes": список ID узлов маршрута
          - "path_coords_2d": список (x, y) пиксельных координат 
                              (с промежуточными точками pts)
          - "total_distance_px": суммарная длина в пикселях
        Или None если путь не найден
    """
    t0 = time.perf_counter()
    
    # Формируем ID узлов
    from_node = from_room_id if from_room_id.startswith("room_") else f"room_{from_room_id}"
    to_node = to_room_id if to_room_id.startswith("room_") else f"room_{to_room_id}"
    
    # Проверяем существование узлов
    if from_node not in G.nodes():
        logger.warning("find_route: source node %s not in graph", from_node)
        return None
    if to_node not in G.nodes():
        logger.warning("find_route: target node %s not in graph", to_node)
        return None
    
    # Проверяем достижимость
    if not nx.has_path(G, from_node, to_node):
        logger.warning("find_route: no path from %s to %s", from_node, to_node)
        return None
    
    # Эвристика A*: евклидово расстояние (admissible — никогда не переоценивает)
    def heuristic(u, v):
        u_pos = G.nodes[u].get('pos', (0, 0))
        v_pos = G.nodes[v].get('pos', (0, 0))
        return math.hypot(u_pos[0] - v_pos[0], u_pos[1] - v_pos[1])
    
    # A* поиск
    try:
        path_nodes = nx.astar_path(G, from_node, to_node, heuristic=heuristic, weight='weight')
    except nx.NetworkXNoPath:
        return None
    
    # Реконструкция полной траектории (с промежуточными точками pts)
    path_coords_2d = []
    total_distance = 0.0
    
    for i in range(len(path_nodes)):
        node = path_nodes[i]
        node_pos = G.nodes[node].get('pos', (0, 0))
        
        if i < len(path_nodes) - 1:
            next_node = path_nodes[i + 1]
            edge_data = G.get_edge_data(node, next_node)
            
            if edge_data:
                total_distance += edge_data.get('weight', 0)
                pts = edge_data.get('pts', [])
                
                if pts and len(pts) > 1:
                    # Определяем направление: pts может быть от node к next_node или наоборот
                    first_pt = pts[0]
                    last_pt = pts[-1]
                    dist_to_first = math.hypot(node_pos[0] - first_pt[0], node_pos[1] - first_pt[1])
                    dist_to_last = math.hypot(node_pos[0] - last_pt[0], node_pos[1] - last_pt[1])
                    
                    if dist_to_first <= dist_to_last:
                        # pts идут от node к next_node — правильный порядок
                        path_coords_2d.extend(pts)
                    else:
                        # pts идут от next_node к node — реверсируем
                        path_coords_2d.extend(reversed(pts))
                else:
                    # Нет промежуточных точек — прямая от node к next_node
                    path_coords_2d.append(node_pos)
            else:
                path_coords_2d.append(node_pos)
        else:
            # Последний узел
            path_coords_2d.append(node_pos)
    
    # Дедупликация последовательных одинаковых точек
    deduped = [path_coords_2d[0]] if path_coords_2d else []
    for pt in path_coords_2d[1:]:
        if pt != deduped[-1]:
            deduped.append(pt)
    
    logger.info("find_route: %s → %s, %d nodes, %d coords, %.0fpx, %.1fms",
                from_node, to_node, len(path_nodes), len(deduped),
                total_distance, (time.perf_counter() - t0) * 1000)
    
    return {
        "path_nodes": path_nodes,
        "path_coords_2d": deduped,
        "total_distance_px": total_distance,
    }
```

---

## Подзадача 2: Backend — координатная трансформация 2D→3D

Добавить в `nav_graph.py`:

```python
def transform_2d_to_3d(
    coords_2d: list[tuple[float, float]],
    mask_width: int,
    mask_height: int,
    scale_factor: float,
    y_offset: float = 0.1,
) -> list[list[float]]:
    """
    Преобразует 2D пиксельные координаты в 3D мировые координаты,
    совместимые с Three.js (правосторонняя система).
    
    Формулы (из ADR, раздел 7):
        x_3d = (x_pix - W/2) * S
        y_3d = Y_offset           (высота над полом, предотвращает Z-fighting)
        z_3d = (y_pix - H/2) * S
    
    Args:
        coords_2d: список (x_pix, y_pix)
        mask_width: W — ширина маски в пикселях
        mask_height: H — высота маски в пикселях
        scale_factor: S — метров на пиксель (из mesh_builder)
        y_offset: высота линии маршрута над полом (default 0.1м)
    
    Returns:
        список [x_3d, y_3d, z_3d] координат
    """
    half_w = mask_width / 2.0
    half_h = mask_height / 2.0
    
    coords_3d = []
    for (x_pix, y_pix) in coords_2d:
        x_3d = (x_pix - half_w) * scale_factor
        y_3d = y_offset
        z_3d = (y_pix - half_h) * scale_factor
        coords_3d.append([round(x_3d, 4), round(y_3d, 4), round(z_3d, 4)])
    
    return coords_3d
```

**Важно:** `scale_factor` должен совпадать с тем, что использует `mesh_builder.py`. В тикете 19 он сохраняется в `_nav.json` → `metadata.scale_factor`. При реализации нужно проверить что `mesh_builder.py` использует тот же масштаб и ту же формулу центрирования (`- W/2`, `- H/2`). Если `mesh_builder` центрирует иначе — подстроить формулу.

**Как проверить:** открыть `backend/app/processing/mesh_builder.py`, найти где вычисляется координатная трансформация для GLB-меша, и убедиться что формулы идентичны.

---

## Подзадача 3: Backend — `NavService.find_route()` в `nav_service.py`

Добавить метод в существующий `NavService`:

```python
async def find_route(
    self,
    graph_id: str,
    from_room_id: str,
    to_room_id: str,
) -> dict | None:
    """
    Загружает граф с диска, ищет маршрут A*, трансформирует в 3D.
    
    Returns:
        dict: {
            "status": "success" | "no_path" | "error",
            "from_room": "1103",
            "to_room": "1112",
            "total_distance_px": 842.5,
            "total_distance_meters": 42.1,
            "estimated_time_seconds": 35,
            "coordinates": [[x,y,z], [x,y,z], ...]
        }
    """
    # 1. Загрузить граф
    nav_data = self.load_graph(graph_id)
    if not nav_data:
        return {"status": "error", "message": "Graph not found"}
    
    G, metadata = deserialize_nav_graph(nav_data)
    
    # 2. A* поиск
    route = find_route(G, from_room_id, to_room_id)
    if not route:
        return {
            "status": "no_path",
            "message": f"No path from {from_room_id} to {to_room_id}",
        }
    
    # 3. Координатная трансформация
    scale_factor = metadata.get('scale_factor', 0.05)
    mask_width = metadata.get('mask_width', 1000)
    mask_height = metadata.get('mask_height', 500)
    
    coords_3d = transform_2d_to_3d(
        route['path_coords_2d'],
        mask_width, mask_height,
        scale_factor,
        y_offset=0.1,
    )
    
    # 4. Метрики
    distance_meters = route['total_distance_px'] * scale_factor
    # Средняя скорость пешехода ~1.2 м/с
    estimated_time = distance_meters / 1.2
    
    # 5. Имена комнат
    from_name = G.nodes.get(f"room_{from_room_id}", {}).get('room_name', from_room_id)
    to_name = G.nodes.get(f"room_{to_room_id}", {}).get('room_name', to_room_id)
    
    return {
        "status": "success",
        "from_room": from_name,
        "to_room": to_name,
        "total_distance_px": round(route['total_distance_px'], 1),
        "total_distance_meters": round(distance_meters, 1),
        "estimated_time_seconds": round(estimated_time),
        "coordinates": coords_3d,
        "path_nodes_count": len(route['path_nodes']),
    }
```

---

## Подзадача 4: Backend — API endpoint `POST /route`

**Файл:** `backend/app/api/reconstruction.py`

Pydantic модели:

```python
class FindRouteRequest(BaseModel):
    graph_id: str           # = mask_file_id (тот же что в nav-graph)
    from_room_id: str       # ID комнаты (без префикса "room_")
    to_room_id: str         # ID комнаты

class FindRouteResponse(BaseModel):
    status: str             # "success" | "no_path" | "error"
    from_room: str | None = None
    to_room: str | None = None
    total_distance_meters: float | None = None
    estimated_time_seconds: int | None = None
    coordinates: list[list[float]] | None = None  # [[x,y,z], ...]
    path_nodes_count: int | None = None
    message: str | None = None
```

Endpoint:

```python
@router.post("/route", response_model=FindRouteResponse)
async def find_route_endpoint(request: FindRouteRequest):
    svc = NavService()
    result = await svc.find_route(
        graph_id=request.graph_id,
        from_room_id=request.from_room_id,
        to_room_id=request.to_room_id,
    )
    return FindRouteResponse(**result)
```

---

## Подзадача 5: Backend — тесты

Добавить в `backend/tests/processing/test_nav_graph.py`:

```python
class TestFindRoute:
    def _make_simple_graph(self):
        """Создаёт тестовый граф: 2 комнаты + коридор между ними."""
        G = nx.Graph()
        # Коридор
        G.add_node(0, type='corridor_node', pos=(50, 100))
        G.add_node(1, type='corridor_node', pos=(200, 100))
        G.add_edge(0, 1, weight=150, type='corridor_edge',
                   pts=[(50, 100), (100, 100), (150, 100), (200, 100)])
        # Комната А
        G.add_node("room_a", type='room', pos=(30, 50), room_name='1103')
        G.add_node("door_a", type='door', pos=(50, 80))
        G.add_node("entry_a", type='corridor_entry', pos=(50, 100))
        G.add_edge("room_a", "door_a", weight=36, type='room_to_door')
        G.add_edge("door_a", "entry_a", weight=20, type='door_to_corridor')
        G.add_edge("entry_a", 0, weight=0.1, type='corridor_edge', pts=[(50, 100)])
        # Комната Б
        G.add_node("room_b", type='room', pos=(220, 50), room_name='1112')
        G.add_node("door_b", type='door', pos=(200, 80))
        G.add_node("entry_b", type='corridor_entry', pos=(200, 100))
        G.add_edge("room_b", "door_b", weight=36, type='room_to_door')
        G.add_edge("door_b", "entry_b", weight=20, type='door_to_corridor')
        G.add_edge("entry_b", 1, weight=0.1, type='corridor_edge', pts=[(200, 100)])
        return G

    def test_finds_route_between_rooms(self):
        G = self._make_simple_graph()
        result = find_route(G, "room_a", "room_b")
        assert result is not None
        assert result['total_distance_px'] > 0
        assert len(result['path_coords_2d']) >= 2

    def test_returns_none_for_missing_node(self):
        G = self._make_simple_graph()
        result = find_route(G, "room_a", "room_nonexistent")
        assert result is None

    def test_returns_none_for_disconnected_rooms(self):
        G = self._make_simple_graph()
        G.add_node("room_isolated", type='room', pos=(500, 500))
        result = find_route(G, "room_a", "room_isolated")
        assert result is None

    def test_route_is_symmetric(self):
        G = self._make_simple_graph()
        r1 = find_route(G, "room_a", "room_b")
        r2 = find_route(G, "room_b", "room_a")
        assert r1 is not None and r2 is not None
        assert abs(r1['total_distance_px'] - r2['total_distance_px']) < 1.0


class TestTransform2dTo3d:
    def test_center_pixel_maps_to_origin(self):
        coords = transform_2d_to_3d([(500, 250)], 1000, 500, 0.05)
        assert coords[0][0] == 0.0  # x_3d
        assert coords[0][2] == 0.0  # z_3d

    def test_y_offset_applied(self):
        coords = transform_2d_to_3d([(0, 0)], 100, 100, 0.05, y_offset=0.1)
        assert coords[0][1] == 0.1

    def test_scale_factor_applied(self):
        coords = transform_2d_to_3d([(100, 0)], 100, 100, 0.1)
        # x_3d = (100 - 50) * 0.1 = 5.0
        assert coords[0][0] == 5.0
```

---

## Подзадача 6: Frontend — `apiService.ts` (минимальное добавление)

⚠️ Добавить ТОЛЬКО один метод. Не менять существующий код.

```typescript
// В объекте reconstructionApi добавить:
findRoute: async (
  graphId: string,
  fromRoomId: string,
  toRoomId: string,
): Promise<{
  status: string;
  from_room?: string;
  to_room?: string;
  total_distance_meters?: number;
  estimated_time_seconds?: number;
  coordinates?: number[][];
  message?: string;
}> => {
  const res = await api.post('/route', {
    graph_id: graphId,
    from_room_id: fromRoomId,
    to_room_id: toRoomId,
  });
  return res.data;
},
```

---

## Подзадача 7: Frontend — `NavigationPath.tsx`

**Файл:** `frontend/src/components/MeshViewer/NavigationPath.tsx`

Компонент отрисовки маршрута поверх 3D-модели. Использует CatmullRomCurve3 для сглаживания поворотов.

```tsx
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

interface NavigationPathProps {
  coordinates: number[][] | null;  // [[x,y,z], ...]
}

export const NavigationPath: React.FC<NavigationPathProps> = ({ coordinates }) => {
  const curvePoints = useMemo(() => {
    if (!coordinates || coordinates.length < 2) return null;
    
    // Конвертируем в Vector3
    const vectors = coordinates.map(
      ([x, y, z]) => new THREE.Vector3(x, y, z)
    );
    
    // Центростремительный сплайн Катмулла-Рома
    // centripetal — исключает самопересечения на резких поворотах
    // tension 0.1 — минимальное натяжение для плавности
    const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.1);
    
    // Дискретизация на 200 точек для плавности
    return curve.getPoints(Math.max(50, coordinates.length * 5));
  }, [coordinates]);
  
  if (!curvePoints) return null;
  
  return (
    <Line
      points={curvePoints}
      color="#00ffcc"           // Неоновый акцентный цвет
      lineWidth={4}
      depthTest={false}        // Рендерить поверх стен (предотвращает скрытие)
    />
  );
};
```

**Цвет `#00ffcc`** — неоновый бирюзовый, хорошо контрастирует с белыми стенами 3D-модели. Можно сделать `#FF4500` (оранжевый, в стиле брутализма) — на выбор.

**`depthTest={false}`** — критически важно (из ADR, раздел 8). Без этого маршрут может частично скрываться за полигонами пола.

---

## Подзадача 8: Frontend — `RoutePanel.tsx`

**Файл:** `frontend/src/components/MeshViewer/RoutePanel.tsx`

Панель справа от 3D-viewer'а с выбором комнат и метриками.

```tsx
import React, { useState } from 'react';
import styles from './RoutePanel.module.css';
import type { RoomAnnotation } from '../../types/wizard';

interface RoutePanelProps {
  rooms: RoomAnnotation[];
  onFindRoute: (fromId: string, toId: string) => void;
  isLoading: boolean;
  routeResult: {
    status: string;
    from_room?: string;
    to_room?: string;
    total_distance_meters?: number;
    estimated_time_seconds?: number;
    message?: string;
  } | null;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  rooms,
  onFindRoute,
  isLoading,
  routeResult,
}) => {
  const [fromRoom, setFromRoom] = useState<string>('');
  const [toRoom, setToRoom] = useState<string>('');
  
  const handleFind = () => {
    if (fromRoom && toRoom && fromRoom !== toRoom) {
      onFindRoute(fromRoom, toRoom);
    }
  };
  
  const canFind = fromRoom && toRoom && fromRoom !== toRoom && !isLoading;
  
  return (
    <div className={styles.panel}>
      <div className={styles.inner}>
        
        {/* Заголовок */}
        <div className={styles.sectionTitle}>// МАРШРУТИЗАЦИЯ</div>
        
        {/* Dropdown Откуда */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Откуда</label>
          <select
            className={styles.select}
            value={fromRoom}
            onChange={(e) => setFromRoom(e.target.value)}
          >
            <option value="">— Выберите комнату —</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name || room.room_type} ({room.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
        
        {/* Dropdown Куда */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Куда</label>
          <select
            className={styles.select}
            value={toRoom}
            onChange={(e) => setToRoom(e.target.value)}
          >
            <option value="">— Выберите комнату —</option>
            {rooms.filter((r) => r.id !== fromRoom).map((room) => (
              <option key={room.id} value={room.id}>
                {room.name || room.room_type} ({room.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
        
        {/* Кнопка */}
        <button
          className={styles.findBtn}
          onClick={handleFind}
          disabled={!canFind}
        >
          {isLoading ? 'Поиск...' : '> НАЙТИ МАРШРУТ'}
        </button>
        
        <div className={styles.divider} />
        
        {/* Результат */}
        {routeResult && routeResult.status === 'success' && (
          <div>
            <div className={styles.sectionTitle}>// МАРШРУТ</div>
            <div className={styles.routeInfo}>
              <div className={styles.routeRow}>
                <span className={styles.routeLabel}>От</span>
                <span className={styles.routeValue}>{routeResult.from_room}</span>
              </div>
              <div className={styles.routeRow}>
                <span className={styles.routeLabel}>До</span>
                <span className={styles.routeValue}>{routeResult.to_room}</span>
              </div>
              <div className={styles.divider} />
              <div className={styles.metricsGrid}>
                <div className={styles.metricItem}>
                  <span className={styles.metricValue}>
                    {routeResult.total_distance_meters?.toFixed(1)}
                  </span>
                  <span className={styles.metricLabel}>метров</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricValue}>
                    {routeResult.estimated_time_seconds}
                  </span>
                  <span className={styles.metricLabel}>секунд</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {routeResult && routeResult.status === 'no_path' && (
          <div className={styles.errorMsg}>
            Маршрут не найден. Проверьте разметку дверей.
          </div>
        )}
        
      </div>
    </div>
  );
};
```

---

## Подзадача 9: Frontend — `RoutePanel.module.css`

Дизайн: брутализм, идентичный правой панели шагов 3 и 4.

```css
.panel {
  width: 300px;
  flex-shrink: 0;
  background: #0d0d0d;
  border-left: 1px solid #1a1a1a;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.inner {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-bottom: 24px;
}

.sectionTitle {
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 12px;
  font-weight: 700;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 2px;
  padding: 16px 16px 12px;
  margin: 0;
}

.fieldGroup {
  padding: 0 16px 12px;
}

.fieldLabel {
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  color: #666;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.select {
  width: 100%;
  padding: 10px 12px;
  background: #1a1a1a;
  border: 2px solid transparent;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  cursor: pointer;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
  transition: border-color 0.15s;
}

.select:focus {
  border-color: #FF4500;
}

.select option {
  background: #1a1a1a;
  color: #fff;
}

.findBtn {
  margin: 8px 16px 0;
  padding: 14px 16px;
  background: #FF4500;
  border: none;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: background 0.15s;
}

.findBtn:hover:not(:disabled) {
  background: #E03E00;
}

.findBtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 16px 16px;
}

.routeInfo {
  padding: 0 16px;
}

.routeRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.routeLabel {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  color: #666;
}

.routeValue {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #FF4500;
  font-weight: 700;
}

.metricsGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

.metricItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metricValue {
  font-family: 'Courier New', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #FF4500;
}

.metricLabel {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 11px;
  color: #666;
}

.errorMsg {
  padding: 12px 16px;
  color: #F44336;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
}
```

---

## Подзадача 10: Frontend — интеграция в `StepView3D.tsx`

**Текущий** `StepView3D` показывает только MeshViewer. Нужно добавить RoutePanel справа и NavigationPath внутрь 3D-сцены.

```tsx
// StepView3D.tsx — обновлённая версия
import React, { useState, useCallback } from 'react';
import { MeshViewer } from '../MeshViewer/MeshViewer';
import { NavigationPath } from '../MeshViewer/NavigationPath';
import { RoutePanel } from '../MeshViewer/RoutePanel';
import { reconstructionApi } from '../../api/apiService';
import type { RoomAnnotation } from '../../types/wizard';

interface StepView3DProps {
  meshUrl: string | null;
  reconstructionId: number | null;
  navGraphId: string | null;   // НОВОЕ
  rooms: RoomAnnotation[];     // НОВОЕ — список комнат для dropdown
}

export const StepView3D: React.FC<StepView3DProps> = ({
  meshUrl,
  reconstructionId,
  navGraphId,
  rooms,
}) => {
  const [routeCoords, setRouteCoords] = useState<number[][] | null>(null);
  const [routeResult, setRouteResult] = useState<any>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  
  const handleFindRoute = useCallback(async (fromId: string, toId: string) => {
    if (!navGraphId) return;
    setIsRoutingLoading(true);
    setRouteCoords(null);
    setRouteResult(null);
    try {
      const result = await reconstructionApi.findRoute(navGraphId, fromId, toId);
      setRouteResult(result);
      if (result.status === 'success' && result.coordinates) {
        setRouteCoords(result.coordinates);
      }
    } catch (err) {
      setRouteResult({ status: 'error', message: 'Ошибка запроса маршрута' });
    } finally {
      setIsRoutingLoading(false);
    }
  }, [navGraphId]);
  
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 3D Viewer — растягивается на всё доступное пространство */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MeshViewer
          meshUrl={meshUrl}
          reconstructionId={reconstructionId}
        >
          {/* NavigationPath рендерится ВНУТРИ Canvas Three.js */}
          <NavigationPath coordinates={routeCoords} />
        </MeshViewer>
      </div>
      
      {/* Панель маршрутизации справа */}
      <RoutePanel
        rooms={rooms}
        onFindRoute={handleFindRoute}
        isLoading={isRoutingLoading}
        routeResult={routeResult}
      />
    </div>
  );
};
```

**Важно по интеграции с MeshViewer:**
`NavigationPath` должен рендериться ВНУТРИ `<Canvas>` Three.js. Если `MeshViewer` не поддерживает `children`, нужно добавить `{children}` в его JSX внутри `<Canvas>`:

```tsx
// В MeshViewer.tsx — если children не проброшены:
<Canvas ...>
  {/* существующие элементы: lights, OrbitControls, mesh */}
  {children}   {/* ← Добавить для NavigationPath */}
</Canvas>
```

Это единственное изменение в `MeshViewer.tsx` — добавление `{children}` в Canvas. Если `children` уже пробрасываются — менять не нужно.

---

## Подзадача 11: Frontend — `useWizard.ts` + `WizardPage.tsx` дополнения

В `useWizard.ts` — убедиться что `rooms` передаются на шаг 5 (View3D):

```typescript
// rooms уже сохраняются в state.rooms через saveMaskAndAnnotations
// Просто убедиться что WizardPage передаёт их в StepView3D
```

В `WizardPage.tsx`, case 5:

```tsx
case 5:
  return (
    <StepView3D
      meshUrl={state.meshUrl}
      reconstructionId={state.reconstructionId}
      navGraphId={state.navGraphId}      // ← Из тикета 19
      rooms={state.rooms}                 // ← Передаём комнаты для dropdown
    />
  );
```

---

## Подзадача 12: Research перед реализацией

Перед написанием кода Claude Code должен:

1. **Прочитать `mesh_builder.py`** — найти `scale_factor` и формулу координатной трансформации. Убедиться что `transform_2d_to_3d` в этом тикете использует идентичную формулу. Если нет — подстроить.

2. **Прочитать `MeshViewer.tsx`** — проверить поддерживает ли он `children` prop. Если нет — добавить `{children}` в `<Canvas>`.

3. **Прочитать `StepView3D.tsx`** — понять текущую структуру и как интегрировать RoutePanel.

4. **Прочитать `nav_service.py`** — проверить метод `load_graph()`, формат данных.

5. **Прочитать `apiService.ts`** — найти точное место для добавления `findRoute()`, не сломав существующее.

---

## Порядок реализации

1. Research: прочитать `mesh_builder.py`, `MeshViewer.tsx`, `StepView3D.tsx`
2. `nav_graph.py` — `find_route()` + `transform_2d_to_3d()`
3. `nav_service.py` — `NavService.find_route()`
4. Pydantic модели + API endpoint `POST /route`
5. Тесты backend
6. `apiService.ts` — добавить `findRoute()`
7. `NavigationPath.tsx` — CatmullRomCurve3 сплайн
8. `RoutePanel.tsx` + CSS — UI панель
9. `StepView3D.tsx` — интеграция
10. `MeshViewer.tsx` — `{children}` в Canvas (если нужно)
11. `WizardPage.tsx` — передать `navGraphId` + `rooms` в StepView3D
12. `npx tsc --noEmit` + `pytest`

---

## Чеклист после реализации

**Backend:**
- [ ] `find_route()` — A* между двумя комнатами, реконструкция pts
- [ ] `transform_2d_to_3d()` — формула совпадает с mesh_builder
- [ ] `NavService.find_route()` — загружает граф, ищет маршрут, трансформирует
- [ ] `POST /route` — принимает graph_id + from/to, возвращает 3D-координаты + метрики
- [ ] Тесты: маршрут находится, symmetry, missing node → None, disconnected → None
- [ ] Тесты: координатная трансформация (center→origin, y_offset, scale)
- [ ] `pytest` — pass

**Frontend:**
- [ ] `apiService.ts` — `findRoute()` добавлен
- [ ] `NavigationPath.tsx` — CatmullRomCurve3, centripetal, depthTest=false
- [ ] `RoutePanel.tsx` — два dropdown с комнатами, кнопка, метрики (метры + секунды)
- [ ] `RoutePanel.module.css` — брутализм, тёмная тема, оранжевый акцент
- [ ] `StepView3D.tsx` — MeshViewer + NavigationPath + RoutePanel
- [ ] `MeshViewer.tsx` — `{children}` проброшен в Canvas
- [ ] Дизайн: dropdown'ы стилизованы (тёмный фон, border-radius: 0)
- [ ] Маршрут визуально проходит по коридорам (не сквозь стены)
- [ ] Маршрут плавно изгибается на поворотах (нет резких углов)
- [ ] При отсутствии маршрута — сообщение об ошибке
- [ ] `npx tsc --noEmit` — без ошибок