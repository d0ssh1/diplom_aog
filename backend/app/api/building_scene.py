"""API route for the stacked 3D building viewer (subfeature B).

Thin router for the single read endpoint: validate path → call ``BuildingSceneService`` →
return the response model. The only domain error this read raises is
``BuildingNotFoundError`` (→ 404); per-floor "no mesh" / "unsolved" are NORMAL 200 body
states (``has_mesh:false`` / ``placement:null``), not HTTP errors (../02 error table).

``prefix=""`` (the ``/api/v1`` prefix is applied where this router is included), mirroring
``api/building_assembly.py``.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.deps import get_building_scene_service
from app.core.exceptions import BuildingNotFoundError
from app.models.building_scene import BuildingScene3DResponse
from app.services.building_scene_service import BuildingSceneService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="", tags=["building-scene"])
security = HTTPBearer()


@router.get(
    "/buildings/{building_id}/scene-3d",
    response_model=BuildingScene3DResponse,
)
async def get_scene_3d(
    building_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    svc: BuildingSceneService = Depends(get_building_scene_service),
) -> BuildingScene3DResponse:
    """Return every floor with its GLB mesh URL + 3D placement (building world frame).

    404 building missing. A floor with ``has_mesh:false`` or ``placement:null`` is a
    normal body state the viewer handles, not an error.
    """
    try:
        return await svc.get_scene_3d(building_id)
    except BuildingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
