import glob
import json
import logging
import os

import cv2
import numpy as np

from app.processing.nav_graph import (
    build_skeleton,
    build_topology_graph,
    deserialize_nav_graph,
    extract_corridor_mask,
    find_route,
    integrate_semantics,
    los_prune,
    prune_dendrites,
    serialize_nav_graph,
    transform_2d_to_3d,
)
from app.processing.pipeline import compute_scale_factor, compute_wall_thickness

logger = logging.getLogger(__name__)


class NavService:
    def __init__(self, upload_dir: str) -> None:
        self._upload_dir = upload_dir
        self._masks_dir = os.path.join(upload_dir, "masks")

    def _find_mask_file(self, mask_file_id: str) -> str:
        pattern = os.path.join(self._masks_dir, f"{mask_file_id}.*")
        files = [
            f for f in glob.glob(pattern)
            if os.path.basename(f).startswith(mask_file_id + '.')
        ]
        if not files:
            raise FileNotFoundError(f"Mask file not found: {mask_file_id}")
        return files[0]

    async def build_graph(
        self,
        mask_file_id: str,
        rooms: list[dict],
        doors: list[dict],
        scale_factor: float = 0.02,
    ) -> dict:
        """Полный пайплайн генерации навигационного графа."""
        mask_path = self._find_mask_file(mask_file_id)
        wall_mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if wall_mask is None:
            raise ValueError(f"Cannot read mask: {mask_path}")
        h, w = wall_mask.shape[:2]

        # Compute scale_factor from the mask itself so it matches mesh_builder.py
        wall_thickness_px = compute_wall_thickness(wall_mask)
        scale_factor = 1.0 / compute_scale_factor(wall_thickness_px)

        corridor_mask = extract_corridor_mask(wall_mask, rooms, w, h, wall_thickness_px)
        skeleton = build_skeleton(corridor_mask)
        G = build_topology_graph(skeleton)
        G = prune_dendrites(G, min_branch_length=20.0)
        G = integrate_semantics(G, rooms, doors, w, h)

        nav_data = serialize_nav_graph(G, w, h, scale_factor)

        nav_path = os.path.splitext(mask_path)[0] + '_nav.json'
        with open(nav_path, 'w') as f:
            json.dump(nav_data, f)

        # Debug images (6 шт) — для визуальной проверки
        debug_dir = os.path.dirname(mask_path)
        prefix = mask_file_id

        cv2.imwrite(f'{debug_dir}/{prefix}_1_free.png', cv2.bitwise_not(wall_mask))

        dilate_px = max(1, min(int(wall_thickness_px), 30))
        dilate_kernel = np.ones((dilate_px, dilate_px), np.uint8)
        dilated = cv2.dilate(wall_mask, dilate_kernel, iterations=1)
        cv2.imwrite(f'{debug_dir}/{prefix}_2_dilated_walls.png', dilated)
        cv2.imwrite(f'{debug_dir}/{prefix}_3_closed_free.png', cv2.bitwise_not(dilated))
        cv2.imwrite(f'{debug_dir}/{prefix}_4_corridor.png', corridor_mask)
        cv2.imwrite(f'{debug_dir}/{prefix}_5_skeleton.png', skeleton)

        overlay = cv2.cvtColor(wall_mask, cv2.COLOR_GRAY2BGR)
        overlay[corridor_mask > 0] = [180, 80, 0]
        overlay[skeleton > 0] = [0, 255, 255]
        for node_id, data in G.nodes(data=True):
            pos = data.get('pos', (0, 0))
            x, y = int(pos[0]), int(pos[1])
            if 0 <= x < w and 0 <= y < h:
                color = {
                    'room': (0, 0, 255),
                    'door': (0, 255, 0),
                    'corridor_entry': (255, 128, 0),
                    'corridor_node': (128, 128, 128),
                }.get(data.get('type', ''), (200, 200, 200))
                radius = 6 if data.get('type') in ('room', 'door') else 3
                cv2.circle(overlay, (x, y), radius, color, -1)
        cv2.imwrite(f'{debug_dir}/{prefix}_6_overlay.png', overlay)

        logger.info("NavService.build_graph: saved %s, debug images → %s", nav_path, debug_dir)
        return nav_data["metadata"]

    def load_graph(self, mask_file_id: str) -> dict:
        """Загружает сохранённый граф с диска."""
        nav_path = os.path.join(self._masks_dir, f"{mask_file_id}_nav.json")
        if not os.path.exists(nav_path):
            raise FileNotFoundError(f"Nav graph not found: {nav_path}")
        with open(nav_path, 'r') as f:
            return json.load(f)

    async def find_route(
        self,
        graph_id: str,
        from_room_id: str,
        to_room_id: str,
    ) -> dict:
        """Загружает граф, ищет маршрут A*, трансформирует координаты в 3D."""
        try:
            nav_data = self.load_graph(graph_id)
        except FileNotFoundError:
            return {"status": "error", "message": "Graph not found"}

        G, metadata = deserialize_nav_graph(nav_data)

        route = find_route(G, from_room_id, to_room_id)
        if not route:
            return {
                "status": "no_path",
                "message": f"No path from {from_room_id} to {to_room_id}",
            }

        scale_factor = metadata.get('scale_factor', 0.02)
        mask_width = metadata.get('mask_width', 1000)
        mask_height = metadata.get('mask_height', 500)

        # LOS pruning — remove zigzags where straight line is clear of walls
        try:
            mask_path = self._find_mask_file(graph_id)
            wall_mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            if wall_mask is not None:
                route['path_coords_2d'] = los_prune(route['path_coords_2d'], wall_mask)
        except Exception:
            pass  # LOS is optional — fall back to simplified path

        coords_3d = transform_2d_to_3d(
            route['path_coords_2d'],
            mask_width, mask_height,
            scale_factor,
            y_offset=0.1,
        )

        distance_meters = route['total_distance_px'] * scale_factor
        estimated_time = distance_meters / 1.2

        from_node_key = from_room_id if from_room_id.startswith("room_") else f"room_{from_room_id}"
        to_node_key = to_room_id if to_room_id.startswith("room_") else f"room_{to_room_id}"
        from_name = G.nodes.get(from_node_key, {}).get('room_name', from_room_id)
        to_name = G.nodes.get(to_node_key, {}).get('room_name', to_room_id)

        # Extract room bounding boxes and convert to 3D sizes and positions
        from_room_3d = None
        to_room_3d = None

        def extract_room_3d(node_key):
            node_data = G.nodes.get(node_key, {})
            if 'bbox' in node_data:
                rx, ry, rw, rh = node_data['bbox']
                # 2D to 3D transformation logic (same as transform_2d_to_3d)
                # Box size in 3D: width = rw * scale, depth (z) = rh * scale
                width_3d = rw * scale_factor
                depth_3d = rh * scale_factor
                # Box center in 3D:
                cx = rx + rw / 2.0
                cy = ry + rh / 2.0
                
                # We need to map pixel coordinates exactly as transform_2d_to_3d does.
                center_x_3d = cx * scale_factor
                center_z_3d = (cy - mask_height) * scale_factor
                return {
                    "position": [round(center_x_3d, 4), 1.5, round(center_z_3d, 4)],
                    "size": [round(width_3d, 4), 3.0, round(depth_3d, 4)]
                }
            return None

        from_room_3d = extract_room_3d(from_node_key)
        to_room_3d = extract_room_3d(to_node_key)

        return {
            "status": "success",
            "from_room": from_name or from_room_id,
            "to_room": to_name or to_room_id,
            "total_distance_px": round(route['total_distance_px'], 1),
            "total_distance_meters": round(distance_meters, 1),
            "estimated_time_seconds": round(estimated_time),
            "coordinates": coords_3d,
            "path_nodes_count": len(route['path_nodes']),
            "from_room_3d": from_room_3d,
            "to_room_3d": to_room_3d,
        }
