"""
API routes for Building hierarchy (Phase 05).
Thin router: validate → call service → return response.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.api.deps import get_building_service
from app.core.exceptions import BuildingDuplicateCodeError, BuildingNotFoundError
from app.models.buildings import (
    BuildingCreateRequest,
    BuildingDetailResponse,
    BuildingPublicResponse,
    BuildingResponse,
    BuildingUpdateRequest,
)
from app.services.building_service import BuildingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/buildings", tags=["buildings-hierarchy"])
security = HTTPBearer()


@router.post("", response_model=BuildingResponse, status_code=status.HTTP_201_CREATED)
async def create_building(
    req: BuildingCreateRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: BuildingService = Depends(get_building_service),
) -> BuildingResponse:
    """Create a new building (admin only)."""
    try:
        return await svc.create_building(req)
    except BuildingDuplicateCodeError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Building with code '{e.code}' already exists",
        )


@router.get("", response_model=list[BuildingResponse] | list[BuildingPublicResponse])
async def list_buildings(
    published: bool = False,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: BuildingService = Depends(get_building_service),
):
    """List buildings.

    - published=false (default): admin mode — all buildings, requires auth.
    - published=true: public mode — only published buildings with nested floors/sections.
      Still requires auth (ADR-18).
    """
    if published:
        return await svc.list_published()
    return await svc.list_admin()


@router.get("/{building_id}", response_model=BuildingDetailResponse)
async def get_building(
    building_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: BuildingService = Depends(get_building_service),
) -> BuildingDetailResponse:
    """Get building detail (admin only)."""
    try:
        return await svc.get_by_id(building_id)
    except BuildingNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building {e.building_id} not found",
        )


@router.patch("/{building_id}", response_model=BuildingResponse)
async def update_building(
    building_id: int,
    req: BuildingUpdateRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: BuildingService = Depends(get_building_service),
) -> BuildingResponse:
    """Partially update a building (admin only). code is immutable."""
    try:
        return await svc.update(building_id, req)
    except BuildingNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building {e.building_id} not found",
        )


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_building(
    building_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: BuildingService = Depends(get_building_service),
) -> None:
    """Delete building and cascade to floors/sections (admin only)."""
    try:
        await svc.delete(building_id)
    except BuildingNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building {e.building_id} not found",
        )
