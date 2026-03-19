import logging
import math
import time

import cv2
import networkx as nx
import numpy as np
from networkx.readwrite import json_graph
from shapely.geometry import LineString, Point
from skimage.morphology import binary_closing, skeletonize, square

from app.core.exceptions import ImageProcessingError

logger = logging.getLogger(__name__)

_MIN_CORRIDOR_PX: float = 3.0
_MAX_DILATE_PX: int = 30


def extract_corridor_mask(
    wall_mask: np.ndarray,
    rooms: list[dict],
    mask_width: int,
    mask_height: int,
    wall_thickness_px: float,
    corridor_ratio: float = 1.5,
) -> np.ndarray:
    """
    Извлекает маску коридоров через distance transform.

    Пиксели свободного пространства, у которых расстояние до ближайшей стены
    >= corridor_threshold, считаются «широкими проходами» (коридорами).
    Самый большой внутренний компонент расширяется обратно до исходных границ.

    Args:
        wall_mask: бинарная маска стен (uint8, стены=255, фон=0)
        rooms: список комнат с полями x, y, width, height, room_type (нормализованные [0,1])
        mask_width: ширина маски в пикселях
        mask_height: высота маски в пикселях
        wall_thickness_px: толщина стен в пикселях (из compute_wall_thickness)
        corridor_ratio: множитель толщины стены для порога коридора

    Returns:
        Бинарная маска коридоров (uint8, коридор=255, остальное=0)
    """
    t0 = time.perf_counter()

    # 1. Валидация входных данных
    if wall_mask is None or wall_mask.size == 0:
        raise ImageProcessingError("extract_corridor_mask", "Empty mask")
    if wall_mask.dtype != np.uint8:
        raise ImageProcessingError(
            "extract_corridor_mask",
            f"Expected uint8, got {wall_mask.dtype}",
        )

    # 2. Свободное пространство
    free_space = cv2.bitwise_not(wall_mask)

    # 3. Distance transform — расстояние каждого пикселя до ближайшей стены
    dist = cv2.distanceTransform(free_space, cv2.DIST_L2, 5)

    # 4. Порог коридора
    if wall_thickness_px <= 0:
        logger.warning(
            "extract_corridor_mask: wall_thickness_px <= 0, using MIN_CORRIDOR_PX fallback"
        )
        corridor_threshold = _MIN_CORRIDOR_PX
    else:
        corridor_threshold = max(_MIN_CORRIDOR_PX, corridor_ratio * wall_thickness_px)

    # 5. Маска «широких проходов»
    wide_passage = (dist >= corridor_threshold).astype(np.uint8) * 255

    # 6. Проверка наличия широких проходов
    if np.sum(wide_passage > 0) == 0:
        logger.warning("extract_corridor_mask: no wide passages found")
        return np.zeros_like(wall_mask)

    # 7. Связные компоненты широких проходов
    h_mask, w_mask = wall_mask.shape[:2]
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        wide_passage, connectivity=8
    )

    # Компоненты, касающиеся границ изображения (= экстерьер)
    border_labels: set[int] = set()
    border_labels.update(int(v) for v in labels[0, :].flat)
    border_labels.update(int(v) for v in labels[h_mask - 1, :].flat)
    border_labels.update(int(v) for v in labels[:, 0].flat)
    border_labels.update(int(v) for v in labels[:, w_mask - 1].flat)
    border_labels.discard(0)

    max_corridor_area = h_mask * w_mask * 0.5
    biggest_label = -1
    biggest_area = 0

    for label_id in range(1, num_labels):
        if label_id in border_labels:
            continue
        area = int(stats[label_id, cv2.CC_STAT_AREA])
        if area > max_corridor_area:
            continue
        if area > biggest_area:
            biggest_area = area
            biggest_label = label_id

    # Фоллбэк: все компоненты касаются границ — берём самый большой
    # НЕ-экстерьерный border-компонент
    if biggest_label == -1:
        logger.warning(
            "extract_corridor_mask: all components touch border, using biggest non-exterior"
        )
        exterior_label = -1
        exterior_area = 0
        for label_id in range(1, num_labels):
            if label_id in border_labels:
                area = int(stats[label_id, cv2.CC_STAT_AREA])
                if area > exterior_area:
                    exterior_area = area
                    exterior_label = label_id

        for label_id in range(1, num_labels):
            if label_id == exterior_label:
                continue
            area = int(stats[label_id, cv2.CC_STAT_AREA])
            if area > biggest_area:
                biggest_area = area
                biggest_label = label_id

        # Последний resort — взять экстерьер
        if biggest_label == -1:
            biggest_label = exterior_label
            biggest_area = exterior_area

    if biggest_label == -1:
        logger.warning("extract_corridor_mask: no free space found")
        return np.zeros_like(wall_mask)

    # 8. Грубая маска коридора
    corridor_rough = np.zeros_like(wall_mask)
    corridor_rough[labels == biggest_label] = 255

    # 9. Расширяем обратно → пересекаем с оригиналом → точные границы
    dilate_px = max(1, min(int(wall_thickness_px) if wall_thickness_px > 0 else 1, _MAX_DILATE_PX))
    dilate_kernel = np.ones((dilate_px, dilate_px), np.uint8)
    corridor_expanded = cv2.dilate(corridor_rough, dilate_kernel)
    corridor_mask = cv2.bitwise_and(free_space, corridor_expanded)

    # 10. Вычитаем размеченные комнаты
    room_types_to_subtract = {'room', 'staircase', 'elevator'}
    manual_subtracted = 0
    for room in rooms:
        if room.get('room_type', 'room') in room_types_to_subtract:
            x = int(room['x'] * mask_width)
            y = int(room['y'] * mask_height)
            w = int(room['width'] * mask_width)
            h = int(room['height'] * mask_height)
            cv2.rectangle(corridor_mask, (x, y), (x + w, y + h), 0, -1)
            manual_subtracted += 1

    # 11. Логирование
    logger.info(
        "extract_corridor_mask: %dx%d, threshold=%.1f (ratio=%.1f * %.1fpx), "
        "components=%d, biggest=%.0f%%, manual_sub=%d, %.1fms",
        mask_width, mask_height,
        corridor_threshold, corridor_ratio, wall_thickness_px,
        num_labels - 1,
        biggest_area / max(1, np.sum(free_space > 0)) * 100,
        manual_subtracted,
        (time.perf_counter() - t0) * 1000,
    )

    return corridor_mask


