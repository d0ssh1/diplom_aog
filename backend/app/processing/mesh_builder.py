import logging
import numpy as np
from typing import List, TYPE_CHECKING

from app.core.exceptions import ImageProcessingError

if TYPE_CHECKING:
    import trimesh

logger = logging.getLogger(__name__)


def build_mesh(
    contours: List[np.ndarray],
    image_width: int,
    image_height: int,
    floor_height: float = 1.5,
    pixels_per_meter: float = 50.0,
) -> "trimesh.Trimesh":
    """
    Строит 3D-меш этажа из контуров стен.

    Args:
        contours: Список контуров стен (N, 1, 2), dtype=int32.
        image_width: Ширина исходного изображения в пикселях.
        image_height: Высота исходного изображения в пикселях.
        floor_height: Высота этажа в метрах.
        pixels_per_meter: Масштаб: пикселей на метр.

    Returns:
        trimesh.Trimesh — объединённый меш. НЕ сохранён на диск.

    Raises:
        ImageProcessingError: если контуры пустые или trimesh не установлен.
    """
    if not contours:
        raise ImageProcessingError("build_mesh", "No contours provided")

    try:
        import trimesh  # noqa: F401
    except ImportError:
        raise ImageProcessingError("build_mesh", "trimesh not installed")

    from app.processing.mesh_generator import MeshGeneratorService

    _gen = MeshGeneratorService(
        output_dir="/tmp",
        default_floor_height=floor_height,
        pixels_per_meter=pixels_per_meter,
    )
    return _gen.generate_floor_model(contours, image_width, image_height)
