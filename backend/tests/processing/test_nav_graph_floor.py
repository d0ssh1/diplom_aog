"""Pure unit tests for ``processing.nav_graph_floor`` (Phase 01).

No DB, no storage, no mocks — only numpy + the pure functions under test. Covers
``transform_rooms_to_floor_canvas`` (polygon→bbox + rotation, the "no shifts"
maths), ``transform_doors_to_floor_canvas`` and ``build_floor_graph_from_mask``
(delegation to the nav_graph pipeline).
"""

import numpy as np
import pytest

from app.core.exceptions import ImageProcessingError
from app.processing.nav_graph_floor import (
    SectionDoorInput,
    SectionRoomInput,
    build_floor_graph_from_mask,
    transform_doors_to_floor_canvas,
    transform_rooms_to_floor_canvas,
)


def make_room(
    x: float = 0.1,
    y: float = 0.1,
    w: float = 0.2,
    h: float = 0.2,
    scale_k: float = 1.0,
    tx: float = 0.0,
    ty: float = 0.0,
    mask_w: int = 100,
    mask_h: int = 100,
    rotation_rad: float = 0.0,
    room_id: str = "r1",
) -> SectionRoomInput:
    """Build a SectionRoomInput whose polygon is the rectangle ``(x, y, w, h)``.

    The rectangular polygon makes the no-rotation floor bbox identical to the old
    x/y/width/height inputs, so the scale+shift maths tests stay assertable.
    """
    return SectionRoomInput(
        room_id=room_id,
        name="Test",
        room_type="room",
        polygon=[(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        mask_w=mask_w,
        mask_h=mask_h,
        scale_k=scale_k,
        rotation_rad=rotation_rad,
        tx_k=tx,
        ty_k=ty,
    )


def make_l_mask(w: int = 200, h: int = 200) -> np.ndarray:
    """A bordered canvas with an inner wall stub — guarantees corridor space."""
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[0:5, :] = 255
    mask[-5:, :] = 255
    mask[:, 0:5] = 255
    mask[:, -5:] = 255
    mask[80:85, 50:] = 255
    return mask


# ── transform_rooms_to_floor_canvas (scale + shift, no rotation) ──────────────


def test_transform_rooms_single_room_correct_floor_px():
    """room (0.1,0.1,0.2,0.2), mask 100×100, scale_k=2, tx=10, ty=20, canvas 300.

    floor px x = 0.1*100*2 + 10 = 30 → norm 30/300 = 0.1.
    """
    room = make_room(scale_k=2.0, tx=10.0, ty=20.0, mask_w=100, mask_h=100)
    out = transform_rooms_to_floor_canvas([room], 300, 300)
    assert len(out) == 1
    assert out[0]["x"] == pytest.approx(0.1, abs=1e-9)
    # y px = 0.1*100*2 + 20 = 40 → 40/300
    assert out[0]["y"] == pytest.approx(40.0 / 300.0, abs=1e-9)


def test_transform_rooms_k_one_is_identity_scale():
    """scale_k=1, tx=ty=0, mask==canvas → norm coords preserved."""
    room = make_room(x=0.3, y=0.4, w=0.2, h=0.1, scale_k=1.0, mask_w=200, mask_h=200)
    out = transform_rooms_to_floor_canvas([room], 200, 200)
    assert out[0]["x"] == pytest.approx(0.3, abs=1e-9)
    assert out[0]["y"] == pytest.approx(0.4, abs=1e-9)
    assert out[0]["width"] == pytest.approx(0.2, abs=1e-9)
    assert out[0]["height"] == pytest.approx(0.1, abs=1e-9)


def test_transform_rooms_k_two_doubles_coords():
    """scale_k=2 doubles room px width/height (norm over the same canvas)."""
    room = make_room(x=0.1, y=0.1, w=0.2, h=0.2, scale_k=2.0, mask_w=100, mask_h=100)
    out = transform_rooms_to_floor_canvas([room], 400, 400)
    # px w = 0.2*100*2 = 40 → 40/400 = 0.1 ; vs scale_k=1 would give 0.05
    assert out[0]["width"] == pytest.approx(40.0 / 400.0, abs=1e-9)
    assert out[0]["height"] == pytest.approx(40.0 / 400.0, abs=1e-9)


def test_transform_rooms_clips_to_canvas():
    """A room extending past the canvas is clipped so x + width <= 1.0."""
    room = make_room(x=0.9, y=0.9, w=0.5, h=0.5, scale_k=1.0, mask_w=100, mask_h=100)
    out = transform_rooms_to_floor_canvas([room], 100, 100)
    assert len(out) == 1
    assert out[0]["x"] + out[0]["width"] <= 1.0 + 1e-9
    assert out[0]["y"] + out[0]["height"] <= 1.0 + 1e-9


def test_transform_rooms_empty_input_returns_empty():
    """Empty room list → empty output."""
    assert transform_rooms_to_floor_canvas([], 100, 100) == []


def test_transform_rooms_no_rotation_applied():
    """room at (0,0) maps to (tx_k/W, ty_k/H) exactly — pure scale+shift."""
    room = make_room(x=0.0, y=0.0, w=0.1, h=0.1, scale_k=3.0, tx=15.0, ty=25.0,
                     mask_w=100, mask_h=100)
    out = transform_rooms_to_floor_canvas([room], 200, 200)
    assert out[0]["x"] == pytest.approx(15.0 / 200.0, abs=1e-9)
    assert out[0]["y"] == pytest.approx(25.0 / 200.0, abs=1e-9)


# ── transform_rooms: polygon → bbox + rotation (this feature) ─────────────────


def test_transform_rooms_polygon_to_bbox():
    """An explicit polygon → its floor-canvas AABB (rotation_rad=0)."""
    room = SectionRoomInput(
        room_id="r1", name="Test", room_type="room",
        polygon=[(0.2, 0.2), (0.4, 0.2), (0.4, 0.5), (0.2, 0.5)],
        mask_w=100, mask_h=100,
        scale_k=1.0, rotation_rad=0.0, tx_k=0.0, ty_k=0.0,
    )
    out = transform_rooms_to_floor_canvas([room], 100, 100)
    assert out[0]["x"] == pytest.approx(0.2, abs=1e-9)
    assert out[0]["y"] == pytest.approx(0.2, abs=1e-9)
    assert out[0]["width"] == pytest.approx(0.2, abs=1e-9)   # 0.4 - 0.2
    assert out[0]["height"] == pytest.approx(0.3, abs=1e-9)  # 0.5 - 0.2


def test_transform_rooms_applies_rotation():
    """A 90° rotation swaps a wide room's bbox into a tall one."""
    room = SectionRoomInput(
        room_id="r1", name="Test", room_type="room",
        # wide rectangle: 40px wide × 10px tall in section space.
        polygon=[(0.1, 0.1), (0.5, 0.1), (0.5, 0.2), (0.1, 0.2)],
        mask_w=100, mask_h=100,
        scale_k=1.0, rotation_rad=np.pi / 2, tx_k=30.0, ty_k=10.0,
    )
    out = transform_rooms_to_floor_canvas([room], 200, 200)
    # After R(90°): bbox width 10px, height 40px (wide → tall).
    assert out[0]["width"] == pytest.approx(10.0 / 200.0, abs=1e-9)
    assert out[0]["height"] == pytest.approx(40.0 / 200.0, abs=1e-9)
    assert out[0]["height"] > out[0]["width"], "90° rotation makes the wide room tall"


def test_transform_rooms_drops_zero_area():
    """A degenerate (zero-width) room is dropped, not emitted."""
    room = SectionRoomInput(
        room_id="r1", name="Test", room_type="room",
        polygon=[(0.5, 0.1), (0.5, 0.1), (0.5, 0.5), (0.5, 0.5)],  # zero width
        mask_w=100, mask_h=100,
        scale_k=1.0, rotation_rad=0.0, tx_k=0.0, ty_k=0.0,
    )
    assert transform_rooms_to_floor_canvas([room], 100, 100) == []


def test_transform_rooms_output_shape():
    """Output dict keys are exactly {id,name,room_type,x,y,width,height}."""
    out = transform_rooms_to_floor_canvas([make_room()], 100, 100)
    assert set(out[0].keys()) == {
        "id", "name", "room_type", "x", "y", "width", "height"
    }


# ── transform_doors_to_floor_canvas ──────────────────────────────────────────


def test_transform_doors_to_floor_canvas_point():
    """A door position → a floor-canvas point: x1==x2, y1==y2, room_id echoed."""
    door = SectionDoorInput(
        door_id="d1", position=(0.5, 0.25), room_id="r1",
        mask_w=100, mask_h=100,
        scale_k=2.0, rotation_rad=0.0, tx_k=10.0, ty_k=20.0,
    )
    out = transform_doors_to_floor_canvas([door], 200, 200)
    assert len(out) == 1
    # px = 0.5*100*2 + 10 = 110 → 0.55 ; py = 0.25*100*2 + 20 = 70 → 0.35
    assert out[0]["x1"] == pytest.approx(110.0 / 200.0, abs=1e-9)
    assert out[0]["y1"] == pytest.approx(70.0 / 200.0, abs=1e-9)
    assert out[0]["x1"] == out[0]["x2"]
    assert out[0]["y1"] == out[0]["y2"]
    assert out[0]["room_id"] == "r1"


def test_transform_doors_applies_rotation():
    """A 90° rotation rotates the door point about the section origin."""
    door = SectionDoorInput(
        door_id="d1", position=(0.5, 0.0), room_id=None,
        mask_w=100, mask_h=100,
        scale_k=1.0, rotation_rad=np.pi / 2, tx_k=80.0, ty_k=10.0,
    )
    out = transform_doors_to_floor_canvas([door], 200, 200)
    # sx=50, sy=0 ; cos=0, sin=1 → fx = -0 + 80 = 80 ; fy = 50 + 10 = 60
    assert out[0]["x1"] == pytest.approx(80.0 / 200.0, abs=1e-9)
    assert out[0]["y1"] == pytest.approx(60.0 / 200.0, abs=1e-9)
    assert out[0]["room_id"] is None


# ── build_floor_graph_from_mask ──────────────────────────────────────────────


def test_floor_graph_l_mask_has_corridor_nodes():
    """A bordered mask yields at least one corridor_node."""
    graph = build_floor_graph_from_mask(make_l_mask(), [], [], 200, 200)
    corridor_nodes = [
        n for n, d in graph.nodes(data=True) if d.get("type") == "corridor_node"
    ]
    assert len(corridor_nodes) >= 1, "expected at least one corridor node"


def test_floor_graph_rooms_appear_as_room_nodes():
    """One room dict → at least one node with type 'room'."""
    room = {
        "id": "abc",
        "name": "Room A",
        "room_type": "room",
        "x": 0.3,
        "y": 0.3,
        "width": 0.1,
        "height": 0.1,
    }
    graph = build_floor_graph_from_mask(make_l_mask(), [room], [], 200, 200)
    room_nodes = [n for n, d in graph.nodes(data=True) if d.get("type") == "room"]
    assert len(room_nodes) >= 1, "expected the room to appear as a room node"


def test_build_floor_graph_includes_doors():
    """A floor door dict produces a node with type 'door' in the graph."""
    room = {
        "id": "r1", "name": "R", "room_type": "room",
        "x": 0.3, "y": 0.3, "width": 0.1, "height": 0.1,
    }
    door = {
        "id": "d1", "x1": 0.35, "y1": 0.35, "x2": 0.35, "y2": 0.35,
        "room_id": "r1",
    }
    graph = build_floor_graph_from_mask(make_l_mask(), [room], [door], 200, 200)
    door_nodes = [n for n, d in graph.nodes(data=True) if d.get("type") == "door"]
    assert len(door_nodes) >= 1, "expected the door to appear as a door node"


def test_floor_graph_empty_mask_raises_error():
    """An empty array raises ImageProcessingError."""
    with pytest.raises(ImageProcessingError):
        build_floor_graph_from_mask(np.zeros((0, 0), dtype=np.uint8), [], [], 0, 0)
