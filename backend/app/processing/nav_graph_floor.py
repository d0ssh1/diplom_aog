"""Floor-level nav-graph helpers — PURE processing layer.

Bridges section room/door coordinates into the assembled floor-canvas space and
orchestrates the existing ``nav_graph.py`` pipeline on the assembled floor mask.

NOTE: ``processing/`` is the PURE layer. This module imports ONLY ``math`` /
``numpy`` / ``networkx`` / ``dataclasses`` / ``typing`` / stdlib +
``app.core.exceptions`` at module level. The heavier ``app.processing.nav_graph``
/ ``app.processing.pipeline`` imports are done lazily inside
``build_floor_graph_from_mask`` (pure → pure imports, deferred to keep import
time light — mirrors ``nav_service.py``). No DB, no HTTP, no file IO, no service
imports.

CRITICAL — the "no shifts" guarantee (design ADR-11, 06-pipeline-spec §3):
The solved similarity ``(scale, rotation_rad, tx, ty)`` is applied by
``cv2.warpAffine`` directly to the section wall-mask ARRAY (mask-pixel →
master-pixel). Therefore a room/door MUST be de-normalised by the EXACT pixel
dimensions of the loaded mask array that is warped — ``mask.shape[1]`` (W) /
``mask.shape[0]`` (H) — NOT the stored ``vectorization_data.image_size_cropped``
(only asserted ≈ mask aspect). Using ``image_size_cropped`` would introduce
exactly the room "shift" the feature must avoid. Rooms/doors warp through the SAME
``scale·R(rotation_rad)`` + translation as the walls, so they stay aligned by
construction.
"""

import logging
import math
from dataclasses import dataclass
from typing import Optional

import networkx as nx
import numpy as np

from app.core.exceptions import ImageProcessingError

logger = logging.getLogger(__name__)

# Door→corridor snap bounds (R5, 06-pipeline-spec [B2]). The distance cap is
# deliberately LOOSE — its only job is to reject absurd cross-canvas snaps; the
# seeded line-of-sight does the real cross-section rejection. Derived from wall
# thickness so the bounds scale with the plan's pixel resolution.
SNAP_RATIO: float = 12.0
MIN_SNAP_PX: float = 12.0
MAX_SNAP_PX_CAP: float = 80.0


@dataclass(frozen=True)
class SectionRoomInput:
    """One room from ``Reconstruction.vectorization_data`` plus the section's
    k-scaled transform and the LOADED MASK pixel dims.

    Attributes:
        room_id: room identifier from ``vectorization_data.rooms[*].id``.
        name: human room name (e.g. "Аудитория 301").
        room_type: room category (``room`` / ``staircase`` / ``elevator`` / ...).
        polygon: room outline as ``[(x, y), ...]`` normalised [0,1] over the
            SECTION cropped wall mask (``VectorRoom.polygon``). The floor bbox is
            the AABB of these vertices AFTER the similarity warp — under rotation
            the section-space bbox is NOT the floor-space bbox, so the vertices are
            warped first, then the floor-space AABB is taken.
        mask_w: pixel width of the SECTION WALL-MASK ARRAY that is warped into the
            floor (``mask.shape[1]``) — NOT ``image_size_cropped``. This is what
            makes rooms track walls with zero shift (ADR-11).
        mask_h: pixel height of the SECTION WALL-MASK ARRAY (``mask.shape[0]``).
        scale_k: ``section.transform["scale"] * k`` (pre-multiplied by the canvas
            memory-guard factor ``k``).
        rotation_rad: ``section.transform["rotation_rad"]`` — NOT k-scaled (a
            rotation is invariant to the uniform memory-guard factor ``k``).
        tx_k: ``section.transform["tx"] * k``.
        ty_k: ``section.transform["ty"] * k``.
    """

    room_id: str
    name: str
    room_type: str
    polygon: list[tuple[float, float]]
    mask_w: int
    mask_h: int
    scale_k: float
    rotation_rad: float
    tx_k: float
    ty_k: float


