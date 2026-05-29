from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.invite_token import InviteToken
from app.models.user import User
from app.schemas.user import ChangePasswordRequest, UserLogin, UserRead, UserRegister
from app.services.auth import (
    DUMMY_PASSWORD_HASH,
    GITHUB_OAUTH_STATE_COOKIE_NAME,
    GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
    SESSION_COOKIE_NAME,
    SESSION_LIFETIME_DAYS,
    create_jwt,
    encrypt_github_access_token,
    exchange_code_for_token,
    generate_github_oauth_state,
    get_current_user,
    get_github_oauth_url,
    get_github_user,
    hash_password_async,
    verify_password_async,
)

limiter = Limiter(key_func=get_remote_address)
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
GITHUB_OAUTH_RETURN_TO_COOKIE_NAME = "github_oauth_return_to"
DEFAULT_GITHUB_REDIRECT_PATH = "/tasks"


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_LIFETIME_DAYS * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def set_github_oauth_state_cookie(response: Response, state: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=GITHUB_OAUTH_STATE_COOKIE_NAME,
        value=state,
        max_age=GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def clear_github_oauth_state_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=GITHUB_OAUTH_STATE_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def set_github_oauth_return_to_cookie(response: Response, redirect_url: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=GITHUB_OAUTH_RETURN_TO_COOKIE_NAME,
        value=redirect_url,
        max_age=GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def clear_github_oauth_return_to_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=GITHUB_OAUTH_RETURN_TO_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def to_user_read(user: User) -> UserRead:
    return UserRead.model_validate(user)


def is_safe_return_path(path: str | None) -> bool:
    if not path:
        return False
    return path.startswith("/") and not path.startswith("//")


def get_frontend_origin(request: Request) -> str:
    settings = get_settings()
    referer = request.headers.get("referer")
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    origin = request.headers.get("origin")
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    return settings.frontend_base_url.rstrip("/")


def build_frontend_redirect_url(request: Request, return_to: str | None = None) -> str:
    referer = request.headers.get("referer")
    referer_path = None
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            referer_path = parsed.path or DEFAULT_GITHUB_REDIRECT_PATH
            if parsed.query:
                referer_path = f"{referer_path}?{parsed.query}"

    target_path = (
        return_to
        if is_safe_return_path(return_to)
        else referer_path or DEFAULT_GITHUB_REDIRECT_PATH
    )
    return f"{get_frontend_origin(request)}{target_path}"


def append_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    query.append((key, value))
    return urlunparse(parsed._replace(query=urlencode(query)))


def build_github_callback_redirect(
    request: Request,
    key: str,
    value: str,
) -> str:
    redirect_url = request.cookies.get(GITHUB_OAUTH_RETURN_TO_COOKIE_NAME)
    if not redirect_url:
        redirect_url = build_frontend_redirect_url(request)
    return append_query_param(redirect_url, key, value)


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация",
    description=(
        "Создаёт нового пользователя и устанавливает `session` cookie (httponly). "
        "Лимит: 10 запросов/мин с одного IP."
    ),
    responses={
        201: {"description": "Пользователь создан, cookie установлен"},
        400: {"description": "Email уже занят"},
        429: {"description": "Превышен лимит запросов"},
    },
)
@limiter.limit("10/minute")
async def register(
    request: Request,
    payload: UserRegister,
    response: Response,
    session: DbSession,
) -> UserRead:
    existing_user = await session.scalar(select(User).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Registration is invite-only: a valid token is always required
    if not payload.invite_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite token required",
        )
    now = datetime.now(timezone.utc)
    invite_record = await session.scalar(
        select(InviteToken).where(
            InviteToken.token == payload.invite_token,
            InviteToken.used_by_id.is_(None),
            (InviteToken.expires_at.is_(None)) | (InviteToken.expires_at > now),
        )
    )
    if invite_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invite token",
        )

    user = User(
        email=payload.email,
        password_hash=await hash_password_async(payload.password),
        display_name=payload.display_name,
        invite_token_id=invite_record.id,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        ) from exc

    invite_record.used_by_id = user.id

    await session.commit()
    await session.refresh(user)

    set_session_cookie(response, create_jwt(user.id, user.token_version))
    logger.info("user_registered", extra={"user_id": str(user.id)})
    return to_user_read(user)


