"""
Pydantic модели для реконструкции и обработки планов
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# === File Upload ===

class UploadPhotoResponse(BaseModel):
    """Ответ после загрузки файла"""
    id: str  # UUID файла
    url: str
    file_type: int
    source_type: int
    uploaded_by: int
    uploaded_at: datetime


# === Mask Processing ===

class CropRect(BaseModel):
    """Область кадрирования"""
    x: float  # Left position (0-1 ratio)
    y: float  # Top position (0-1 ratio)
    width: float  # Width (0-1 ratio)
    height: float  # Height (0-1 ratio)


class CalculateMaskRequest(BaseModel):
    """Запрос на расчёт маски"""
    file_id: str
    crop: Optional[CropRect] = None
    rotation: int = 0  # Rotation in degrees (0, 90, 180, 270)
    block_size: int = 15
    threshold_c: int = 10


class MaskPreviewRequest(BaseModel):
    """Запрос на превью маски (без сохранения)"""
    file_id: str
    crop: Optional[CropRect] = None
    rotation: int = 0
    block_size: int = 15
    threshold_c: int = 10
    block_size: int = 15
    threshold_c: int = 10


class MaskPreviewRequest(BaseModel):
    """Запрос на превью маски (без сохранения)"""
    file_id: str
    crop: Optional[CropRect] = None
    rotation: int = 0
    block_size: int = 15
    threshold_c: int = 10


class CalculateMaskResponse(BaseModel):
    """Ответ с маской"""
    id: str
    source_upload_file_id: str
    created_at: datetime
    created_by: int
    url: str


# === Hough Transform ===

class CalculateHoughRequest(BaseModel):
    """Запрос на расчёт линий Хафа"""
    plan_file_id: str
    user_mask_file_id: str


class CalculateHoughResponse(BaseModel):
    """Ответ с линиями Хафа"""
    id: str
    plan_upload_file_id: str
    user_mask_upload_file_id: str
    created_at: datetime
    created_by: int
    url: str


# === 3D Reconstruction ===

class ReconstructionStatus:
    """Статусы реконструкции"""
    CREATED = 1
    PROCESSING = 2
    COMPLETED = 3
    ERROR = 4


class CalculateMeshRequest(BaseModel):
    """Запрос на построение 3D модели"""
    plan_file_id: str
    user_mask_file_id: str


class CalculateMeshResponse(BaseModel):
    """Ответ с 3D моделью"""
    id: int
    name: str = ""
    status: int = ReconstructionStatus.CREATED
    status_display: str = ""
    created_at: datetime
    created_by: int
    saved_at: Optional[datetime] = None
    url: Optional[str] = None
    error_message: Optional[str] = None


class SaveReconstructionRequest(BaseModel):
    """Запрос на сохранение реконструкции"""
    name: str = Field(..., min_length=1, max_length=100)


class ReconstructionListItem(BaseModel):
    """Элемент списка реконструкций"""
    id: int
    name: str


class PatchReconstructionRequest(BaseModel):
    """Обновление имени реконструкции"""
    name: str


# === Rooms ===

class RoomData(BaseModel):
    """Данные комнаты"""
    number: str = Field(..., pattern=r"^[A-Za-z]\d{3}[A-Za-z]?$")  # Формат: A304
    x: float
    y: float


class RoomsRequest(BaseModel):
    """Запрос с комнатами"""
    rooms: List[RoomData]


# === Nav Graph ===

class BuildNavGraphRequest(BaseModel):
    mask_file_id: str
    rooms: list[dict]
    doors: list[dict]
    scale_factor: float = 0.05


class BuildNavGraphResponse(BaseModel):
    graph_id: str
    nodes_count: int
    edges_count: int
    room_nodes: list[str]
    door_nodes: list[str]


# === Navigation ===

class FindRouteRequest(BaseModel):
    graph_id: str
    from_room_id: str
    to_room_id: str


class FindRouteResponse(BaseModel):
    status: str
    from_room: Optional[str] = None
    to_room: Optional[str] = None
    total_distance_meters: Optional[float] = None
    estimated_time_seconds: Optional[int] = None
    coordinates: Optional[List[List[float]]] = None
    path_nodes_count: Optional[int] = None
    message: Optional[str] = None


class RouteRequest(BaseModel):
    """Запрос на построение маршрута"""
    start_point: str  # Формат: A304
    end_point: str    # Формат: B205


class RoutePoint(BaseModel):
    """Точка маршрута"""
    x: float
    y: float
    z: int  # Номер этажа


class RouteResponse(BaseModel):
    """Ответ с маршрутом"""
    points: List[RoutePoint]
    total_distance: float  # в метрах
    estimated_time: float  # в минутах
