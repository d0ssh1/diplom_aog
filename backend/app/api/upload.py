"""
API routes for file uploads
"""

import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.models import UploadPhotoResponse
from app.core.config import settings

router = APIRouter(prefix="/upload", tags=["Upload"])
security = HTTPBearer()


def validate_file(file: UploadFile) -> None:
    """Валидация загружаемого файла"""
    # Проверка расширения
    ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недопустимый формат файла. Разрешены: {settings.ALLOWED_EXTENSIONS}"
        )


async def save_upload_file(file: UploadFile, subfolder: str = "") -> str:
    """Сохранение загруженного файла"""
    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if file.filename else "jpg"
    
    upload_dir = os.path.join(settings.UPLOAD_DIR, subfolder)
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, f"{file_id}.{ext}")
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    return file_id


@router.post("/plan-photo/", response_model=UploadPhotoResponse)
async def upload_plan_photo(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Загрузка изображения плана эвакуации
    
    Принимает файлы форматов PNG, JPG
    Максимальный размер: 50 MB
    Минимальное разрешение: 1000x1000 пикселей
    """
    validate_file(file)
    
    file_id = await save_upload_file(file, "plans")
    
    return UploadPhotoResponse(
        id=file_id,
        url=f"/api/v1/uploads/plans/{file_id}.{file.filename.split('.')[-1]}",
        file_type=1,  # Plan
        source_type=1,  # User upload
        uploaded_by=1,  # TODO: получать из токена
        uploaded_at=datetime.utcnow()
    )


@router.post("/user-mask/", response_model=UploadPhotoResponse)
async def upload_user_mask(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Загрузка пользовательской маски
    
    Маска - черно-белое изображение, где белый = стены
    """
    validate_file(file)
    
    file_id = await save_upload_file(file, "masks")
    
    return UploadPhotoResponse(
        id=file_id,
        url=f"/api/v1/uploads/masks/{file_id}.{file.filename.split('.')[-1]}",
        file_type=2,  # Mask
        source_type=2,  # User edited
        uploaded_by=1,
        uploaded_at=datetime.utcnow()
    )


@router.post("/user-environment-photo/", response_model=UploadPhotoResponse)
async def upload_environment_photo(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Загрузка фото окружения для идентификации позиции
    """
    validate_file(file)
    
    file_id = await save_upload_file(file, "environment")
    
    return UploadPhotoResponse(
        id=file_id,
        url=f"/api/v1/uploads/environment/{file_id}.{file.filename.split('.')[-1]}",
        file_type=3,  # Environment
        source_type=1,
        uploaded_by=1,
        uploaded_at=datetime.utcnow()
    )
