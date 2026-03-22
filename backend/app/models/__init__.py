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
        ForgotPasswordRequest,
        UpdateFlagRequest,
    )

    from app.models.reconstruction import (
        UploadPhotoResponse,
        CalculateMaskRequest,
        CalculateMaskResponse,
        MaskPreviewRequest,
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
        BuildNavGraphRequest,
        BuildNavGraphResponse,
        FindRouteRequest,
        FindRouteResponse,
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
        "ForgotPasswordRequest",
        "UpdateFlagRequest",
        # Reconstruction
        "UploadPhotoResponse",
        "CalculateMaskRequest",
        "CalculateMaskResponse",
        "MaskPreviewRequest",
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
        "BuildNavGraphRequest",
        "BuildNavGraphResponse",
        "FindRouteRequest",
        "FindRouteResponse",
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
