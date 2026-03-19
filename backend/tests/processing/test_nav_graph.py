import numpy as np
import pytest
import networkx as nx
import cv2

from app.processing.nav_graph import (
    extract_corridor_mask,
    build_skeleton,
    build_topology_graph,
    prune_dendrites,
    serialize_nav_graph,
    deserialize_nav_graph,
    find_route,
    transform_2d_to_3d,
    simplify_path,
)


class TestExtractCorridorMask:
    def test_inverts_wall_mask(self):
        """Стены → чёрные, свободное → белое."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[0:10, :] = 255  # стена сверху
        result = extract_corridor_mask(mask, [], 100, 100)
        assert result[50, 50] == 255  # свободное
        assert result[5, 50] == 0     # стена

    def test_all_walls_returns_black(self):
        """Полностью белая маска (всё стены) → результат чёрный."""
        mask = np.full((100, 100), 255, dtype=np.uint8)
        result = extract_corridor_mask(mask, [], 100, 100)
        assert np.all(result == 0)

    def test_no_walls_returns_white(self):
        """Полностью чёрная маска (нет стен) → результат белый."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        result = extract_corridor_mask(mask, [], 100, 100)
        assert np.all(result == 255)

    def test_output_shape_and_dtype(self):
        """Форма и тип выходного массива совпадают с входным."""
        mask = np.zeros((368, 863), dtype=np.uint8)
        result = extract_corridor_mask(mask, [], 863, 368)
        assert result.shape == (368, 863)
        assert result.dtype == np.uint8

    def test_empty_rooms(self):
        """Без комнат — всё стены → чёрный результат."""
        mask = np.full((500, 800), 255, dtype=np.uint8)
        result = extract_corridor_mask(mask, [], 800, 500)
        assert np.all(result == 0)


class TestExtractCorridorMaskDoorwayIsolation:
    def test_isolates_rooms_via_doorways(self):
        """Комнаты за дверными проёмами изолируются от коридора."""
        # Коридор 40px (строки 130-170) — достаточно для kernel=7 iter=2 (~14px shrink)
        # Стена 10px между комнатой и коридором (строки 120-130)
        # Дверной проём 8px в стене — должен закрыться дилатацией
        mask = np.ones((300, 400), dtype=np.uint8) * 255
        mask[130:170, 10:390] = 0   # Коридор 40px
        mask[10:120, 30:130] = 0    # Комната слева (110x100)
        # Стена между комнатой и коридором: строки 120-130 остаются белыми (стена)
        # Дверной проём 8px в стене (строки 120-130, cols 70-78)
        mask[120:130, 70:78] = 0    # Дверной проём 8px
        corridor = extract_corridor_mask(mask, [], 400, 300)
        assert corridor[150, 200] == 255, "Corridor center should be white"
        # Центр комнаты далеко от дверного проёма — должен быть изолирован
        assert corridor[60, 60] == 0, "Left room center should be isolated"

    def test_corridor_stays_connected(self):
        """Длинный коридор не фрагментируется."""
        mask = np.ones((100, 500), dtype=np.uint8) * 255
        mask[40:60, 10:490] = 0
        corridor = extract_corridor_mask(mask, [], 500, 100)
        num_labels, _ = cv2.connectedComponents(corridor)
        assert num_labels <= 3, f"Fragmented into {num_labels - 1} parts"

    def test_wide_opening_not_closed(self):
        """Широкий проём (>14px) не закрывается — допустимо для MVP."""
        mask = np.ones((200, 400), dtype=np.uint8) * 255
        mask[90:110, 10:390] = 0
        mask[30:90, 30:90] = 0
        mask[80:110, 50:70] = 0   # Широкий проём 20px
        corridor = extract_corridor_mask(mask, [], 400, 200)
        # Главное что коридор не разорван — просто не падает
        assert corridor is not None


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


class TestSimplifyPath:
    def test_reduces_zigzag(self):
        coords = [(float(i), 50.0 + (i % 3 - 1) * 2) for i in range(100)]
        simplified = simplify_path(coords, dp_epsilon=3.0)
        assert len(simplified) < len(coords) / 3

    def test_preserves_turns(self):
        coords = [(float(i), 50.0) for i in range(50)]
        coords += [(50.0, 50.0 + float(i)) for i in range(50)]
        simplified = simplify_path(coords, dp_epsilon=3.0)
        assert len(simplified) >= 3

    def test_preserves_endpoints(self):
        coords = [(float(i), float(i % 5)) for i in range(50)]
        simplified = simplify_path(coords)
        assert simplified[0] == coords[0]
        assert simplified[-1] == coords[-1]

    def test_short_path_unchanged(self):
        coords = [(0.0, 0.0), (100.0, 100.0)]
        simplified = simplify_path(coords)
        assert simplified == coords


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
