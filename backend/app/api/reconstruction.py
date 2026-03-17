"""
API routes for reconstruction operations
"""
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.api.deps import get_reconstruction_service, get_mask_service
from fastapi.responses import Response

from app.models import (
    CalculateMaskRequest,
    CalculateMaskResponse,
    MaskPreviewRequest,
    CalculateHoughRequest,
    CalculateHoughResponse,
    CalculateMeshRequest,
    CalculateMeshResponse,
    SaveReconstructionRequest,
    ReconstructionListItem,
    PatchReconstructionRequest,
    RoomsRequest,
)
from app.services.reconstruction_service import ReconstructionService
from app.services.mask_service import MaskService
from app.models.domain import VectorizationResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reconstruction", tags=["Reconstruction"])
security = HTTPBearer()


# === Mask Processing ===

@router.post("/initial-masks", response_model=CalculateMaskResponse)
async def calculate_initial_mask(
    request: CalculateMaskRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: MaskService = Depends(get_mask_service),
):
    crop_dict = None
    if request.crop:
        crop_dict = {
            'x': request.crop.x,
            'y': request.crop.y,
            'width': request.crop.width,
            'height': request.crop.height,
        }
    try:
        filename = await svc.calculate_mask(
            request.file_id,
            crop=crop_dict,
            rotation=request.rotation,
            block_size=request.block_size,
            threshold_c=request.threshold_c,
        )
    except Exception as e:
        logger.error("calculate_mask failed: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка обработки изображения")
    return CalculateMaskResponse(
        id=request.file_id,
        source_upload_file_id=request.file_id,
        created_at=datetime.utcnow(),
        created_by=1,
        url=f"/api/v1/uploads/masks/{filename}",
    )


@router.post("/mask-preview")
async def mask_preview(
    request: MaskPreviewRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: MaskService = Depends(get_mask_service),
):
    """Генерирует превью маски с заданными параметрами. Не сохраняет на диск."""
    crop_dict = None
    if request.crop:
        crop_dict = {
            'x': request.crop.x,
            'y': request.crop.y,
            'width': request.crop.width,
            'height': request.crop.height,
        }
    try:
        mask_bytes = await svc.preview_mask(
            file_id=request.file_id,
            crop=crop_dict,
            rotation=request.rotation,
            block_size=request.block_size,
            threshold_c=request.threshold_c,
        )
    except Exception as e:
        logger.error("mask_preview failed: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка генерации превью")
    return Response(content=mask_bytes, media_type="image/png")


# === Hough Transform ===

@router.post("/houghs", response_model=CalculateHoughResponse)
async def calculate_hough_lines(
    request: CalculateHoughRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    return CalculateHoughResponse(
        id="hough-placeholder-id",
        plan_upload_file_id=request.plan_file_id,
        user_mask_upload_file_id=request.user_mask_file_id,
        created_at=datetime.utcnow(),
        created_by=1,
        url="/uploads/hough/placeholder.png",
    )


# === 3D Reconstruction ===

@router.post("/reconstructions", response_model=CalculateMeshResponse)
async def calculate_mesh(
    request: CalculateMeshRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    try:
        reconstruction = await svc.build_mesh(
            plan_file_id=request.plan_file_id,
            mask_file_id=request.user_mask_file_id,
            user_id=1,
        )
    except Exception as e:
        logger.error("build_mesh failed: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка построения 3D модели")
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=svc.get_status_display(reconstruction.status),
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by or 1,
        url=svc.build_mesh_url(reconstruction),
        error_message=reconstruction.error_message,
    )


@router.get("/reconstructions", response_model=List[ReconstructionListItem])
async def get_reconstructions(
    is_saved: int = Query(1),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    reconstructions = await svc.get_saved_reconstructions()
    return [
        ReconstructionListItem(
            id=r.id,
            name=r.name or f"Реконструкция #{r.id}",
            mesh_url=svc.build_mesh_url(r),
            created_at=r.created_at,
        )
        for r in reconstructions
    ]


@router.get("/reconstructions/{id}", response_model=CalculateMeshResponse)
async def get_reconstruction_by_id(
    id: int = Path(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    reconstruction = await svc.get_reconstruction(id)
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=svc.get_status_display(reconstruction.status),
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by or 1,
        url=svc.build_mesh_url(reconstruction),
    )


@router.put("/reconstructions/{id}/save", response_model=CalculateMeshResponse)
async def save_reconstruction(
    id: int,
    request: SaveReconstructionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    reconstruction = await svc.save_reconstruction(id, request.name)
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=svc.get_status_display(reconstruction.status),
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by or 1,
        url=svc.build_mesh_url(reconstruction),
    )


@router.patch("/reconstructions/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def patch_reconstruction(
    id: int,
    request: PatchReconstructionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    pass


@router.delete("/reconstructions/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reconstruction(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    deleted = await svc.delete_reconstruction(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")


# === Vectorization Data ===

@router.get("/reconstructions/{id}/vectors", response_model=VectorizationResult)
async def get_vectorization_data(
    id: int = Path(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Retrieve vectorization data for reconstruction."""
    result = await svc.get_vectorization_data(id)
    if result is None:
        raise HTTPException(status_code=404, detail="Vectorization data not available")
    return result


@router.put("/reconstructions/{id}/vectors", response_model=dict)
async def update_vectorization_data(
    id: int,
    data: VectorizationResult,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Update vectorization data (from floor-editor)."""
    result = await svc.update_vectorization_data(id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")
    return {"message": "Vectorization data updated"}


# === Rooms ===

@router.get("/reconstructions/{id}/rooms", response_model=RoomsRequest)
async def get_rooms(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    return RoomsRequest(rooms=[])


@router.put("/reconstructions/{id}/rooms", status_code=status.HTTP_204_NO_CONTENT)
async def save_rooms(
    id: int,
    request: RoomsRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    pass
