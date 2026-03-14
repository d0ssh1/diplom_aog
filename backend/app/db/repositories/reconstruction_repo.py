import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.reconstruction import Reconstruction, UploadedFile

logger = logging.getLogger(__name__)


class ReconstructionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_uploaded_file(
        self,
        file_id: str,
        filename: str,
        file_path: str,
        url: str,
        file_type: int,
        user_id: int,
    ) -> UploadedFile:
        """INSERT в uploaded_files."""
        logger.debug(
            "create_uploaded_file: file_id=%s, filename=%s, file_type=%d",
            file_id,
            filename,
            file_type,
        )
        db_file = UploadedFile(
            id=file_id,
            filename=filename,
            file_path=file_path,
            url=url,
            file_type=file_type,
            uploaded_by=user_id,
            uploaded_at=datetime.utcnow(),
        )
        self._session.add(db_file)
        await self._session.commit()
        await self._session.refresh(db_file)
        return db_file

    async def create_reconstruction(
        self,
        plan_file_id: str,
        mask_file_id: str,
        user_id: int,
        status: int = 2,
    ) -> Reconstruction:
        """INSERT в reconstructions, status=2 (processing)."""
        logger.debug(
            "create_reconstruction: plan=%s, mask=%s, user=%d",
            plan_file_id,
            mask_file_id,
            user_id,
        )
        reconstruction = Reconstruction(
            plan_file_id=plan_file_id,
            mask_file_id=mask_file_id,
            status=status,
            created_by=user_id,
            created_at=datetime.utcnow(),
        )
        self._session.add(reconstruction)
        await self._session.commit()
        await self._session.refresh(reconstruction)
        return reconstruction

    async def get_by_id(self, reconstruction_id: int) -> Optional[Reconstruction]:
        """SELECT by PK. Returns None if not found."""
        logger.debug("get_by_id: reconstruction_id=%d", reconstruction_id)
        result = await self._session.execute(
            select(Reconstruction).where(Reconstruction.id == reconstruction_id)
        )
        return result.scalar_one_or_none()

    async def update_mesh(
        self,
        reconstruction_id: int,
        obj_path: Optional[str],
        glb_path: Optional[str],
        status: int,
        error_message: Optional[str] = None,
    ) -> Optional[Reconstruction]:
        """UPDATE mesh_file_id_obj, mesh_file_id_glb, status, error_message."""
        logger.debug(
            "update_mesh: reconstruction_id=%d, status=%d", reconstruction_id, status
        )
        reconstruction = await self._session.get(Reconstruction, reconstruction_id)
        if not reconstruction:
            return None
        reconstruction.mesh_file_id_obj = obj_path
        reconstruction.mesh_file_id_glb = glb_path
        reconstruction.status = status
        reconstruction.error_message = error_message
        await self._session.commit()
        await self._session.refresh(reconstruction)
        return reconstruction

    async def update_name(
        self,
        reconstruction_id: int,
        name: str,
    ) -> Optional[Reconstruction]:
        """UPDATE name. Returns None if not found."""
        logger.debug(
            "update_name: reconstruction_id=%d, name=%s", reconstruction_id, name
        )
        reconstruction = await self._session.get(Reconstruction, reconstruction_id)
        if not reconstruction:
            return None
        reconstruction.name = name
        await self._session.commit()
        await self._session.refresh(reconstruction)
        return reconstruction

    async def get_saved(
        self,
        user_id: Optional[int] = None,
    ) -> list[Reconstruction]:
        """SELECT WHERE name IS NOT NULL ORDER BY created_at DESC."""
        logger.debug("get_saved: user_id=%s", user_id)
        query = (
            select(Reconstruction)
            .where(Reconstruction.name.isnot(None))
            .order_by(Reconstruction.created_at.desc())
        )
        if user_id is not None:
            query = query.where(Reconstruction.created_by == user_id)
        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def delete(self, reconstruction_id: int) -> bool:
        """DELETE. Returns True if deleted, False if not found."""
        logger.debug("delete: reconstruction_id=%d", reconstruction_id)
        reconstruction = await self._session.get(Reconstruction, reconstruction_id)
        if not reconstruction:
            return False
        await self._session.delete(reconstruction)
        await self._session.commit()
        return True

    async def update_vectorization_data(
        self,
        reconstruction_id: int,
        vectorization_json: str,
    ) -> Optional[Reconstruction]:
        """UPDATE vectorization_data field. Returns None if not found."""
        logger.debug("update_vectorization_data: reconstruction_id=%d", reconstruction_id)
        reconstruction = await self._session.get(Reconstruction, reconstruction_id)
        if not reconstruction:
            return None
        reconstruction.vectorization_data = vectorization_json
        reconstruction.updated_at = datetime.utcnow()
        await self._session.commit()
        await self._session.refresh(reconstruction)
        return reconstruction
