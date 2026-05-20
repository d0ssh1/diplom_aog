"""Typed vector payloads for edit-plan restore/save."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class VectorPoint(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)


class VectorRoom(BaseModel):
    id: str
    name: str = ""
    room_type: str = "room"
    center: VectorPoint
    polygon: list[VectorPoint]
    area_normalized: float = Field(..., ge=0.0)


class VectorDoor(BaseModel):
    id: str
    position: VectorPoint
    width: float = Field(..., ge=0.0)
    connects: list[str] = Field(default_factory=list)


class VectorizationResult(BaseModel):
    walls: list[dict] = Field(default_factory=list)
    rooms: list[VectorRoom] = Field(default_factory=list)
    doors: list[VectorDoor] = Field(default_factory=list)
    text_blocks: list[dict] = Field(default_factory=list)
    image_size_original: tuple[int, int] = (0, 0)
    image_size_cropped: tuple[int, int] = (0, 0)
    crop_rect: Optional[dict] = None
    crop_applied: bool = False
    rotation_angle: int = 0
    wall_thickness_px: float = 0.0
    estimated_pixels_per_meter: float = 0.0
    rooms_with_names: int = 0
    corridors_count: int = 0
    doors_count: int = 0
    model_config = {"extra": "ignore"}
