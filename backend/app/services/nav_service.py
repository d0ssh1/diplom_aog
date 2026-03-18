import glob
import json
import logging
import os

import cv2

from app.processing.nav_graph import (
    build_skeleton,
    build_topology_graph,
    deserialize_nav_graph,
    extract_corridor_mask,
    find_route,
    integrate_semantics,
    prune_dendrites,
    serialize_nav_graph,
    transform_2d_to_3d,
)

logger = logging.getLogger(__name__)


class NavService:
    def __init__(self, upload_dir: str) -> None:
        self._upload_dir = upload_dir
        self._masks_dir = os.path.join(upload_dir, "masks")

    def _find_mask_file(self, mask_file_id: str) -> str:
        pattern = os.path.join(self._masks_dir, f"{mask_file_id}.*")
        files = [f for f in glob.glob(pattern) if not f.endswith('_nav.json') and not f.endswith('_skeleton.png')]
        if not files:
            raise FileNotFoundError(f"Mask file not found: {mask_file_id}")
        return files[0]

    async def build_graph(
        self,
        mask_file_id: str,
        rooms: list[dict],
        doors: list[dict],
        scale_factor: float = 0.05,
    ) -> dict:
        """Полный пайплайн генерации навигационного графа."""
        mask_path = self._find_mask_file(mask_file_id)
        wall_mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if wall_mask is None:
            raise ValueError(f"Cannot read mask: {mask_path}")
        h, w = wall_mask.shape[:2]

        corridor_mask = extract_corridor_mask(wall_mask, rooms, w, h)
        skeleton = build_skeleton(corridor_mask)
        G = build_topology_graph(skeleton)
        G = prune_dendrites(G, min_branch_length=20.0)
        G = integrate_semantics(G, rooms, doors, w, h)

        nav_data = serialize_nav_graph(G, w, h, scale_factor)

        nav_path = os.path.splitext(mask_path)[0] + '_nav.json'
        with open(nav_path, 'w') as f:
            json.dump(nav_data, f)

        skeleton_path = os.path.splitext(mask_path)[0] + '_skeleton.png'
        cv2.imwrite(skeleton_path, skeleton)

        logger.info("NavService.build_graph: saved %s", nav_path)
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

        scale_factor = metadata.get('scale_factor', 0.05)
        mask_width = metadata.get('mask_width', 1000)
        mask_height = metadata.get('mask_height', 500)

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

        return {
            "status": "success",
            "from_room": from_name or from_room_id,
            "to_room": to_name or to_room_id,
            "total_distance_px": round(route['total_distance_px'], 1),
            "total_distance_meters": round(distance_meters, 1),
            "estimated_time_seconds": round(estimated_time),
            "coordinates": coords_3d,
            "path_nodes_count": len(route['path_nodes']),
        }
