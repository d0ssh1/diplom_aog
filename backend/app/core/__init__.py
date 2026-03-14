"""
Core module initialization
"""

try:
    from app.core.config import settings
    from app.core.security import (
        verify_password,
        get_password_hash,
        create_access_token,
        decode_token,
    )

    __all__ = [
        "settings",
        "verify_password",
        "get_password_hash",
        "create_access_token",
        "decode_token",
    ]
except ImportError:
    # Web stack (jose, fastapi, etc.) not installed — processing-only environment
    __all__ = []