def build_skeleton(corridor_mask: np.ndarray) -> np.ndarray:
    """
    Применяет морфологическое закрытие и скелетонизацию к маске коридоров.
    """
    t0 = time.perf_counter()

    binary = corridor_mask > 0
    cleaned = binary_closing(binary, square(5))
    skeleton = skeletonize(cleaned)
    result = skeleton.astype(np.uint8) * 255

    logger.info("build_skeleton: %.1fms", (time.perf_counter() - t0) * 1000)
    return result


def build_topology_graph(skeleton: np.ndarray) -> nx.Graph:
    """
    Строит топологический граф из пиксельного скелета через sknw.
    """
    import sknw

    t0 = time.perf_counter()

    skel_input = (skeleton > 0).astype(np.uint16)
    graph_sk = sknw.build_sknw(skel_input, multi=False, iso=False)

    G = nx.Graph()

    for node_id in graph_sk.nodes():
        cy, cx = graph_sk.nodes[node_id]['o']
        G.add_node(
            int(node_id),
            type='corridor_node',
            pos=(float(cx), float(cy)),
        )

    for u, v, edge_data in graph_sk.edges(data=True):
        weight = float(edge_data.get('weight', 0))
        pts = [(float(pt[1]), float(pt[0])) for pt in edge_data.get('pts', [])]
        G.add_edge(
            int(u), int(v),
            weight=weight,
            pts=pts,
            type='corridor_edge',
        )

    logger.info(
        "build_topology_graph: %d nodes, %d edges, %.1fms",
        G.number_of_nodes(), G.number_of_edges(),
        (time.perf_counter() - t0) * 1000,
    )
    return G


