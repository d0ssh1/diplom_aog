"""
API routes for reconstruction operations.
Thin router layer: validate → call service → return response.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response

from app.api.deps import (
    get_reconstruction_service,
    get_mask_service,
    get_nav_service,
)
from app.models import (
    BuildNavGraphRequest,
    BuildNavGraphResponse,
    CalculateHoughRequest,
    CalculateHoughResponse,
    CalculateMaskRequest,
    CalculateMaskResponse,
    CalculateMeshRequest,
    CalculateMeshResponse,
    FindRouteRequest,
    FindRouteResponse,
    MaskPreviewRequest,
    PatchReconstructionRequest,
    ReconstructionListItem,
    RoomsRequest,
    SaveReconstructionRequest,
)
from app.models.reconstruction_vectors import VectorizationResult as EditVectorizationResult
from app.models.domain import VectorizationResult as DomainVectorizationResult
from app.services.reconstruction_service import ReconstructionService
from app.services.mask_service import MaskService
from app.services.nav_service import NavService

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
    """Calculate initial mask from uploaded plan photo."""
    try:
        response = await svc.calculate_mask_endpoint(request)
        return response
    except Exception as e:
        logger.error("calculate_mask failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка обработки изображения")


@router.post("/mask-preview", response_model=None)
async def mask_preview(
    request: MaskPreviewRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: MaskService = Depends(get_mask_service),
):
    """Generate mask preview without saving to disk."""
    try:
        mask_bytes = await svc.preview_mask_endpoint(request)
        return Response(content=mask_bytes, media_type="image/png")
    except Exception as e:
        logger.error("mask_preview failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка генерации превью")


# === Hough Transform ===

@router.post("/houghs", response_model=CalculateHoughResponse)
async def calculate_hough_lines(
    request: CalculateHoughRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Calculate Hough lines (placeholder)."""
    return await svc.calculate_hough_placeholder(request)


# === 3D Reconstruction ===

@router.post("/reconstructions", response_model=CalculateMeshResponse)
async def calculate_mesh(
    request: CalculateMeshRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Build 3D mesh from plan and mask."""
    try:
        reconstruction = await svc.build_mesh(
            plan_file_id=request.plan_file_id,
            mask_file_id=request.user_mask_file_id,
            user_id=1,
            rotation_angle=request.rotation_angle,
            crop_rect=request.crop_rect.model_dump() if request.crop_rect else None,
            manual_rooms=request.rooms,
            manual_doors=request.doors,
        )
        # Re-fetch with joinedload so plan_file/mask_file are available
        reconstruction = await svc.get_reconstruction(reconstruction.id) or reconstruction
        vectorization = await svc.get_vectorization_data(reconstruction.id)
        return CalculateMeshResponse(
            id=reconstruction.id,
            name=reconstruction.name or "",
            status=reconstruction.status,
            status_display=svc.get_status_display(reconstruction.status),
            created_at=reconstruction.created_at,
            created_by=reconstruction.created_by,
            saved_at=None,  # Field doesn't exist in DB model
            url=svc.build_mesh_url(reconstruction),
            original_image_url=reconstruction.plan_file.url if getattr(reconstruction, "plan_file", None) else None,
            preview_url=reconstruction.mask_file.url if getattr(reconstruction, "mask_file", None) else None,
            mask_file_id=str(reconstruction.mask_file_id) if reconstruction.mask_file_id else None,
            crop_rect=vectorization.crop_rect if vectorization else None,
            rotation_angle=vectorization.rotation_angle if vectorization else 0,
            error_message=reconstruction.error_message,
        )
    except Exception as e:
        logger.error("build_mesh failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка построения 3D модели")


@router.get("/reconstructions", response_model=List[ReconstructionListItem])
async def get_reconstructions(
    is_saved: int = Query(1),
    building_id: Optional[str] = Query(None),
    floor_number: Optional[int] = Query(None),
    status: Optional[int] = Query(None),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """List saved reconstructions with optional filters."""
    reconstructions = await svc.get_saved_reconstructions()

    # Apply filters
    if building_id:
        reconstructions = [r for r in reconstructions if r.building_id == building_id]
    if floor_number is not None:
        reconstructions = [r for r in reconstructions if r.floor_number == floor_number]
    if status is not None:
        reconstructions = [r for r in reconstructions if r.status == status]

    import json
    results = []
    for r in reconstructions:
        rot = 0
        if r.vectorization_data:
            try:
                vd = json.loads(r.vectorization_data)
                rot = vd.get("rotation_angle", 0)
            except Exception:
                pass

        results.append(
            ReconstructionListItem(
                id=r.id,
                name=r.name or f"Реконструкция #{r.id}",
                building_id=r.building_id,
                floor_number=r.floor_number,
                preview_url=r.plan_file.url if getattr(r, "plan_file", None) else None,
                rooms_count=0,  # TODO: count from vectorization_data
                walls_count=0,  # TODO: count from vectorization_data
                created_at=r.created_at,
                rotation_angle=rot,
            )
        )
    return results


@router.get("/reconstructions/{id}", response_model=CalculateMeshResponse)
async def get_reconstruction_by_id(
    id: int = Path(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Get reconstruction by ID."""
    reconstruction = await svc.get_reconstruction(id)
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=svc.get_status_display(reconstruction.status),
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by,
        saved_at=None,  # Field doesn't exist in DB model
        url=svc.build_mesh_url(reconstruction),
        original_image_url=reconstruction.plan_file.url if getattr(reconstruction, "plan_file", None) else None,
        preview_url=reconstruction.mask_file.url if getattr(reconstruction, "mask_file", None) else None,
        mask_file_id=str(reconstruction.mask_file_id) if reconstruction.mask_file_id else None,
        error_message=reconstruction.error_message,
    )


