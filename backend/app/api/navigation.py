"""
API routes for navigation and route building
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.models import RouteRequest, RouteResponse, RoutePoint

router = APIRouter(prefix="/navigation", tags=["Navigation"])
security = HTTPBearer()


@router.post("/route", response_model=RouteResponse)
async def build_route(
    request: RouteRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Построение оптимального маршрута
    
    Использует алгоритм A* для поиска кратчайшего пути
    между двумя точками на навигационном графе
    
    Формат точек: буква_корпуса + номер_помещения (например, A304)
    """
    # Валидация формата точек
    import re
    pattern = r"^[A-Za-z]\d{3}[A-Za-z]?$"
    
    if not re.match(pattern, request.start_point):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный формат начальной точки: {request.start_point}"
        )
    
    if not re.match(pattern, request.end_point):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный формат конечной точки: {request.end_point}"
        )
    
    # TODO: Вызвать сервис построения маршрута
    # route_service = RouteService()
    # result = await route_service.find_route(request.start_point, request.end_point)
    
    # Заглушка
    return RouteResponse(
        points=[
            RoutePoint(x=0.0, y=0.0, z=3),
            RoutePoint(x=10.0, y=0.0, z=3),
            RoutePoint(x=10.0, y=15.0, z=3),
        ],
        total_distance=25.0,
        estimated_time=0.5  # минут
    )


@router.get("/buildings/{building_id}/floors/{floor_id}/graph")
async def get_navigation_graph(
    building_id: int,
    floor_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Получить навигационный граф для этажа
    
    Возвращает вершины и рёбра графа для визуализации
    """
    # TODO: Получить граф из БД
    return {
        "vertices": [],
        "edges": []
    }