def prune_dendrites(G: nx.Graph, min_branch_length: float = 20.0) -> nx.Graph:
    """
    Удаляет короткие тупиковые ответвления скелета (дендриты).
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

    logger.info(
        "prune_dendrites: removed %d dead ends, %.1fms",
        removed_total, (time.perf_counter() - t0) * 1000,
    )
    return G


def integrate_semantics(
    G: nx.Graph,
    rooms: list[dict],
    doors: list[dict],
    mask_width: int,
    mask_height: int,
) -> nx.Graph:
    """
    Интегрирует семантические объекты (комнаты, двери) в топологический граф коридоров.
    """
    t0 = time.perf_counter()

    # --- 1. Узлы комнат ---
    room_nodes: dict[str, str] = {}
    for room in rooms:
        rx = room['x'] * mask_width
        ry = room['y'] * mask_height
        rw = room['width'] * mask_width
        rh = room['height'] * mask_height
        cx = rx + rw / 2.0
        cy = ry + rh / 2.0

        node_id = f"room_{room['id']}"
        G.add_node(
            node_id,
            type='room',
            pos=(cx, cy),
            room_id=room['id'],
            room_name=room.get('name', ''),
            room_type=room.get('room_type', 'room'),
            bbox=(rx, ry, rw, rh),
        )
        room_nodes[room['id']] = node_id

    # --- 2. Геометрия коридоров для snap ---
    edges_geometry = []
    for u, v, data in list(G.edges(data=True)):
        if data.get('type') == 'corridor_edge' and data.get('pts'):
            pts = data['pts']
            if len(pts) >= 2:
                line = LineString(pts)
                edges_geometry.append((u, v, line, data))

    # --- 3. Обработка дверей ---
    for door in doors:
        dx1 = door['x1'] * mask_width
        dy1 = door['y1'] * mask_height
        dx2 = door['x2'] * mask_width
        dy2 = door['y2'] * mask_height
        dmx = (dx1 + dx2) / 2.0
        dmy = (dy1 + dy2) / 2.0

        door_node_id = f"door_{door['id']}"
        G.add_node(door_node_id, type='door', pos=(dmx, dmy), door_id=door['id'])

        # --- 3a. Связь дверь→комната ---
        linked_room_node = None
        if door.get('room_id') and door['room_id'] in room_nodes:
            linked_room_node = room_nodes[door['room_id']]
        else:
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
            G.add_edge(linked_room_node, door_node_id, weight=dist_room_door, type='room_to_door')

        # --- 3b. Snap дверь → скелет коридора ---
        if not edges_geometry:
            continue

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

        if best_snap is None or best_edge is None:
            continue

        u, v, geom_line, edge_data = best_edge
        entry_node_id = f"entry_{door['id']}"
        ex, ey = best_snap.x, best_snap.y

        G.add_node(entry_node_id, type='corridor_entry', pos=(ex, ey))
        G.add_edge(door_node_id, entry_node_id, weight=best_dist, type='door_to_corridor')

        # --- 3c. Расщепление ребра коридора ---
        u_pos = np.array(G.nodes[u]['pos'])
        v_pos = np.array(G.nodes[v]['pos'])
        entry_pos = np.array([ex, ey])

        dist_u_entry = float(np.linalg.norm(u_pos - entry_pos))
        dist_v_entry = float(np.linalg.norm(v_pos - entry_pos))

        proj_normalized = geom_line.project(best_snap, normalized=True)
        total_pts = edge_data.get('pts', [])
        split_idx = max(1, int(len(total_pts) * proj_normalized))
        pts_u_to_entry = total_pts[:split_idx] + [(ex, ey)]
        pts_entry_to_v = [(ex, ey)] + total_pts[split_idx:]

        if G.has_edge(u, v):
            G.remove_edge(u, v)

        G.add_edge(u, entry_node_id, weight=dist_u_entry, type='corridor_edge', pts=pts_u_to_entry)
        G.add_edge(entry_node_id, v, weight=dist_v_entry, type='corridor_edge', pts=pts_entry_to_v)

    logger.info(
        "integrate_semantics: +%d rooms, +%d doors, %.1fms",
        len(rooms), len(doors), (time.perf_counter() - t0) * 1000,
    )
    return G


def serialize_nav_graph(
    G: nx.Graph,
    mask_width: int,
    mask_height: int,
    scale_factor: float,
) -> dict:
    """Сериализует граф в JSON-совместимый словарь."""
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
    """Восстанавливает граф из JSON. Returns: (nx.Graph, metadata_dict)"""
    G = json_graph.node_link_graph(data["graph"])
    return G, data["metadata"]


def find_route(
    G: nx.Graph,
    from_room_id: str,
    to_room_id: str,
) -> dict | None:
    """
    Поиск кратчайшего пути A* между двумя комнатами.

    Returns dict с полями path_nodes, path_coords_2d, total_distance_px
    или None если путь не найден.
    """
    t0 = time.perf_counter()

    from_node = from_room_id if from_room_id.startswith("room_") else f"room_{from_room_id}"
    to_node = to_room_id if to_room_id.startswith("room_") else f"room_{to_room_id}"

    if from_node not in G.nodes():
        logger.warning("find_route: source node %s not in graph", from_node)
        return None
    if to_node not in G.nodes():
        logger.warning("find_route: target node %s not in graph", to_node)
        return None

    if not nx.has_path(G, from_node, to_node):
        logger.warning("find_route: no path from %s to %s", from_node, to_node)
        return None

    def heuristic(u, v):
        u_pos = G.nodes[u].get('pos', (0, 0))
        v_pos = G.nodes[v].get('pos', (0, 0))
        return math.hypot(u_pos[0] - v_pos[0], u_pos[1] - v_pos[1])

    try:
        path_nodes = nx.astar_path(G, from_node, to_node, heuristic=heuristic, weight='weight')
    except nx.NetworkXNoPath:
        return None

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
                    first_pt = pts[0]
                    last_pt = pts[-1]
                    dist_to_first = math.hypot(node_pos[0] - first_pt[0], node_pos[1] - first_pt[1])
                    dist_to_last = math.hypot(node_pos[0] - last_pt[0], node_pos[1] - last_pt[1])

                    if dist_to_first <= dist_to_last:
                        path_coords_2d.extend(pts)
                    else:
                        path_coords_2d.extend(reversed(pts))
                else:
                    path_coords_2d.append(node_pos)
            else:
                path_coords_2d.append(node_pos)
        else:
            path_coords_2d.append(node_pos)

    deduped = [path_coords_2d[0]] if path_coords_2d else []
    for pt in path_coords_2d[1:]:
        if pt != deduped[-1]:
            deduped.append(pt)

    simplified = simplify_path(
        deduped, dp_epsilon=3.0, angle_threshold_deg=5.0, min_point_distance=5.0,
    )

    logger.info(
        "find_route: %s → %s, %d nodes, %d coords, %.0fpx, %.1fms",
        from_node, to_node, len(path_nodes), len(simplified),
        total_distance, (time.perf_counter() - t0) * 1000,
    )

    return {
        "path_nodes": path_nodes,
        "path_coords_2d": simplified,
        "total_distance_px": total_distance,
    }


def los_prune(coords_2d: list, wall_mask: np.ndarray) -> list:
    """
    Удаляет промежуточные точки, если между start и end
    можно провести прямую без пересечения стен.
    """
    if len(coords_2d) < 3:
        return coords_2d

    result = [coords_2d[0]]
    i = 0

    while i < len(coords_2d) - 1:
        best_j = i + 1
        for j in range(len(coords_2d) - 1, i + 1, -1):
            if _line_of_sight(coords_2d[i], coords_2d[j], wall_mask):
                best_j = j
                break
        result.append(coords_2d[best_j])
        i = best_j

    return result


def _line_of_sight(p1: tuple, p2: tuple, wall_mask: np.ndarray) -> bool:
    """Проверяет, что прямая p1→p2 не пересекает стены (белые пиксели)."""
    x1, y1 = int(p1[0]), int(p1[1])
    x2, y2 = int(p2[0]), int(p2[1])

    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx - dy

    h, w = wall_mask.shape[:2]
    while True:
        if 0 <= y1 < h and 0 <= x1 < w:
            if wall_mask[y1, x1] > 127:  # белый = стена
                return False
        if x1 == x2 and y1 == y2:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x1 += sx
        if e2 < dx:
            err += dx
            y1 += sy

    return True


def simplify_path(
    coords_2d: list[tuple[float, float]],
    dp_epsilon: float = 3.0,
    angle_threshold_deg: float = 5.0,
    min_point_distance: float = 5.0,
) -> list[tuple[float, float]]:
    """
    Упрощает маршрут из пиксельного зигзага в гладкую ломаную.

    Три этапа:
    1. Douglas-Peucker (cv2.approxPolyDP) — основное упрощение
    2. Коллинеарная фильтрация — выпрямление длинных участков
    3. Минимальная дистанция — удаление слишком близких точек
    """
    t0 = time.perf_counter()
    original_count = len(coords_2d)

    if len(coords_2d) < 3:
        return coords_2d

    # Этап 1: Douglas-Peucker
    points_array = np.array(coords_2d, dtype=np.float32).reshape(-1, 1, 2)
    simplified = cv2.approxPolyDP(points_array, epsilon=dp_epsilon, closed=False)
    coords: list[tuple[float, float]] = [(float(pt[0][0]), float(pt[0][1])) for pt in simplified]

    # Этап 2: Коллинеарная фильтрация
    coords = _filter_collinear(coords, angle_threshold_deg)

    # Этап 3: Минимальная дистанция
    coords = _filter_min_distance(coords, min_point_distance)

    logger.info(
        "simplify_path: %d → %d points (%.0f%% reduction), %.1fms",
        original_count, len(coords),
        (1 - len(coords) / max(1, original_count)) * 100,
        (time.perf_counter() - t0) * 1000,
    )

    return coords


def _filter_collinear(
    coords: list[tuple[float, float]],
    angle_threshold_deg: float = 5.0,
) -> list[tuple[float, float]]:
    """Убирает точки, которые почти на одной прямой с соседями."""
    if len(coords) < 3:
        return coords

    threshold_rad = math.radians(angle_threshold_deg)
    result = [coords[0]]

    for i in range(1, len(coords) - 1):
        prev = result[-1]
        curr = coords[i]
        next_pt = coords[i + 1]

        v1 = (curr[0] - prev[0], curr[1] - prev[1])
        v2 = (next_pt[0] - curr[0], next_pt[1] - curr[1])

        len1 = math.hypot(v1[0], v1[1])
        len2 = math.hypot(v2[0], v2[1])

        if len1 < 1e-6 or len2 < 1e-6:
            continue

        cos_angle = (v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2)
        cos_angle = max(-1.0, min(1.0, cos_angle))
        angle = math.acos(cos_angle)

        if angle > threshold_rad:
            result.append(curr)

    result.append(coords[-1])
    return result


def _filter_min_distance(
    coords: list[tuple[float, float]],
    min_dist: float = 5.0,
) -> list[tuple[float, float]]:
    """Убирает точки ближе min_dist пикселей к предыдущей."""
    if len(coords) < 2:
        return coords

    result = [coords[0]]
    for pt in coords[1:-1]:
        prev = result[-1]
        if math.hypot(pt[0] - prev[0], pt[1] - prev[1]) >= min_dist:
            result.append(pt)
    result.append(coords[-1])
    return result


def transform_2d_to_3d(
    coords_2d: list[tuple[float, float]],
    mask_width: int,
    mask_height: int,
    scale_factor: float,
    y_offset: float = 0.1,
) -> list[list[float]]:
    """
    Преобразует 2D пиксельные координаты в 3D мировые координаты (Three.js).

    mesh_builder.py строит меш без центрирования, затем применяет поворот
    -90° вокруг X (Z-up → Y-up). После поворота координаты вершины пикселя
    (x_pix, y_pix) оказываются в:
        x_3d = x_pix * S
        z_3d = (y_pix - H) * S   (Y-flip из contours_to_polygons + поворот)

    MeshViewer не центрирует модель — CameraSetup только наводит камеру на
    центр bounding box, сама модель остаётся на своих координатах.
    """
    coords_3d = []
    for (x_pix, y_pix) in coords_2d:
        x_3d = x_pix * scale_factor
        y_3d = y_offset
        z_3d = (y_pix - mask_height) * scale_factor
        coords_3d.append([round(x_3d, 4), round(y_3d, 4), round(z_3d, 4)])
    return coords_3d
