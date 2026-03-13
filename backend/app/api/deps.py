from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.services.mask_service import MaskService
from app.services.reconstruction_service import ReconstructionService


async def get_repo(
    session: AsyncSession = Depends(get_db),
) -> ReconstructionRepository:
    return ReconstructionRepository(session)


async def get_mask_service(
    repo: ReconstructionRepository = Depends(get_repo),
) -> MaskService:
    return MaskService(upload_dir=str(settings.UPLOAD_DIR))


async def get_reconstruction_service(
    repo: ReconstructionRepository = Depends(get_repo),
) -> ReconstructionService:
    return ReconstructionService(
        repo=repo,
        upload_dir=str(settings.UPLOAD_DIR),
    )
