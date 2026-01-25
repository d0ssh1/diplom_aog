"""
API routes for reconstruction operations
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.models import (
    CalculateMaskRequest,
    CalculateMaskResponse,
    CalculateHoughRequest,
    CalculateHoughResponse,
    CalculateMeshRequest,
    CalculateMeshResponse,
    SaveReconstructionRequest,
    ReconstructionListItem,
    PatchReconstructionRequest,
    RoomsRequest,
    ReconstructionStatus,
)

router = APIRouter(prefix="/reconstruction", tags=["Reconstruction"])
security = HTTPBearer()


# === Mask Processing ===

@router.post("/initial-masks", response_model=CalculateMaskResponse)
async def calculate_initial_mask(
    request: CalculateMaskRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Автоматический расчёт маски стен
    
    Применяет бинаризацию методом Оцу к изображению плана
    для выделения структурных элементов (стен)
    """
    # Вызвать сервис обработки изображений
    from app.processing.mask_service import MaskService
    from app.core.img_logging import logger
    
    try:
        mask_service = MaskService()
        # Pass crop rect if provided
        crop_dict = None
        if request.crop:
            crop_dict = {
                'x': request.crop.x,
                'y': request.crop.y,
                'width': request.crop.width,
                'height': request.crop.height
            }
        filename = await mask_service.calculate_mask(
            request.file_id, 
            crop=crop_dict,
            rotation=request.rotation
        )
        
        return CalculateMaskResponse(
            id=request.file_id, # Маска имеет тот же ID, что и план (связь 1:1)
            source_upload_file_id=request.file_id,
            created_at=datetime.utcnow(),
            created_by=1,
            url=f"/api/v1/uploads/masks/{filename}"
        )
    except Exception as e:
        logger.error(f"Failed to calculate mask: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка обработки изображения: {str(e)}"
        )


# === Hough Transform ===

@router.post("/houghs", response_model=CalculateHoughResponse)
async def calculate_hough_lines(
    request: CalculateHoughRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Расчёт линий Хафа
    
    Выделяет прямые линии на маске для определения стен и границ
    """
    # TODO: Вызвать сервис обработки
    # hough_service = HoughService()
    # result = await hough_service.calculate(request.plan_file_id, request.user_mask_file_id)
    
    return CalculateHoughResponse(
        id="hough-placeholder-id",
        plan_upload_file_id=request.plan_file_id,
        user_mask_upload_file_id=request.user_mask_file_id,
        created_at=datetime.utcnow(),
        created_by=1,
        url="/uploads/hough/placeholder.png"
    )


# === 3D Reconstruction ===

@router.post("/reconstructions", response_model=CalculateMeshResponse)
async def calculate_mesh(
    request: CalculateMeshRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Построение 3D модели этажа
    
    Преобразует 2D контуры стен в 3D геометрию с учётом высоты этажа
    """
    from app.processing.reconstruction_service import reconstruction_service
    from app.core.security import decode_token
    
    # Get user from token
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )
    
    try:
        # Build mesh (this may take some time)
        reconstruction = await reconstruction_service.build_mesh(
            plan_file_id=request.plan_file_id,
            mask_file_id=request.user_mask_file_id,
            user_id=1  # TODO: get actual user ID from token
        )
        
        # Determine status display
        status_map = {
            1: ("created", "Создано"),
            2: ("processing", "Построение 3D модели..."),
            3: ("done", "Готово"),
            4: ("error", "Ошибка")
        }
        status_key, status_display = status_map.get(reconstruction.status, ("unknown", "Неизвестно"))
        
        # Build mesh URL
        mesh_url = None
        if reconstruction.mesh_file_id_glb:
            mesh_url = f"/api/v1/uploads/models/reconstruction_{reconstruction.id}.glb"
        
        print(f"[debug] CalculateMesh response: id={reconstruction.id} status={reconstruction.status}")
        return CalculateMeshResponse(
            id=reconstruction.id,
            name=reconstruction.name or "",
            status=reconstruction.status,
            status_display=status_display,
            created_at=reconstruction.created_at,
            created_by=reconstruction.created_by or 1,
            url=mesh_url
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка построения 3D модели: {str(e)}"
        )


