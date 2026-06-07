import numpy as np
import pytest
import networkx as nx

from app.core.exceptions import ImageProcessingError
from app.processing.nav_graph import (
    extract_corridor_mask,
    build_skeleton,
    build_topology_graph,
    prune_dendrites,
    integrate_semantics,
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
        result = extract_corridor_mask(
            mask, [], 200, 100, wall_thickness_px=5.0, corridor_ratio=1.5
        )
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


class TestExtractCorridorMaskMultiComponent:
    """R1 — extract_corridor_mask keeps EVERY interior section, not just one."""

    @staticmethod
    def _bordered(h: int, w: int) -> np.ndarray:
        mask = np.zeros((h, w), dtype=np.uint8)
        mask[:5, :] = 255
        mask[-5:, :] = 255
        mask[:, :5] = 255
        mask[:, -5:] = 255
        return mask

    def test_extract_corridor_two_regions_keeps_both(self):
        """Two enclosed sections → BOTH get corridor pixels (was: only biggest)."""
        mask = self._bordered(200, 400)
        mask[:, 195:205] = 255  # vertical divider → left + right sections
        result = extract_corridor_mask(mask, [], 400, 200, wall_thickness_px=5.0)
        assert np.sum(result[:, 5:195] > 0) > 0, "left section must have corridor"
        assert np.sum(result[:, 205:395] > 0) > 0, "right section must have corridor"

    def test_extract_corridor_single_region_returns_corridor(self):
        """A single enclosed section still yields a corridor."""
        mask = self._bordered(200, 400)
        result = extract_corridor_mask(mask, [], 400, 200, wall_thickness_px=5.0)
        assert np.sum(result > 0) > 0

    def test_extract_corridor_drops_exterior_blob(self):
        """The exterior free blob (touches the image border) is discarded."""
        mask = np.zeros((200, 200), dtype=np.uint8)
        # an enclosed box in the middle, exterior free space all around it
        mask[60:62, 60:140] = 255
        mask[138:140, 60:140] = 255
        mask[60:140, 60:62] = 255
        mask[60:140, 138:140] = 255
        result = extract_corridor_mask(mask, [], 200, 200, wall_thickness_px=2.0)
        assert np.sum(result[:30, :30] > 0) == 0, "exterior corner must be dropped"
        assert np.sum(result[70:130, 70:130] > 0) > 0, "interior box kept"

    def test_extract_corridor_drops_tiny_noise(self):
        """A tiny walled-off pocket below the noise floor is dropped."""
        mask = self._bordered(200, 200)
        mask[98:108, 98:108] = 255   # 10x10 solid wall block
        mask[100:106, 100:106] = 0   # carve a 6x6 free pocket inside it
        result = extract_corridor_mask(mask, [], 200, 200, wall_thickness_px=2.0)
        # min_corridor_area_px = max(1, 3**2) = 9; pocket wide area ~4 < 9 → dropped
        assert np.sum(result[100:106, 100:106] > 0) == 0, "tiny pocket dropped"
        assert np.sum(result > 0) > 0, "big interior kept"

    def test_extract_corridor_merged_into_exterior_dropped(self):
        """A section opened to the outside merges with the exterior → dropped."""
        mask = np.zeros((300, 200), dtype=np.uint8)
        # Top box OPEN at the top → merges with exterior (border) → dropped.
        mask[40:120, 60:62] = 255
        mask[40:120, 138:140] = 255
        mask[118:120, 60:140] = 255
        # Bottom box fully enclosed → real interior corridor → kept.
        mask[160:162, 60:140] = 255
        mask[238:240, 60:140] = 255
        mask[160:240, 60:62] = 255
        mask[160:240, 138:140] = 255
        result = extract_corridor_mask(mask, [], 200, 300, wall_thickness_px=2.0)
        assert np.sum(result[42:118, 64:138] > 0) == 0, "open box merged w/ exterior"
        assert np.sum(result[164:238, 64:138] > 0) > 0, "enclosed box kept"

    def test_extract_corridor_empty_mask_raises(self):
        """A zero-size mask raises ImageProcessingError."""
        with pytest.raises(ImageProcessingError):
            extract_corridor_mask(
                np.zeros((0, 0), dtype=np.uint8), [], 0, 0, wall_thickness_px=5.0
            )


class TestIntegrateSemanticsBoundedSnap:
    """R5 — door→corridor snap is gated by max distance + seeded line-of-sight."""

    @staticmethod
    def _corridor_graph() -> nx.Graph:
        """One horizontal corridor edge at y=100 px, x in [20, 180]."""
        G = nx.Graph()
        G.add_node(0, type='corridor_node', pos=(20.0, 100.0))
        G.add_node(1, type='corridor_node', pos=(180.0, 100.0))
        G.add_edge(
            0, 1, weight=160.0, type='corridor_edge',
            pts=[(20.0, 100.0), (100.0, 100.0), (180.0, 100.0)],
        )
        return G

    @staticmethod
    def _rooms() -> list[dict]:
        return [{'id': 'r1', 'x': 0.4, 'y': 0.3, 'width': 0.05,
                 'height': 0.05, 'room_type': 'room'}]

    @staticmethod
    def _door(y_norm: float = 0.4) -> list[dict]:
        return [{'id': 'd1', 'x1': 0.5, 'y1': y_norm, 'x2': 0.5,
                 'y2': y_norm, 'room_id': 'r1'}]

    @staticmethod
    def _has_corridor_edge(G: nx.Graph) -> bool:
        return any(d.get('type') == 'door_to_corridor' for _, _, d in G.edges(data=True))

    def test_door_within_reach_snaps_to_corridor(self):
        """Free LOS + within max distance → a door_to_corridor edge is added."""
        wall = np.zeros((200, 200), dtype=np.uint8)
        G = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=3.0,
        )
        assert self._has_corridor_edge(G)

    def test_door_behind_wall_not_snapped(self):
        """A solid wall between door and corridor blocks the snap."""
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[88:92, :] = 255  # wall between door (y=80) and corridor (y=100)
        G = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=3.0,
        )
        assert not self._has_corridor_edge(G)

    def test_door_beyond_max_dist_not_snapped(self):
        """A door farther than max_snap_dist_px does not snap."""
        wall = np.zeros((200, 200), dtype=np.uint8)
        # door midpoint y=0.1*200=20 px; corridor y=100 → dist 80 > 50
        G = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(y_norm=0.1), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=3.0,
        )
        assert not self._has_corridor_edge(G)

    def test_door_through_cutout_opening_snaps(self):
        """A wall with a cutout opening aligned to the door lets the snap pass."""
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[88:92, :] = 255
        wall[88:92, 95:105] = 0  # opening aligned with the door column (x=100)
        G = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=3.0,
        )
        assert self._has_corridor_edge(G)

    def test_door_on_sealed_doorway_seeded_los_snaps(self):
        """🔴-1 guard: door midpoint ON a wall snaps WITH seeding, not without."""
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[78:83, 95:105] = 255  # sealed doorway band exactly on the door (y=80)
        seeded = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=6.0,
        )
        assert self._has_corridor_edge(seeded), "seeded LOS must reach the corridor"
        raw = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=0.0,
        )
        assert not self._has_corridor_edge(raw), "raw LOS starts on the wall → fails"

    def test_door_no_corridor_edges_only_node(self):
        """No corridor edges → the door is a bare node, no snap, no crash."""
        wall = np.zeros((200, 200), dtype=np.uint8)
        G = integrate_semantics(
            nx.Graph(), self._rooms(), self._door(), 200, 200,
            wall, max_snap_dist_px=50.0, skip_px=3.0,
        )
        assert 'door_d1' in G.nodes()
        assert not self._has_corridor_edge(G)

    def test_default_params_preserve_legacy_unbounded_snap(self):
        """Without wall_mask/bounds (single-recon caller) the snap is unbounded."""
        # door far away + no LOS gate → still snaps (legacy behavior preserved).
        G = integrate_semantics(
            self._corridor_graph(), self._rooms(), self._door(y_norm=0.05), 200, 200,
        )
        assert self._has_corridor_edge(G)
