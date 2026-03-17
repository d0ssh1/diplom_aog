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
        contours_to_polygons,
        extrude_wall,
        WALL_COLOR,
    )

    h, w = mask.shape[:2]

    # Step 1: Extract wall contours from mask
    contours_raw, _ = cv2.findContours(
        mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
    )

    min_area = 50
    contours = [c for c in contours_raw if cv2.contourArea(c) > min_area]

    logger.info(
        "build_mesh_from_mask: image=%dx%d, raw=%d, filtered=%d, ppm=%.2f",
        w, h, len(contours_raw), len(contours), pixels_per_meter,
    )

    if not contours:
        raise ImageProcessingError(
            "build_mesh_from_mask", "No wall contours found in mask",
        )

    # Step 2: Contours → polygons (pixels → metres, Y-flip)
    polygons = contours_to_polygons(contours, h, pixels_per_meter)
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
