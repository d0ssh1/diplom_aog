"""
API Router initialization - combines all route modules
"""

from fastapi import APIRouter

from app.api.auth import router as auth_router, users_router
from app.api.upload import router as upload_router
from app.api.reconstruction import router as reconstruction_router
from app.api.navigation import router as navigation_router

# Main API router
router = APIRouter()

# Include all sub-routers
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(upload_router)
router.include_router(reconstruction_router)
router.include_router(navigation_router)


# Common info endpoint
@router.get("/common/info", tags=["Common"])
async def get_info():
    """
    Информация о сервере
    
    Используется для проверки доступности API
    """
    return {
        "name": "Diplom3D API",
        "version": "0.1.0",
        "status": "online"
    }
