import logging
import math
from typing import List, TYPE_CHECKING

import cv2
import numpy as np

from app.core.exceptions import ImageProcessingError
from app.models.domain import VectorizationResult

if TYPE_CHECKING:
    import trimesh

logger = logging.getLogger(__name__)


def build_mesh_from_mask(
    mask: np.ndarray,
    floor_height: float = 3.0,
    pixels_per_meter: float = 50.0,
    vr: "VectorizationResult | None" = None,
) -> "trimesh.Trimesh":
    """
    Строит 3D-меш этажа из бинарной маски стен.

    Использует cv2.findContours для извлечения контуров стен из маски,
    экструдирует их на floor_height. Без пола и потолка — чистые стены
    для обзора сверху (как карта здания).

    Args:
        mask: Бинарная маска (uint8), белый (255) = стены.
        floor_height: Высота этажа в метрах (default: 3.0).
        pixels_per_meter: Масштаб пикселей на метр.
        vr: Опциональный VectorizationResult для цветов комнат.

    Returns:
        trimesh.Trimesh — объединённый меш. НЕ сохранён на диск.
    """
    try:
        import trimesh as _trimesh
    except ImportError:
        raise ImageProcessingError("build_mesh_from_mask", "trimesh not installed")

    from app.processing.mesh_generator import (
        extrude_wall,
        WALL_COLOR,
    )
    from shapely.geometry import Polygon as ShapelyPolygon

    h, w = mask.shape[:2]

    # Sanity check: white should be walls (10-40%), not free space (>50%)
    white_ratio = float(np.sum(mask > 127)) / (h * w)
    logger.info("build_mesh_from_mask: white_ratio=%.1f%%", white_ratio * 100)
    if white_ratio > 0.5:
        logger.warning(
            "build_mesh_from_mask: white_ratio=%.1f%% — mask may be inverted! "
            "Expected white=walls (10-40%%)",
            white_ratio * 100,
        )

    # Step 1: Extract wall contours from mask using RETR_CCOMP hierarchy.
    # For each top-level contour (parent == -1), collect its direct children
    # as holes. This correctly handles the closed outer building boundary:
    # outer ring (57% area) + inner hole (52% area) = wall ring (5% area).
    contours_raw, hierarchy = cv2.findContours(
        mask.copy(), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE,
    )

    min_area = 50
    if hierarchy is not None:
        hier = hierarchy[0]
        # Build map: parent_idx → list of child contours
        children: dict = {}
        for i, c in enumerate(contours_raw):
            parent = hier[i][3]
            if parent != -1:
                children.setdefault(parent, []).append(c)

        # Keep top-level contours; attach their holes
        # contours list becomes list of (exterior, [holes])
        contour_pairs = []
        for i, c in enumerate(contours_raw):
            if hier[i][3] == -1 and cv2.contourArea(c) > min_area:
                holes = children.get(i, [])
                contour_pairs.append((c, holes))
        contours = contour_pairs
    else:
        contours = [(c, []) for c in contours_raw if cv2.contourArea(c) > min_area]

    logger.info(
        "build_mesh_from_mask: image=%dx%d, raw=%d, filtered=%d, ppm=%.2f",
        w, h, len(contours_raw), len(contours), pixels_per_meter,
    )

    if not contours:
        raise ImageProcessingError(
            "build_mesh_from_mask", "No wall contours found in mask",
        )

    # Step 2: Contours → polygons (pixels → metres, Y-flip)
    scale = 1.0 / pixels_per_meter
    h_m = h * scale
    polygons = []
    for exterior_c, hole_cs in contours:
        ext_pts = exterior_c.reshape(-1, 2).astype(float) * scale
        ext_flipped = [(x, h_m - y) for x, y in ext_pts]
        hole_list = []
        for hole_c in hole_cs:
            hole_pts = hole_c.reshape(-1, 2).astype(float) * scale
            hole_flipped = [(x, h_m - y) for x, y in hole_pts]
            hole_list.append(hole_flipped)
        try:
            poly = ShapelyPolygon(ext_flipped, hole_list)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_valid and not poly.is_empty and poly.area > 0:
                polygons.append(poly)
        except Exception as exc:
            logger.debug("polygon build failed: %s", exc)
    logger.info("Polygons: %d", len(polygons))

    if not polygons:
        raise ImageProcessingError(
            "build_mesh_from_mask", "No valid polygons from contours",
        )

    # Step 3: Extrude walls
    meshes: list = []
    for poly in polygons:
        wall_mesh = extrude_wall(poly, height=floor_height)
        if wall_mesh is not None:
            # Assign light colour to each wall mesh individually
            colors = np.tile(WALL_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)
            wall_mesh.visual.vertex_colors = colors
            meshes.append(wall_mesh)

    logger.info("Wall meshes: %d", len(meshes))

    if not meshes:
        raise ImageProcessingError(
            "build_mesh_from_mask", "No wall meshes created",
        )

    # NO floor, NO ceiling — clean wall-only view from above

    # Step 4: Combine
    combined = _trimesh.util.concatenate(meshes)

    # Step 5: Z-up → Y-up (Three.js convention)
    matrix = _trimesh.transformations.rotation_matrix(
        -math.pi / 2, [1, 0, 0],
    )
    combined.apply_transform(matrix)

    return combined


# Legacy wrapper
def build_mesh(
    contours: List[np.ndarray],
    image_width: int,
    image_height: int,
    floor_height: float = 3.0,
    pixels_per_meter: float = 50.0,
) -> "trimesh.Trimesh":
    """Legacy: строит меш из готовых контуров."""
    if not contours:
        raise ImageProcessingError("build_mesh", "No contours provided")

    try:
        import trimesh as _trimesh
    except ImportError:
        raise ImageProcessingError("build_mesh", "trimesh not installed")

    from app.processing.mesh_generator import (
        contours_to_polygons,
        extrude_wall,
        WALL_COLOR,
    )

    polygons = contours_to_polygons(contours, image_height, pixels_per_meter)
    meshes = []
    for poly in polygons:
        m = extrude_wall(poly, height=floor_height)
        if m is not None:
            colors = np.tile(WALL_COLOR, (len(m.vertices), 1)).astype(np.uint8)
            m.visual.vertex_colors = colors
            meshes.append(m)

    combined = _trimesh.util.concatenate(meshes)
    matrix = _trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0])
    combined.apply_transform(matrix)
    return combined