def transform_rooms_to_floor_canvas(
    rooms: list[SectionRoomInput],
    canvas_w: int,
    canvas_h: int,
) -> list[dict]:
    """Transform section-norm room polygons to floor-canvas-norm bbox dicts.

    Each room polygon vertex is de-normalised by the room's OWN loaded-mask pixel
    dims (``mask_w`` / ``mask_h``), warped through the SAME k-scaled similarity
    ``scale_k · R(rotation_rad)`` + ``(tx_k, ty_k)`` that ``assemble_floor_mask``
    applies to the section wall pixels, and the axis-aligned bounding box of the
    warped vertices is taken, clipped to the canvas, then re-normalised to [0,1]
    over the floor canvas. Warping the vertices then taking the floor-space AABB is
    correct under rotation — the section-space AABB is NOT the floor-space AABB.
    This guarantees rooms land on the assembled walls with zero shift (design
    ADR-11, 06-pipeline-spec §3).

    Args:
        rooms: section rooms with their k-scaled transforms + LOADED mask dims.
        canvas_w: assembled canvas width in pixels.
        canvas_h: assembled canvas height in pixels.

    Returns:
        List of dicts with keys ``id``, ``name``, ``room_type``, ``x``, ``y``,
        ``width``, ``height`` all normalised [0,1] over ``(canvas_w, canvas_h)``.
        The dict shape matches what ``nav_graph.integrate_semantics`` consumes.
        Rooms are clipped to the canvas; zero-area rooms (after clipping) are
        dropped.
    """
    result: list[dict] = []
    for room in rooms:
        # scale·R(rotation_rad): the SAME similarity the wall pixels get.
        cos = room.scale_k * math.cos(room.rotation_rad)
        sin = room.scale_k * math.sin(room.rotation_rad)
        floor_xs: list[float] = []
        floor_ys: list[float] = []
        for norm_x, norm_y in room.polygon:
            # De-normalise by the LOADED MASK dims (the warped array) — ADR-11.
            sec_px_x = norm_x * room.mask_w
            sec_px_y = norm_y * room.mask_h
            floor_xs.append(cos * sec_px_x - sin * sec_px_y + room.tx_k)
            floor_ys.append(sin * sec_px_x + cos * sec_px_y + room.ty_k)
        if not floor_xs:
            continue

        # Axis-aligned bbox of the warped vertices, clipped to the canvas.
        x0 = max(0.0, min(min(floor_xs), canvas_w - 1.0))
        y0 = max(0.0, min(min(floor_ys), canvas_h - 1.0))
        floor_px_w = min(max(floor_xs) - min(floor_xs), canvas_w - x0)
        floor_px_h = min(max(floor_ys) - min(floor_ys), canvas_h - y0)

        if floor_px_w <= 0 or floor_px_h <= 0:
            continue

        result.append(
            {
                "id": room.room_id,
                "name": room.name,
                "room_type": room.room_type,
                "x": x0 / canvas_w,
                "y": y0 / canvas_h,
                "width": floor_px_w / canvas_w,
                "height": floor_px_h / canvas_h,
            }
        )
    return result


@dataclass(frozen=True)
class SectionDoorInput:
    """One door from ``Reconstruction.vectorization_data`` plus the section's
    k-scaled transform and the LOADED MASK pixel dims.

    Attributes:
        door_id: door identifier from ``vectorization_data.doors[*].id``.
        position: door centre ``(x, y)`` normalised [0,1] over the SECTION cropped
            wall mask (``VectorDoor.position``).
        room_id: the room this door connects to (``connects[0]``), or ``None``.
        mask_w: pixel width of the SECTION WALL-MASK ARRAY (``mask.shape[1]``) —
            NOT ``image_size_cropped`` (ADR-11).
        mask_h: pixel height of the SECTION WALL-MASK ARRAY (``mask.shape[0]``).
        scale_k: ``section.transform["scale"] * k``.
        rotation_rad: ``section.transform["rotation_rad"]`` — NOT k-scaled.
        tx_k: ``section.transform["tx"] * k``.
        ty_k: ``section.transform["ty"] * k``.
    """

    door_id: str
    position: tuple[float, float]
    room_id: Optional[str]
    mask_w: int
    mask_h: int
    scale_k: float
    rotation_rad: float
    tx_k: float
    ty_k: float


