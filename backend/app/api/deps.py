from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.db.repositories.user_repository import UserRepository
from app.services.mask_service import MaskService
from app.services.reconstruction_service import ReconstructionService
from app.services.nav_service import NavService
from app.services.file_storage import FileStorage


async def get_reconstruction_repo(
    session: AsyncSession = Depends(get_db),
) -> ReconstructionRepository:
    return ReconstructionRepository(session)


async def get_user_repo(
    session: AsyncSession = Depends(get_db),
) -> UserRepository:
    return UserRepository(session)


async def get_mask_service(
    repo: ReconstructionRepository = Depends(get_reconstruction_repo),
) -> MaskService:
    return MaskService(upload_dir=str(settings.UPLOAD_DIR))


async def get_nav_service() -> NavService:
    """Dependency factory for NavService."""
    return NavService(upload_dir=str(settings.UPLOAD_DIR))


async def get_file_storage() -> FileStorage:
    """Dependency factory for FileStorage."""
    return FileStorage(upload_dir=str(settings.UPLOAD_DIR))


async def get_reconstruction_service(
    repo: ReconstructionRepository = Depends(get_reconstruction_repo),
    storage: FileStorage = Depends(get_file_storage),
) -> ReconstructionService:
    return ReconstructionService(
        repo=repo,
        storage=storage,
    )