@router.put("/reconstructions/{id}/save", response_model=CalculateMeshResponse)
async def save_reconstruction(
    id: int,
    request: SaveReconstructionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Save reconstruction with name, building_id, and floor_number."""
    reconstruction = await svc.save_reconstruction(
        id, request.name, request.building_id, request.floor_number
    )
    if not reconstruction:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")
    # Re-fetch with joinedload so plan_file/mask_file are available
    reconstruction = await svc.get_reconstruction(reconstruction.id) or reconstruction
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=svc.get_status_display(reconstruction.status),
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by,
        saved_at=None,  # Field doesn't exist in DB model
        url=svc.build_mesh_url(reconstruction),
        original_image_url=reconstruction.plan_file.url if getattr(reconstruction, "plan_file", None) else None,
        preview_url=reconstruction.mask_file.url if getattr(reconstruction, "mask_file", None) else None,
        mask_file_id=str(reconstruction.mask_file_id) if reconstruction.mask_file_id else None,
        error_message=reconstruction.error_message,
    )


@router.patch("/reconstructions/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def patch_reconstruction(
    id: int,
    request: PatchReconstructionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Patch reconstruction (not implemented)."""
    pass


@router.delete("/reconstructions/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reconstruction(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Delete reconstruction."""
    deleted = await svc.delete_reconstruction(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")


# === Vectorization Data ===

@router.get("/reconstructions/{id}/vectors", response_model=DomainVectorizationResult)
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
    data: EditVectorizationResult,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: ReconstructionService = Depends(get_reconstruction_service),
):
    """Update vectorization data (from floor-editor)."""
    success = await svc.update_vectorization_data(id, data)
    if not success:
        raise HTTPException(status_code=404, detail="Реконструкция не найдена")
    return {"message": "Vectorization data updated"}


# === Rooms ===

@router.get("/reconstructions/{id}/rooms", response_model=RoomsRequest)
async def get_rooms(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Get rooms for reconstruction."""
    return RoomsRequest(rooms=[])


@router.put("/reconstructions/{id}/rooms", status_code=status.HTTP_204_NO_CONTENT)
async def save_rooms(
    id: int,
    request: RoomsRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Save rooms for reconstruction."""
    pass


# === Nav Graph ===

@router.post("/nav-graph", response_model=BuildNavGraphResponse)
async def build_nav_graph(
    request: BuildNavGraphRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: NavService = Depends(get_nav_service),
):
    """Build navigation graph from mask and rooms."""
    try:
        response = await svc.build_graph_endpoint(request)
        return response
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("build_nav_graph failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка построения навигационного графа")


@router.get("/nav-graph/{graph_id}", response_model=dict)
async def get_nav_graph(
    graph_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: NavService = Depends(get_nav_service),
):
    """Get navigation graph data."""
    try:
        nav_data = svc.load_graph(graph_id)
        return nav_data
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/route", response_model=FindRouteResponse)
async def find_route_endpoint(
    request: FindRouteRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: NavService = Depends(get_nav_service),
):
    """Find route between two rooms."""
    result = await svc.find_route(
        graph_id=request.graph_id,
        from_room_id=request.from_room_id,
        to_room_id=request.to_room_id,
    )
    return FindRouteResponse(**result)
