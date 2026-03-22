"""
API routes for authentication
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from sqlalchemy import select

from app.models import (
    TokenResponse,
    RegisterRequest,
    UserResponse,
    UserUpdate,
    SetPasswordRequest,
    ForgotPasswordRequest,
)
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_token,
)
from app.core.database import async_session_maker
from app.db.models.user import User

router = APIRouter(prefix="/token", tags=["Authentication"])
security = HTTPBearer()


@router.post("/login/", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Авторизация пользователя (OAuth2 standard)
    """
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.username == form_data.username))
        user = result.scalar_one_or_none()

        if not user or not verify_password(form_data.password, user.hashed_password):
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


@router.post("/forgot-password/")
async def forgot_password(request: ForgotPasswordRequest):
    """
    Запрос на сброс пароля.

    Принимает email, проверяет существование пользователя.
    Всегда возвращает успех (чтобы не раскрывать существование аккаунтов).
    В production: здесь отправка email со ссылкой для сброса.
    """
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).where(User.email == request.email)
        )
        user = result.scalar_one_or_none()

        # Логируем для отладки, но клиенту всегда возвращаем одинаковый ответ
        if user:
            # TODO: Отправка email с токеном сброса пароля
            pass

    msg = "Если аккаунт с указанным email существует, инструкции отправлены на почту"
    return {"detail": msg}


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
            full_name=request.full_name,
            hashed_password=hashed_password,
            is_active=False,
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


@users_router.get("/pending/", response_model=list[UserResponse])
async def get_pending_users(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Получить список пользователей, ожидающих подтверждения (is_active=False)
    Доступно администраторам и пользователям с can_approve_users=True
    """
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )

    username = payload.get("sub")
    async with async_session_maker() as session:
        # Проверяем права администратора или can_approve_users
        result = await session.execute(select(User).where(User.username == username))
        current_user = result.scalar_one_or_none()

        if not current_user or not (current_user.is_superuser or current_user.can_approve_users):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав"
            )

        # Получаем неактивных пользователей
        result = await session.execute(
            select(User).where(User.is_active.is_(False)).order_by(User.date_joined.desc())
        )
        pending_users = result.scalars().all()

        return pending_users


@users_router.post("/{user_id}/approve/", response_model=UserResponse)
async def approve_user(
    user_id: int,
    can_approve_users: bool = False,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Подтвердить регистрацию пользователя (установить is_active=True)
    Опционально дать право подтверждать других пользователей
    Доступно только администраторам и пользователям с can_approve_users=True
    """
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )

    username = payload.get("sub")
    async with async_session_maker() as session:
        # Проверяем права администратора или can_approve_users
        result = await session.execute(select(User).where(User.username == username))
        current_user = result.scalar_one_or_none()

        if not current_user or not (current_user.is_superuser or current_user.can_approve_users):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав"
            )

        # Находим пользователя для подтверждения
        result = await session.execute(select(User).where(User.id == user_id))
        user_to_approve = result.scalar_one_or_none()

        if not user_to_approve:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден"
            )

        # Активируем пользователя
        user_to_approve.is_active = True
        user_to_approve.can_approve_users = can_approve_users

        try:
            await session.commit()
            await session.refresh(user_to_approve)
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка подтверждения пользователя: {str(e)}"
            )

        return user_to_approve


@users_router.post("/{user_id}/reject/", status_code=status.HTTP_200_OK)
async def reject_user(
    user_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Отклонить заявку пользователя (удалить из БД)
    Доступно администраторам и пользователям с can_approve_users=True
    """
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен"
        )

    username = payload.get("sub")
    async with async_session_maker() as session:
        # Проверяем права администратора или can_approve_users
        result = await session.execute(select(User).where(User.username == username))
        current_user = result.scalar_one_or_none()

        if not current_user or not (current_user.is_superuser or current_user.can_approve_users):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав"
            )

        # Находим пользователя для отклонения
        result = await session.execute(select(User).where(User.id == user_id))
        user_to_reject = result.scalar_one_or_none()

        if not user_to_reject:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден"
            )

        # Удаляем пользователя
        await session.delete(user_to_reject)

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка отклонения заявки: {str(e)}"
            )

        return {"status": "rejected", "user_id": user_id}
