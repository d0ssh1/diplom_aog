"""
Models module initialization
"""

try:
    from app.models.user import (
        LoginRequest,
        TokenResponse,
        RegisterRequest,
        UserBase,
        UserCreate,
        UserResponse,
        UserUpdate,
        SetPasswordRequest,
        ChangePasswordRequest,
        UpdateFlagRequest,
    )

    from app.models.reconstruction import (
        UploadPhotoResponse,
        CalculateMaskRequest,
        CalculateMaskResponse,
        CalculateHoughRequest,
        CalculateHoughResponse,
        CalculateMeshRequest,
        CalculateMeshResponse,
        SaveReconstructionRequest,
        ReconstructionListItem,
        PatchReconstructionRequest,
        RoomData,
        RoomsRequest,
        RouteRequest,
        RouteResponse,
        RoutePoint,
        ReconstructionStatus,
    )

    from app.models.building import (
        BuildingBase,
        BuildingCreate,
        BuildingResponse,
        FloorBase,
        FloorCreate,
        FloorResponse,
        Coordinate,
    )

    __all__ = [
        # User
        "LoginRequest",
        "TokenResponse",
        "RegisterRequest",
        "UserBase",
        "UserCreate",
        "UserResponse",
        "UserUpdate",
        "SetPasswordRequest",
        "ChangePasswordRequest",
        "UpdateFlagRequest",
        # Reconstruction
        "UploadPhotoResponse",
        "CalculateMaskRequest",
        "CalculateMaskResponse",
        "CalculateHoughRequest",
        "CalculateHoughResponse",
        "CalculateMeshRequest",
        "CalculateMeshResponse",
        "SaveReconstructionRequest",
        "ReconstructionListItem",
        "PatchReconstructionRequest",
        "RoomData",
        "RoomsRequest",
        "RouteRequest",
        "RouteResponse",
        "RoutePoint",
        "ReconstructionStatus",
        # Building
        "BuildingBase",
        "BuildingCreate",
        "BuildingResponse",
        "FloorBase",
        "FloorCreate",
        "FloorResponse",
        "Coordinate",
    ]
except ImportError:
    # Web stack not installed — processing-only environment
    __all__ = []