@router.get("/reconstructions", response_model=List[ReconstructionListItem])
async def get_reconstructions(
    is_saved: int = Query(1, description="Фильтр по сохранённым"),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Получить список реконструкций
    """
    from app.processing.reconstruction_service import reconstruction_service
    
    reconstructions = await reconstruction_service.get_saved_reconstructions()
    
    result = []
    for r in reconstructions:
        mesh_url = None
        if r.mesh_file_id_glb:
            mesh_url = f"/api/v1/uploads/models/reconstruction_{r.id}.glb"
        
        result.append(ReconstructionListItem(
            id=r.id,
            name=r.name or f"Реконструкция #{r.id}",
            mesh_url=mesh_url,
            created_at=r.created_at
        ))
    
    return result


@router.get("/reconstructions/{id}", response_model=CalculateMeshResponse)
async def get_reconstruction_by_id(
    id: int = Path(..., description="ID реконструкции"),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Получить статус и данные реконструкции по ID
    
    Используется для polling статуса построения
    """
    from app.processing.reconstruction_service import reconstruction_service
    
    reconstruction = await reconstruction_service.get_reconstruction(id)
    if not reconstruction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Реконструкция не найдена"
        )
    
    status_map = {
        1: ("created", "Создано"),
        2: ("processing", "Построение 3D модели..."),
        3: ("done", "Готово"),
        4: ("error", "Ошибка")
    }
    status_key, status_display = status_map.get(reconstruction.status, ("unknown", "Неизвестно"))
    
    mesh_url = None
    if reconstruction.mesh_file_id_glb:
        mesh_url = f"/api/v1/uploads/models/reconstruction_{reconstruction.id}.glb"
    
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=status_display,
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by or 1,
        url=mesh_url
    )


@router.put("/reconstructions/{id}/save", response_model=CalculateMeshResponse)
async def save_reconstruction(
    id: int,
    request: SaveReconstructionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Сохранить реконструкцию с именем
    """
    from app.processing.reconstruction_service import reconstruction_service
    
    reconstruction = await reconstruction_service.save_reconstruction(id, request.name)
    if not reconstruction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Реконструкция не найдена"
        )
    
    status_map = {
        1: ("created", "Создано"),
        2: ("processing", "Построение 3D модели..."),
        3: ("done", "Готово"),
        4: ("error", "Ошибка")
    }
    status_key, status_display = status_map.get(reconstruction.status, ("unknown", "Неизвестно"))
    
    mesh_url = None
    if reconstruction.mesh_file_id_glb:
        mesh_url = f"/api/v1/uploads/models/reconstruction_{reconstruction.id}.glb"
    
    return CalculateMeshResponse(
        id=reconstruction.id,
        name=reconstruction.name or "",
        status=reconstruction.status,
        status_display=status_display,
        created_at=reconstruction.created_at,
        created_by=reconstruction.created_by or 1,
        url=mesh_url
    )


@router.patch("/reconstructions/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def patch_reconstruction(
    id: int,
    request: PatchReconstructionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Обновить имя реконструкции
    """
    # TODO: Обновить в БД
    pass


@router.delete("/reconstructions/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reconstruction(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Удалить реконструкцию
    """
    # TODO: Удалить из БД
    pass


# === Rooms ===

@router.get("/reconstructions/{id}/rooms", response_model=RoomsRequest)
async def get_rooms(
    id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Получить номера комнат для реконструкции
    """
    # TODO: Получить из БД
    return RoomsRequest(rooms=[])


@router.put("/reconstructions/{id}/rooms", status_code=status.HTTP_204_NO_CONTENT)
async def save_rooms(
    id: int,
    request: RoomsRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Сохранить номера комнат
    
    Формат номера: буква_корпуса + 3 цифры (например, A304)
    """
    # TODO: Сохранить в БД
    pass
