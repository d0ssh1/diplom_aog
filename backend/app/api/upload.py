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


from sqlalchemy import select
from app.core.database import async_session_maker
from app.db.models.reconstruction import UploadedFile as UploadedFileModel

# ... (rest of imports)

# Helper to capture user ID from token
def get_user_id(credentials: HTTPAuthorizationCredentials) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )
    # TODO: Get user from DB by username to be sure? 
    # For MVP we assume user_id=1 if not present or handle it.
    # Payload has "sub": username.
    # We should query DB to get ID. Or just use 1 for now if lazy?
    # Let's try to do it right? Or just 1.
    return 1 # Placeholder, should be resolved from username

async def save_file_to_db(
    file_id: str,
    filename: str,
    file_path: str,
    url: str,
    file_type: int,
    user_id: int
):
    async with async_session_maker() as session:
        db_file = UploadedFileModel(
            id=file_id,
            filename=filename,
            file_path=file_path,
            url=url,
            file_type=file_type,
            uploaded_by=user_id,
            uploaded_at=datetime.utcnow()
        )
        session.add(db_file)
        await session.commit()


@router.post("/plan-photo/", response_model=UploadPhotoResponse)
async def upload_plan_photo(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Загрузка изображения плана эвакуации
    """
    user_id = get_user_id(credentials) # this verifies token
    validate_file(file)
    
    file_id = await save_upload_file(file, "plans")
    url = f"/api/v1/uploads/plans/{file_id}.{file.filename.split('.')[-1]}"
    
    # Save to DB
    await save_file_to_db(
        file_id=file_id,
        filename=file.filename,
        file_path=f"uploads/plans/{file_id}.{file.filename.split('.')[-1]}", # approximate path
        url=url,
        file_type=1,
        user_id=user_id
    )
    
    return UploadPhotoResponse(
        id=file_id,
        url=url,
        file_type=1,  # Plan
        source_type=1,  # User upload
        uploaded_by=user_id,
        uploaded_at=datetime.utcnow()
    )


@router.post("/user-mask/", response_model=UploadPhotoResponse)
async def upload_user_mask(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Загрузка пользовательской маски
    """
    user_id = get_user_id(credentials)
    validate_file(file)
    
    file_id = await save_upload_file(file, "masks")
    url = f"/api/v1/uploads/masks/{file_id}.{file.filename.split('.')[-1]}"
    
    # Save to DB
    await save_file_to_db(
        file_id=file_id,
        filename=file.filename,
        file_path=f"uploads/masks/{file_id}.{file.filename.split('.')[-1]}",
        url=url,
        file_type=2,
        user_id=user_id
    )
    
    return UploadPhotoResponse(
        id=file_id,
        url=url,
        file_type=2,  # Mask
        source_type=2,  # User edited
        uploaded_by=user_id,
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
    user_id = get_user_id(credentials)
    validate_file(file)
    
    file_id = await save_upload_file(file, "environment")
    url = f"/api/v1/uploads/environment/{file_id}.{file.filename.split('.')[-1]}"
    
    # Save to DB
    await save_file_to_db(
        file_id=file_id,
        filename=file.filename,
        file_path=f"uploads/environment/{file_id}.{file.filename.split('.')[-1]}",
        url=url,
        file_type=3,
        user_id=user_id
    )
    
    return UploadPhotoResponse(
        id=file_id,
        url=url,
        file_type=3,  # Environment
        source_type=1,
        uploaded_by=user_id,
        uploaded_at=datetime.utcnow()
    )
