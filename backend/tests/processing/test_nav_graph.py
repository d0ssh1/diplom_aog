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
    def _make_corridor_mask(self, wall_px: int = 5) -> np.ndarray:
        """100x200 маска: стены сверху и снизу wall_px пикселей."""
        mask = np.zeros((100, 200), dtype=np.uint8)
        mask[:wall_px, :] = 255
        mask[-wall_px:, :] = 255
        return mask

    def test_extract_corridor_mask_wide_corridor_included(self):
        """Широкий коридор (100x200, стены 5px) → коридорные пиксели присутствуют."""
        mask = self._make_corridor_mask(wall_px=5)
        result = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=5.0)
        assert result.shape == (100, 200)
        assert result.dtype == np.uint8
        assert np.sum(result > 0) > 0

    def test_extract_corridor_mask_narrow_passage_excluded(self):
        """3px зазор в вертикальной стене не проходит порог threshold=7.5px."""
        mask = np.zeros((100, 200), dtype=np.uint8)
        mask[:5, :] = 255   # стена сверху
        mask[-5:, :] = 255  # стена снизу
        # Вертикальная стена-разделитель в середине (cols 100-105)
        mask[:, 100:105] = 255
        # 3px зазор в разделителе (rows 48-51)
        mask[48:51, 100:105] = 0
        result = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=5.0, corridor_ratio=1.5)
        # threshold = max(3.0, 1.5 * 5.0) = 7.5px — зазор 3px не пройдёт
        gap_area = result[48:51, 100:105]
        assert np.all(gap_area == 0), "3px gap should not appear as corridor"

    def test_extract_corridor_mask_threshold_scales_with_wall_thickness(self):
        """Больший wall_thickness_px → меньше или равно коридорных пикселей."""
        mask = self._make_corridor_mask(wall_px=5)
        result_thin = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=5.0)
        result_thick = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=20.0)
        assert np.sum(result_thick > 0) <= np.sum(result_thin > 0)

    def test_extract_corridor_mask_zero_wall_thickness_uses_fallback(self):
        """wall_thickness_px=0.0 не вызывает исключение, возвращает ndarray той же формы."""
        mask = self._make_corridor_mask(wall_px=5)
        result = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=0.0)
        assert isinstance(result, np.ndarray)
        assert result.shape == (100, 200)

    def test_extract_corridor_mask_empty_mask_returns_zeros(self):
        """Полностью белая маска (всё стены) → результат нулевой."""
        mask = np.full((100, 200), 255, dtype=np.uint8)
        result = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=5.0)
        assert np.all(result == 0)

    def test_extract_corridor_mask_rooms_subtracted(self):
        """Bbox комнаты вычитается из маски коридора."""
        mask = self._make_corridor_mask(wall_px=5)
        rooms = [{'id': 'r1', 'x': 0.3, 'y': 0.1, 'width': 0.2, 'height': 0.7, 'room_type': 'room'}]
        result = extract_corridor_mask(mask, rooms, 200, 100, wall_thickness_px=5.0)
        # Bbox комнаты в пикселях: x=60, y=10, w=40, h=70
        room_area = result[10:80, 60:100]
        assert np.all(room_area == 0), "Room bbox should be zeroed out"

    def test_extract_corridor_mask_output_shape_matches_input(self):
        """Форма результата совпадает с формой входной маски."""
        mask = np.zeros((368, 863), dtype=np.uint8)
        mask[:5, :] = 255
        mask[-5:, :] = 255
        result = extract_corridor_mask(mask, [], 863, 368, wall_thickness_px=5.0)
        assert result.shape == (368, 863)

    def test_extract_corridor_mask_output_is_binary(self):
        """Все значения результата — 0 или 255."""
        mask = self._make_corridor_mask(wall_px=5)
        result = extract_corridor_mask(mask, [], 200, 100, wall_thickness_px=5.0)
        assert np.all((result == 0) | (result == 255))


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
