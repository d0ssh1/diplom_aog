import json
import logging
import math
import time

import cv2
import networkx as nx
import numpy as np
from networkx.readwrite import json_graph
from shapely.geometry import LineString, Point
from skimage.morphology import binary_closing, skeletonize, square

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
    """
    t0 = time.perf_counter()

    free_space = cv2.bitwise_not(wall_mask)

    room_types_to_subtract = {'room', 'staircase', 'elevator'}
    subtracted = 0

    for room in rooms:
        if room.get('room_type', 'room') in room_types_to_subtract:
            x = int(room['x'] * mask_width)
            y = int(room['y'] * mask_height)
            w = int(room['width'] * mask_width)
            h = int(room['height'] * mask_height)
            cv2.rectangle(free_space, (x, y), (x + w, y + h), 0, -1)
            subtracted += 1

    logger.info(
        "extract_corridor_mask: %dx%d, %d rooms subtracted, %.1fms",
        mask_width, mask_height, subtracted,
        (time.perf_counter() - t0) * 1000,
    )
    return free_space


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

    logger.info(
        "find_route: %s → %s, %d nodes, %d coords, %.0fpx, %.1fms",
        from_node, to_node, len(path_nodes), len(deduped),
        total_distance, (time.perf_counter() - t0) * 1000,
    )

    return {
        "path_nodes": path_nodes,
        "path_coords_2d": deduped,
        "total_distance_px": total_distance,
    }


def transform_2d_to_3d(
    coords_2d: list[tuple[float, float]],
    mask_width: int,
    mask_height: int,
    scale_factor: float,
    y_offset: float = 0.1,
) -> list[list[float]]:
    """
    Преобразует 2D пиксельные координаты в 3D мировые координаты (Three.js).

    Формула совпадает с mesh_generator.py (contours_to_polygons + rotation -pi/2 X):
        x_3d = x_pix * S
        y_3d = y_offset
        z_3d = (y_pix - H) * S   (Y-flip без центрирования)
    """
    coords_3d = []
    for (x_pix, y_pix) in coords_2d:
        x_3d = x_pix * scale_factor
        y_3d = y_offset
        z_3d = (y_pix - mask_height) * scale_factor
        coords_3d.append([round(x_3d, 4), round(y_3d, 4), round(z_3d, 4)])
    return coords_3d
