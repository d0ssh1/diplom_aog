"""
Reconstruction Service - orchestrates 3D reconstruction workflow

Handles:
1. Loading mask images
2. Calling mesh generator
3. Saving to database
"""

import os
import uuid
from datetime import datetime
from typing import Optional
import cv2

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_maker
from app.db.models.reconstruction import Reconstruction
from app.processing.mesh_generator import MeshGeneratorService, MeshExportResult


class ReconstructionService:
    """Service for orchestrating 3D reconstruction"""
    
    def __init__(self):
        self.mesh_generator = MeshGeneratorService(
            output_dir=os.path.join(settings.UPLOAD_DIR, "models"),
            default_floor_height=settings.DEFAULT_FLOOR_HEIGHT
        )
    
    async def build_mesh(
        self,
        plan_file_id: str,
        mask_file_id: str,
        user_id: int
    ) -> Reconstruction:
        """
        Build 3D mesh from mask and save to database
        
        Args:
            plan_file_id: ID of plan image
            mask_file_id: ID of mask image  
            user_id: ID of current user
            
        Returns:
            Reconstruction database object
        """
        print(f"[build_mesh] Starting build: plan={plan_file_id}, mask={mask_file_id}")
        
        async with async_session_maker() as session:
            # NOTE: Masks are saved directly to disk, not in DB.
            # We skip DB lookup and use file system directly.
            
            # Create reconstruction record
            reconstruction = Reconstruction(
                plan_file_id=plan_file_id,
                mask_file_id=mask_file_id,
                status=2,  # Processing
                created_by=user_id,
                created_at=datetime.utcnow()
            )
            session.add(reconstruction)
            await session.commit()
            await session.refresh(reconstruction)
            
            reconstruction_id = reconstruction.id
            print(f"[build_mesh] Created reconstruction record: id={reconstruction_id}")
        
        # Generate mesh (sync operation - blocking)
        try:
            result = self._generate_mesh_sync(mask_file_id, reconstruction_id)
            
            # Update reconstruction with result
            async with async_session_maker() as session:
                reconstruction = await session.get(Reconstruction, reconstruction_id)
                if result:
                    reconstruction.mesh_file_id_obj = result.obj_path
                    reconstruction.mesh_file_id_glb = result.glb_path
                    reconstruction.status = 3  # Done
                else:
                    reconstruction.status = 4  # Error
                    reconstruction.error_message = "Failed to generate mesh"
                
                await session.commit()
                await session.refresh(reconstruction)
                return reconstruction
                
        except Exception as e:
            async with async_session_maker() as session:
                reconstruction = await session.get(Reconstruction, reconstruction_id)
                reconstruction.status = 4  # Error
                reconstruction.error_message = str(e)
                await session.commit()
                await session.refresh(reconstruction)
                return reconstruction
    
    def _generate_mesh_sync(
        self, 
        mask_file_id: str, 
        reconstruction_id: int
    ) -> Optional[MeshExportResult]:
        """Synchronous mesh generation"""
        import glob
        
        # Try multiple possible mask file locations
        possible_paths = [
            os.path.join(settings.UPLOAD_DIR, "masks", f"{mask_file_id}.png"),
            os.path.join(settings.UPLOAD_DIR, "masks", f"{mask_file_id}.jpg"),
            os.path.join(settings.UPLOAD_DIR, "masks", f"{mask_file_id}.jpeg"),
        ]
        
        # Also try glob pattern in case of different naming
        glob_pattern = os.path.join(settings.UPLOAD_DIR, "masks", f"{mask_file_id}.*")
        glob_matches = glob.glob(glob_pattern)
        possible_paths.extend(glob_matches)
        
        mask_path = None
        for path in possible_paths:
            if os.path.exists(path):
                mask_path = path
                break
        
        if not mask_path:
            print(f"Mask file not found. Tried: {possible_paths}")
            print(f"Available masks: {os.listdir(os.path.join(settings.UPLOAD_DIR, 'masks'))}")
            return None
        
        print(f"Loading mask from: {mask_path}")
        
        # Load mask image
        mask_image = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask_image is None:
            print(f"Failed to load mask: {mask_path}")
            return None
        
        print(f"Mask loaded successfully. Shape: {mask_image.shape}")
        
        # Generate mesh
        result = self.mesh_generator.process_plan_image(
            mask_image,
            name=f"reconstruction_{reconstruction_id}",
            floor_number=1
        )
        
        return result
    
    async def save_reconstruction(
        self,
        reconstruction_id: int,
        name: str
    ) -> Optional[Reconstruction]:
        """Save reconstruction with a name"""
        async with async_session_maker() as session:
            reconstruction = await session.get(Reconstruction, reconstruction_id)
            if not reconstruction:
                return None
            
            reconstruction.name = name
            await session.commit()
            await session.refresh(reconstruction)
            return reconstruction
    
    async def get_reconstruction(
        self,
        reconstruction_id: int
    ) -> Optional[Reconstruction]:
        """Get reconstruction by ID"""
        async with async_session_maker() as session:
            return await session.get(Reconstruction, reconstruction_id)
    
    async def get_saved_reconstructions(
        self,
        user_id: Optional[int] = None
    ) -> list:
        """Get all saved reconstructions"""
        async with async_session_maker() as session:
            query = select(Reconstruction).where(Reconstruction.name.isnot(None))
            if user_id:
                query = query.where(Reconstruction.created_by == user_id)
            query = query.order_by(Reconstruction.created_at.desc())
            
            result = await session.execute(query)
            return result.scalars().all()
    
    async def delete_reconstruction(self, reconstruction_id: int) -> bool:
        """Delete a reconstruction"""
        async with async_session_maker() as session:
            reconstruction = await session.get(Reconstruction, reconstruction_id)
            if not reconstruction:
                return False
            
            await session.delete(reconstruction)
            await session.commit()
            return True


# Singleton instance
reconstruction_service = ReconstructionService()