def transform_doors_to_floor_canvas(
    doors: list[SectionDoorInput],
    canvas_w: int,
    canvas_h: int,
) -> list[dict]:
    """Transform section-norm door points to floor-canvas-norm point dicts.

    Each door position is de-normalised by the door's OWN loaded-mask pixel dims,
    warped through the SAME ``scale_k · R(rotation_rad)`` + ``(tx_k, ty_k)``
    similarity as the walls/rooms, clipped to the canvas and re-normalised to
    [0,1]. The emitted shape is a degenerate "point" segment (``x1 == x2``,
    ``y1 == y2``) — exactly what ``nav_graph.integrate_semantics`` consumes for a
    door (06-pipeline-spec §4).

    Args:
        doors: section doors with their k-scaled transforms + LOADED mask dims.
        canvas_w: assembled canvas width in pixels.
        canvas_h: assembled canvas height in pixels.

    Returns:
        List of dicts with keys ``id``, ``x1``, ``y1``, ``x2``, ``y2``,
        ``room_id`` (``x1 == x2``, ``y1 == y2``), normalised [0,1] over the canvas.
    """
    result: list[dict] = []
    for door in doors:
        cos = door.scale_k * math.cos(door.rotation_rad)
        sin = door.scale_k * math.sin(door.rotation_rad)
        sec_px_x = door.position[0] * door.mask_w
        sec_px_y = door.position[1] * door.mask_h
        floor_px_x = cos * sec_px_x - sin * sec_px_y + door.tx_k
        floor_px_y = sin * sec_px_x + cos * sec_px_y + door.ty_k

        # Clip to canvas bounds.
        floor_px_x = max(0.0, min(floor_px_x, canvas_w - 1.0))
        floor_px_y = max(0.0, min(floor_px_y, canvas_h - 1.0))

        norm_x = floor_px_x / canvas_w
        norm_y = floor_px_y / canvas_h
        result.append(
            {
                "id": door.door_id,
                "x1": norm_x,
                "y1": norm_y,
                "x2": norm_x,
                "y2": norm_y,
                "room_id": door.room_id,
            }
        )
    return result


def build_floor_graph_from_mask(
    assembled_mask: np.ndarray,
    floor_rooms: list[dict],
    floor_doors: list[dict],
    canvas_w: int,
    canvas_h: int,
) -> nx.Graph:
    """Build a nav topology graph from an assembled floor mask.

    Delegates entirely to the existing pure helpers in ``nav_graph.py`` — no new
    topology logic. Computes the corridor mask, skeletonises it, builds the
    topology graph, prunes dendrites and integrates room + door semantics.

    Args:
        assembled_mask: ``(H, W)`` uint8 ``{0,255}`` — white = walls. Not
            None/empty; dtype must be ``uint8``.
        floor_rooms: room dicts normalised [0,1] over the canvas (output of
            ``transform_rooms_to_floor_canvas``).
        floor_doors: door dicts normalised [0,1] over the canvas (output of
            ``transform_doors_to_floor_canvas``); ``[]`` when the floor has none.
        canvas_w: canvas width (``== assembled_mask.shape[1]``).
        canvas_h: canvas height (``== assembled_mask.shape[0]``).

    Returns:
        ``nx.Graph`` with ``corridor_node`` / ``room`` / ``door`` /
        ``corridor_entry`` node types.

    Raises:
        ImageProcessingError: if ``assembled_mask`` is None, empty, or wrong dtype.
    """
    from app.processing.nav_graph import (
        build_skeleton,
        build_topology_graph,
        extract_corridor_mask,
        integrate_semantics,
        prune_dendrites,
    )
    # NOTE: compute_wall_thickness lives in pipeline, NOT nav_graph.
    from app.processing.pipeline import compute_wall_thickness

    if assembled_mask is None or assembled_mask.size == 0:
        raise ImageProcessingError("build_floor_graph_from_mask", "Empty mask")
    if assembled_mask.dtype != np.uint8:
        raise ImageProcessingError(
            "build_floor_graph_from_mask",
            f"Expected uint8, got {assembled_mask.dtype}",
        )

    wall_thickness_px = compute_wall_thickness(assembled_mask)
    if wall_thickness_px <= 0:
        wall_thickness_px = 3.0  # fallback

    # R5 snap bounds derived locally from wall thickness (ADR-12) — no ppm
    # threading. The seeded LOS (skip_px past the door's own wall) is the real
    # cross-section gate; max_snap_dist_px only rejects absurd cross-canvas snaps.
    max_snap_dist_px = min(
        MAX_SNAP_PX_CAP, max(MIN_SNAP_PX, SNAP_RATIO * wall_thickness_px)
    )
    skip_px = wall_thickness_px + 1.0

    corridor_mask = extract_corridor_mask(
        assembled_mask, floor_rooms, canvas_w, canvas_h, wall_thickness_px
    )
    skeleton = build_skeleton(corridor_mask)
    graph = build_topology_graph(skeleton)
    graph = prune_dendrites(graph, min_branch_length=20.0)
    graph = integrate_semantics(
        graph, floor_rooms, floor_doors, canvas_w, canvas_h,
        assembled_mask, max_snap_dist_px, skip_px,
    )
    return graph
