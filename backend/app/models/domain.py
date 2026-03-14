from pydantic import BaseModel, Field
from typing import List, Optional, Tuple


class Point2D(BaseModel):
    """Точка в нормализованных координатах [0, 1]."""
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)


class Wall(BaseModel):
    """Стена как полилиния точек."""
    id: str
    points: List[Point2D]
    thickness: float = 0.2


class TextBlock(BaseModel):
    """Распознанный текстовый блок (OCR)."""
    text: str
    center: Point2D
    confidence: float = Field(0.0, ge=0.0, le=100.0)
    is_room_number: bool = False


class Room(BaseModel):
    """Комната — замкнутый полигон с метаданными."""
    id: str
    name: str = ""
    polygon: List[Point2D]
    center: Point2D
    room_type: str = "room"  # "room" | "corridor"
    area_normalized: float = Field(0.0, ge=0.0)


class Door(BaseModel):
    """Дверь — точка между двумя комнатами."""
    id: str
    position: Point2D
    width: float = Field(0.0, ge=0.0)
    connects: List[str] = Field(default_factory=list)  # room IDs


class FloorPlan(BaseModel):
    """Доменная модель плана этажа (не ORM, не API response)."""
    id: str
    walls: List[Wall] = []
    image_width: int
    image_height: int


class VectorizationResult(BaseModel):
    """Полный структурированный результат векторизации."""
    # Структурные элементы
    walls: List[Wall] = Field(default_factory=list)
    rooms: List[Room] = Field(default_factory=list)
    doors: List[Door] = Field(default_factory=list)
    text_blocks: List[TextBlock] = Field(default_factory=list)

    # Метаданные изображения
    image_size_original: Tuple[int, int]  # (width, height) до кропа
    image_size_cropped: Tuple[int, int]   # (width, height) после кропа
    crop_rect: Optional[dict] = None      # {x, y, width, height} [0,1]
    crop_applied: bool = False
    rotation_angle: int = 0               # 0/90/180/270

    # Масштаб и геометрия
    wall_thickness_px: float = 0.0
    estimated_pixels_per_meter: float = 50.0

    # Статистика
    rooms_with_names: int = 0
    corridors_count: int = 0
    doors_count: int = 0
