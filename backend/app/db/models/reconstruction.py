"""
Database models for Reconstruction and Files
"""

from datetime import datetime
from typing import Optional, List

from sqlalchemy import String, Integer, DateTime, ForeignKey, Float, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UploadedFile(Base):
    """Uploaded File DB Model"""
    __tablename__ = "uploaded_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    
    file_type: Mapped[int] = mapped_column(Integer, default=1)  # 1=Plan, 2=Mask, 3=Env
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    # user = relationship("User")


class Reconstruction(Base):
    """Reconstruction Project DB Model"""
    __tablename__ = "reconstructions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    
    plan_file_id: Mapped[str] = mapped_column(String(36), ForeignKey("uploaded_files.id"), nullable=False)
    mask_file_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("uploaded_files.id"), nullable=True)
    mesh_file_id_obj: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mesh_file_id_glb: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    status: Mapped[int] = mapped_column(Integer, default=1)  # 1=Created, 2=Processing, 3=Done, 4=Error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    # plan_file = relationship("UploadedFile", foreign_keys=[plan_file_id])
    # mask_file = relationship("UploadedFile", foreign_keys=[mask_file_id])


class Room(Base):
    """Room Marker DB Model"""
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reconstruction_id: Mapped[int] = mapped_column(Integer, ForeignKey("reconstructions.id"), nullable=False)
    
    number: Mapped[str] = mapped_column(String(20), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    
    # relationship("Reconstruction", back_populates="rooms")
