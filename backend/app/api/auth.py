"""
API routes for authentication
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.models import (
    LoginRequest,
    TokenResponse,
    RegisterRequest,
    UserResponse,
    UserUpdate,
    SetPasswordRequest,
)
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_token,
)

router = APIRouter(prefix="/token", tags=["Authentication"])
security = HTTPBearer()


from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from app.core.database import async_session_maker
from app.db.models.user import User

@router.post("/login/", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Авторизация пользователя (OAuth2 standard)
    """
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.username == form_data.username))
        user = result.scalar_one_or_none()
        
        if not user or not verify_password(form_data.password, user.hashed_password):
            # Проверяем активность
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный логин или пароль",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        if not user.is_active:
             raise HTTPException(status_code=400, detail="Пользователь неактивен")

        token = create_access_token(data={"sub": user.username})
        return TokenResponse(auth_token=token)


@router.post("/logout/", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Выход из системы
    
    Инвалидирует токен (реализовать через blacklist)
    """
    # TODO: Добавить токен в blacklist
    return None


# === Users API ===

users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest):
    """
    Регистрация нового пользователя
    """
    if request.password != request.re_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароли не совпадают"
        )
    
    async with async_session_maker() as session:
        # 1. Проверяем существование пользователя
        result = await session.execute(select(User).where(User.username == request.username))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь с таким именем уже существует"
            )
            
        # 2. Создаём пользователя
        hashed_password = get_password_hash(request.password)
        new_user = User(
            username=request.username,
            email=request.email,
            hashed_password=hashed_password,
            is_active=True,
            is_staff=False,
            is_superuser=False
        )
        session.add(new_user)
        try:
            await session.commit()
            await session.refresh(new_user)
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка создания пользователя: {str(e)}"
            )

        return new_user


@users_router.get("/me/", response_model=UserResponse)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Получить данные текущего пользователя
    """
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )
    
    username = payload.get("sub")
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        
        if not user:
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Пользователь не найден"
            )
            
        return user


@users_router.put("/me/", response_model=UserResponse)
async def update_current_user(
    request: UserUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Обновить данные текущего пользователя
    """
    # TODO: Реализовать обновление
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Будет реализовано после настройки БД"
    )


@users_router.post("/set_password/", status_code=status.HTTP_204_NO_CONTENT)
async def set_password(
    request: SetPasswordRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Сменить пароль текущего пользователя
    """
    # TODO: Реализовать смену пароля
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Будет реализовано после настройки БД"
    )
