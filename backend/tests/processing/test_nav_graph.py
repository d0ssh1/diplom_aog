import numpy as np
import pytest
import networkx as nx

from app.processing.nav_graph import (
    extract_corridor_mask,
    build_skeleton,
    build_topology_graph,
    prune_dendrites,
    serialize_nav_graph,
    deserialize_nav_graph,
    find_route,
    transform_2d_to_3d,
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

    def test_staircase_subtracted(self):
        """Тип 'staircase' вычитается."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        rooms = [{"room_type": "staircase", "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}]
        result = extract_corridor_mask(mask, rooms, 100, 100)
        assert result[15, 15] == 0

    def test_empty_rooms(self):
        """Без комнат — просто инверсия."""
        mask = np.full((50, 50), 255, dtype=np.uint8)
        result = extract_corridor_mask(mask, [], 50, 50)
        assert np.all(result == 0)


class TestBuildSkeleton:
    def test_produces_thin_skeleton(self):
        """Скелет должен быть значительно тоньше оригинала."""
        corridor = np.zeros((100, 200), dtype=np.uint8)
        corridor[40:60, 10:190] = 255  # горизонтальный коридор 20px
        skeleton = build_skeleton(corridor)
        assert np.any(skeleton > 0)
        assert np.sum(skeleton > 0) < np.sum(corridor > 0) / 5

    def test_empty_mask_returns_empty(self):
        """Пустая маска → пустой скелет."""
        mask = np.zeros((50, 50), dtype=np.uint8)
        skeleton = build_skeleton(mask)
        assert np.all(skeleton == 0)


class TestBuildTopologyGraph:
    def test_creates_graph_from_skeleton(self):
        """Из скелета создаётся граф с узлами и рёбрами."""
        corridor = np.zeros((100, 200), dtype=np.uint8)
        corridor[45:55, 10:190] = 255
        skeleton = build_skeleton(corridor)
        G = build_topology_graph(skeleton)
        assert G.number_of_nodes() > 0
        assert G.number_of_edges() > 0

    def test_node_has_pos_attribute(self):
        """Узлы имеют атрибут pos."""
        corridor = np.zeros((100, 200), dtype=np.uint8)
        corridor[45:55, 10:190] = 255
        skeleton = build_skeleton(corridor)
        G = build_topology_graph(skeleton)
        for _, data in G.nodes(data=True):
            assert 'pos' in data
            assert len(data['pos']) == 2


class TestPruneDendrites:
    def test_removes_short_branches(self):
        """Короткие тупики удаляются."""
        G = nx.Graph()
        G.add_node(0, type='corridor_node', pos=(0, 0))
        G.add_node(1, type='corridor_node', pos=(100, 0))
        G.add_node(2, type='corridor_node', pos=(50, 0))
        G.add_node(3, type='corridor_node', pos=(50, 10))  # короткий тупик
        G.add_edge(0, 2, weight=50, type='corridor_edge')
        G.add_edge(2, 1, weight=50, type='corridor_edge')
        G.add_edge(2, 3, weight=10, type='corridor_edge')  # < 20 → удалить
        G = prune_dendrites(G, min_branch_length=20.0)
        assert 3 not in G.nodes()

    def test_keeps_long_branches(self):
        """Длинные ветви сохраняются."""
        G = nx.Graph()
        G.add_node(0, type='corridor_node', pos=(0, 0))
        G.add_node(1, type='corridor_node', pos=(100, 0))
        G.add_node(2, type='corridor_node', pos=(50, 0))
        G.add_node(3, type='corridor_node', pos=(50, 50))  # длинный тупик
        G.add_edge(0, 2, weight=50, type='corridor_edge')
        G.add_edge(2, 1, weight=50, type='corridor_edge')
        G.add_edge(2, 3, weight=50, type='corridor_edge')  # >= 20 → оставить
        G = prune_dendrites(G, min_branch_length=20.0)
        assert 3 in G.nodes()

    def test_empty_graph(self):
        """Пустой граф не вызывает ошибок."""
        G = nx.Graph()
        result = prune_dendrites(G)
        assert result.number_of_nodes() == 0


class TestSerializeDeserialize:
    def test_roundtrip(self):
        """Сериализация и десериализация сохраняют граф."""
        G = nx.Graph()
        G.add_node("room_1", type='room', pos=(10.0, 20.0))
        G.add_node(0, type='corridor_node', pos=(50.0, 50.0))
        G.add_edge("room_1", 0, weight=30.0, type='room_to_door')

        data = serialize_nav_graph(G, 100, 100, 0.05)
        assert data["version"] == 1
        assert data["metadata"]["nodes_count"] == 2
        assert data["metadata"]["mask_width"] == 100

        G2, meta = deserialize_nav_graph(data)
        assert G2.number_of_nodes() == 2
        assert meta["scale_factor"] == 0.05


class TestFindRoute:
    def _make_simple_graph(self):
        G = nx.Graph()
        G.add_node(0, type='corridor_node', pos=(50, 100))
        G.add_node(1, type='corridor_node', pos=(200, 100))
        G.add_edge(0, 1, weight=150, type='corridor_edge',
                   pts=[(50, 100), (100, 100), (150, 100), (200, 100)])
        G.add_node("room_a", type='room', pos=(30, 50), room_name='1103')
        G.add_node("door_a", type='door', pos=(50, 80))
        G.add_node("entry_a", type='corridor_entry', pos=(50, 100))
        G.add_edge("room_a", "door_a", weight=36, type='room_to_door')
        G.add_edge("door_a", "entry_a", weight=20, type='door_to_corridor')
        G.add_edge("entry_a", 0, weight=0.1, type='corridor_edge', pts=[(50, 100)])
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
    def test_center_pixel_maps_to_zero_x(self):
        # x_3d = x_pix * scale = 0 * 0.05 = 0
        coords = transform_2d_to_3d([(0, 500)], 1000, 500, 0.05)
        assert coords[0][0] == 0.0

    def test_y_offset_applied(self):
        coords = transform_2d_to_3d([(0, 0)], 100, 100, 0.05, y_offset=0.1)
        assert coords[0][1] == 0.1

    def test_scale_factor_applied(self):
        # x_3d = 100 * 0.1 = 10.0
        coords = transform_2d_to_3d([(100, 0)], 100, 100, 0.1)
        assert coords[0][0] == 10.0

    def test_z_y_flip(self):
        # z_3d = (y_pix - H) * S = (0 - 100) * 0.1 = -10.0
        coords = transform_2d_to_3d([(0, 0)], 100, 100, 0.1)
        assert coords[0][2] == -10.0
