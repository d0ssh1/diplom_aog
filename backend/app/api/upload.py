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
from app.core.security import decode_token
from app.api.deps import get_repo
from app.db.repositories.reconstruction_repo import ReconstructionRepository

router = APIRouter(prefix="/upload", tags=["Upload"])
security = HTTPBearer()


def validate_file(file: UploadFile) -> None:
    """Валидация загружаемого файла"""
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


def get_user_id(credentials: HTTPAuthorizationCredentials) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )
    return 1  # Placeholder, should be resolved from username


@router.post("/plan-photo/", response_model=UploadPhotoResponse)
async def upload_plan_photo(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    repo: ReconstructionRepository = Depends(get_repo),
):
    """
    Загрузка изображения плана эвакуации
    """
    user_id = get_user_id(credentials)
    validate_file(file)

    file_id = await save_upload_file(file, "plans")
    ext = file.filename.split('.')[-1] if file.filename else "jpg"
    url = f"/api/v1/uploads/plans/{file_id}.{ext}"

    await repo.create_uploaded_file(
        file_id=file_id,
        filename=file.filename or f"{file_id}.{ext}",
        file_path=f"uploads/plans/{file_id}.{ext}",
        url=url,
        file_type=1,
        user_id=user_id,
    )

    return UploadPhotoResponse(
        id=file_id,
        url=url,
        file_type=1,
        source_type=1,
        uploaded_by=user_id,
        uploaded_at=datetime.utcnow()
    )


@router.post("/user-mask/", response_model=UploadPhotoResponse)
async def upload_user_mask(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    repo: ReconstructionRepository = Depends(get_repo),
):
    """
    Загрузка пользовательской маски
    """
    user_id = get_user_id(credentials)
    validate_file(file)

    file_id = await save_upload_file(file, "masks")
    ext = file.filename.split('.')[-1] if file.filename else "jpg"
    url = f"/api/v1/uploads/masks/{file_id}.{ext}"

    await repo.create_uploaded_file(
        file_id=file_id,
        filename=file.filename or f"{file_id}.{ext}",
        file_path=f"uploads/masks/{file_id}.{ext}",
        url=url,
        file_type=2,
        user_id=user_id,
    )

    return UploadPhotoResponse(
        id=file_id,
        url=url,
        file_type=2,
        source_type=2,
        uploaded_by=user_id,
        uploaded_at=datetime.utcnow()
    )


@router.post("/user-environment-photo/", response_model=UploadPhotoResponse)
async def upload_environment_photo(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    repo: ReconstructionRepository = Depends(get_repo),
):
    """
    Загрузка фото окружения для идентификации позиции
    """
    user_id = get_user_id(credentials)
    validate_file(file)

    file_id = await save_upload_file(file, "environment")
    ext = file.filename.split('.')[-1] if file.filename else "jpg"
    url = f"/api/v1/uploads/environment/{file_id}.{ext}"

    await repo.create_uploaded_file(
        file_id=file_id,
        filename=file.filename or f"{file_id}.{ext}",
        file_path=f"uploads/environment/{file_id}.{ext}",
        url=url,
        file_type=3,
        user_id=user_id,
    )

    return UploadPhotoResponse(
        id=file_id,
        url=url,
        file_type=3,
        source_type=1,
        uploaded_by=user_id,
        uploaded_at=datetime.utcnow()
    )