@router.post(
    "/login",
    response_model=UserRead,
    summary="Вход",
    description=(
        "Аутентификация по email/паролю. Устанавливает `session` cookie (httponly, 30 дней). "
        "Лимит: 10 запросов/мин с одного IP."
    ),
    responses={
        200: {"description": "Успешный вход, cookie установлен"},
        401: {"description": "Неверный email или пароль"},
        429: {"description": "Превышен лимит запросов"},
    },
)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: UserLogin,
    response: Response,
    session: DbSession,
) -> UserRead:
    user = await session.scalar(select(User).where(User.email == payload.email))
    if user is None:
        await verify_password_async(payload.password, DUMMY_PASSWORD_HASH)
        logger.info("login_failed", extra={"reason": "user_not_found"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not await verify_password_async(payload.password, user.password_hash):
        logger.info("login_failed", extra={"reason": "wrong_password", "user_id": str(user.id)})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(user)

    set_session_cookie(response, create_jwt(user.id, user.token_version))
    logger.info("login_success", extra={"user_id": str(user.id)})
    return to_user_read(user)


@router.get(
    "/me",
    response_model=UserRead,
    summary="Текущий пользователь",
    description=(
        "Возвращает данные авторизованного пользователя. "
        "`github_linked=true` означает привязанный GitHub-аккаунт."
    ),
    responses={
        200: {"description": "Данные пользователя"},
        401: {"description": "Нет валидного session cookie"},
    },
)
async def me(current_user: CurrentUser) -> UserRead:
    return to_user_read(current_user)


@router.get(
    "/github/connect",
    summary="Начать привязку GitHub",
    description=(
        "Редирект на GitHub OAuth (scope: `repo`). "
        "CSRF-токен сохраняется в httponly cookie на 5 минут."
    ),
    responses={
        302: {"description": "Редирект на github.com/login/oauth/authorize"},
        401: {"description": "Нет активной сессии"},
    },
)
async def github_connect(
    request: Request,
    current_user: CurrentUser,
    return_to: str | None = None,
    reconnect: bool = False,
) -> RedirectResponse:
    redirect_url = build_frontend_redirect_url(request, return_to)
    if current_user.github_linked and not reconnect:
        response = RedirectResponse(
            url=append_query_param(redirect_url, "github_linked", "1"),
            status_code=status.HTTP_302_FOUND,
        )
        clear_github_oauth_state_cookie(response)
        clear_github_oauth_return_to_cookie(response)
        return response

    state = generate_github_oauth_state()
    response = RedirectResponse(url=get_github_oauth_url(state), status_code=status.HTTP_302_FOUND)
    set_github_oauth_state_cookie(response, state)
    set_github_oauth_return_to_cookie(response, redirect_url)
    return response


@router.get(
    "/github/callback",
    summary="GitHub OAuth callback",
    description=(
        "Обрабатывает callback от GitHub: обменивает `code` на токен, сохраняет GitHub-профиль "
        "пользователя (зашифрованный токен). Редиректит на `/settings`."
    ),
    responses={
        302: {"description": "Успешная привязка, редирект на /settings"},
        400: {"description": "Неверный CSRF state"},
        401: {"description": "Нет активной сессии"},
        409: {"description": "GitHub-аккаунт уже привязан к другому пользователю"},
    },
)
async def github_callback(
    state: str,
    session: DbSession,
    current_user: CurrentUser,
    request: Request,
    code: str | None = None,
    error: str | None = None,
) -> Response:
    if error:
        response = RedirectResponse(
            url=build_github_callback_redirect(request, "github_error", error),
            status_code=status.HTTP_302_FOUND,
        )
        clear_github_oauth_state_cookie(response)
        clear_github_oauth_return_to_cookie(response)
        return response

    if not code:
        response = RedirectResponse(
            url=build_github_callback_redirect(request, "github_error", "missing_code"),
            status_code=status.HTTP_302_FOUND,
        )
        clear_github_oauth_state_cookie(response)
        clear_github_oauth_return_to_cookie(response)
        return response

    github_oauth_state = request.cookies.get(GITHUB_OAUTH_STATE_COOKIE_NAME)
    if not github_oauth_state or github_oauth_state != state:
        response = RedirectResponse(
            url=build_github_callback_redirect(request, "github_error", "invalid_state"),
            status_code=status.HTTP_302_FOUND,
        )
        clear_github_oauth_state_cookie(response)
        clear_github_oauth_return_to_cookie(response)
        return response

    try:
        access_token = await exchange_code_for_token(code)
        github_user = await get_github_user(access_token)
    except HTTPException:
        response = RedirectResponse(
            url=build_github_callback_redirect(request, "github_error", "oauth_failed"),
            status_code=status.HTTP_302_FOUND,
        )
        clear_github_oauth_state_cookie(response)
        clear_github_oauth_return_to_cookie(response)
        return response

    existing_user = await session.scalar(
        select(User).where(
            User.github_id == github_user["id"],
            User.id != current_user.id,
        )
    )
    if existing_user is not None:
        response = RedirectResponse(
            url=build_github_callback_redirect(request, "github_error", "already_linked"),
            status_code=status.HTTP_302_FOUND,
        )
        clear_github_oauth_state_cookie(response)
        clear_github_oauth_return_to_cookie(response)
        return response

    current_user.github_id = int(github_user["id"])
    current_user.github_login = str(github_user["login"])
    current_user.github_access_token = encrypt_github_access_token(access_token)
    await session.commit()
    logger.info(
        "github_linked",
        extra={"user_id": str(current_user.id), "github_login": current_user.github_login},
    )

    response = RedirectResponse(
        url=build_github_callback_redirect(request, "github_linked", "1"),
        status_code=status.HTTP_302_FOUND,
    )
    clear_github_oauth_state_cookie(response)
    clear_github_oauth_return_to_cookie(response)
    return response


@router.post(
    "/change-password",
    summary="Сменить пароль",
    responses={
        200: {"description": "Пароль изменён"},
        400: {"description": "Текущий пароль неверный"},
        401: {"description": "Нет активной сессии"},
        429: {"description": "Превышен лимит запросов"},
    },
)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    response: Response,
    session: DbSession,
    current_user: CurrentUser,
) -> dict[str, bool]:
    if not await verify_password_async(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.password_hash = await hash_password_async(payload.new_password)
    current_user.token_version += 1
    await session.commit()

    set_session_cookie(response, create_jwt(current_user.id, current_user.token_version))
    logger.info("password_changed", extra={"user_id": str(current_user.id)})
    return {"ok": True}


@router.post(
    "/logout",
    summary="Выход",
    description="Удаляет `session` cookie.",
    responses={
        200: {"description": "Cookie удалён"},
        401: {"description": "Нет активной сессии"},
    },
)
async def logout(
    response: Response,
    session: DbSession,
    current_user: CurrentUser,
) -> dict[str, bool]:
    current_user.token_version += 1
    await session.commit()
    clear_session_cookie(response)
    logger.info("logout", extra={"user_id": str(current_user.id)})
    return {"ok": True}


@router.delete(
    "/github/connect",
    summary="Отвязать GitHub",
    description=(
        "Обнуляет GitHub-поля пользователя. Проекты сохраняются, "
        "но создавать задачи и публиковать будет нельзя."
    ),
    responses={
        200: {"description": "GitHub отвязан"},
        401: {"description": "Нет активной сессии"},
    },
)
async def disconnect_github(session: DbSession, current_user: CurrentUser) -> dict[str, bool]:
    current_user.github_id = None
    current_user.github_login = None
    current_user.github_access_token = None
    await session.commit()
    return {"ok": True}
