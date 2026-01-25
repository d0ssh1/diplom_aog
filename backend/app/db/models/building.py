"""
Database models for Building and Flooring
"""

from datetime import datetime
from typing import List

from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Building(Base):
    """Building DB Model"""
    __tablename__ = "buildings"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(512), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # floors = relationship("Floor", back_populates="building")


class Floor(Base):
    """Floor DB Model"""
    __tablename__ = "floors"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    building_id: Mapped[int] = mapped_column(Integer, ForeignKey("buildings.id"), nullable=False)
    
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    reconstruction_id: Mapped[int] = mapped_column(Integer, ForeignKey("reconstructions.id"), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # building = relationship("Building", back_populates="floors")
    # reconstruction = relationship("Reconstruction")
