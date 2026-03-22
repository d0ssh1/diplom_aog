# Behavior: nav-graph-room-segmentation

## Data Flow Diagram

```mermaid
flowchart LR
    WallMask([wall_mask\nnp.ndarray]) --> DT[distanceTransform\nсвободного пространства]
    DT --> Thresh[Порог:\ndist >= k * wall_thickness_px]
    Thresh --> WideMask[wide_passage_mask\nширокие проходы]
    WideMask --> CC[connectedComponents\nвыбор крупнейшего\nвнутреннего компонента]
    CC --> CorridorRough[corridor_rough]
    CorridorRough --> Expand[Дилатация обратно\n+ AND с free_space]
    Expand --> RoomSub[Вычитание\nразмеченных комнат]
    RoomSub --> Result([corridor_mask\nnp.ndarray])
    WallThickness([wall_thickness_px\nfloat]) --> Thresh
```

## Sequence Diagrams

### Use Case 1: Построение навигационного графа (happy path)

```mermaid
sequenceDiagram
    actor User
    participant Router as api/navigation.py
    participant Service as nav_service.py
    participant Pipeline as pipeline.py
    participant NavGraph as nav_graph.py

    User->>Router: POST /api/v1/nav/build {mask_file_id, rooms, doors}
    Router->>Service: await build_graph(mask_file_id, rooms, doors)
    Service->>Service: cv2.imread(mask_path) → wall_mask
    Service->>Pipeline: compute_wall_thickness(wall_mask)
    Pipeline-->>Service: wall_thickness_px (float)
    Service->>NavGraph: extract_corridor_mask(wall_mask, rooms, w, h, wall_thickness_px)
    Note over NavGraph: distanceTransform(free_space)<br/>порог = k * wall_thickness_px<br/>connectedComponents → крупнейший внутренний
    NavGraph-->>Service: corridor_mask (np.ndarray)
    Service->>NavGraph: build_skeleton(corridor_mask)
    NavGraph-->>Service: skeleton
    Service->>NavGraph: build_topology_graph(skeleton)
    NavGraph-->>Service: G (nx.Graph)
    Service->>NavGraph: prune_dendrites(G)
    Service->>NavGraph: integrate_semantics(G, rooms, doors, w, h)
    Service->>NavGraph: serialize_nav_graph(G, w, h, scale_factor)
    Service->>Service: json.dump → _nav.json
    Service-->>Router: metadata dict
    Router-->>User: 200 JSON {nodes, edges, ...}
```

**Error cases:**

| Условие | HTTP Status | Поведение |
|---------|-------------|-----------|
| Маска не найдена | 404 | FileNotFoundError → service возвращает ошибку |
| Маска не читается | 500 | ValueError → логируется, возвращается 500 |
| `wall_thickness_px == 0` | — | Используется fallback порог (константа), логируется warning |
| Свободное пространство пустое | — | Возвращается `np.zeros_like(wall_mask)`, логируется warning |
| Все компоненты касаются границ | — | Fallback: крупнейший не-экстерьерный компонент (поведение сохраняется) |

**Edge cases:**

| Ситуация | Поведение |
|----------|-----------|
| Очень тонкие стены (`wall_thickness_px < 3`) | `corridor_threshold` зажат снизу минимальным значением (3 px) |
| Очень толстые стены (> 30 px) | Порог растёт пропорционально — коридор должен быть шире стены |
| Нет комнат (`rooms = []`) | Шаг вычитания комнат пропускается без ошибки |

### Use Case 1b: Обработка `wall_thickness_px == 0` (fallback)

```mermaid
sequenceDiagram
    participant Service as nav_service.py
    participant Pipeline as pipeline.py
    participant NavGraph as nav_graph.py

    Service->>Pipeline: compute_wall_thickness(wall_mask)
    Pipeline-->>Service: 0.0 (нет пикселей стен)
    Note over Service: wall_thickness_px = 0.0
    Service->>NavGraph: extract_corridor_mask(wall_mask, rooms, w, h, wall_thickness_px=0.0)
    Note over NavGraph: corridor_threshold = max(MIN_CORRIDOR_PX=3.0, 1.5 * 0.0)<br/>= 3.0 (fallback)<br/>logger.warning("wall_thickness_px=0, using MIN_CORRIDOR_PX")
    NavGraph-->>Service: corridor_mask (может быть zeros если нет широких проходов)
```

Это **warning**, не исключение — пайплайн продолжается с минимальным порогом.

---

### Use Case 2: Поиск маршрута (не затрагивается)

`find_route` / `NavService.find_route` не изменяются — они работают с уже
построенным графом. Данный тикет затрагивает только шаг генерации `corridor_mask`.
