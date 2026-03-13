from pydantic import BaseModel, Field
from typing import List


class Point2D(BaseModel):
    """Точка в нормализованных координатах [0, 1]."""
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)


class Wall(BaseModel):
    """Стена как полилиния точек."""
    id: str  # UUID строка
    points: List[Point2D]
    thickness: float = 0.2  # метры


class FloorPlan(BaseModel):
    """Доменная модель плана этажа (не ORM, не API response)."""
    id: str  # UUID строка = file_id загруженного плана
    walls: List[Wall] = []
    image_width: int
    image_height: int


class VectorizationResult(BaseModel):
    """Результат векторизации маски — выход processing/vectorizer.py."""
    contours_count: int
    wall_pixel_area: int  # суммарная площадь всех контуров в пикселях
