from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import httpx
from fastapi import Cookie, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.encryption import decrypt_value, encrypt_value
from app.core.request_context import set_user_id
from app.db.session import get_db_session
from app.models.user import User

ALGORITHM = "HS256"
SESSION_COOKIE_NAME = "session"
SESSION_LIFETIME_DAYS = 30
GITHUB_OAUTH_SCOPE = "repo"
GITHUB_OAUTH_STATE_COOKIE_NAME = "github_oauth_state"
GITHUB_OAUTH_STATE_MAX_AGE_SECONDS = 300
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
SessionToken = Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)]
DUMMY_PASSWORD_HASH = bcrypt.hashpw(
    b"docflow-dummy-password",
    bcrypt.gensalt(),
).decode("utf-8")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


async def hash_password_async(password: str) -> str:
    return await run_in_threadpool(hash_password, password)


async def verify_password_async(password: str, password_hash: str) -> bool:
    return await run_in_threadpool(verify_password, password, password_hash)


def _require_github_oauth_settings() -> tuple[str, str, str]:
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GitHub OAuth is not configured",
        )
    return settings.github_client_id, settings.github_client_secret, settings.github_callback_url


def generate_github_oauth_state() -> str:
    return secrets.token_urlsafe(16)


def encrypt_github_access_token(access_token: str) -> str:
    return encrypt_value(access_token)


def decrypt_github_access_token(encrypted_token: str) -> str:
    return decrypt_value(encrypted_token)


def encrypt_webhook_secret(secret: str) -> str:
    return encrypt_value(secret)


def decrypt_webhook_secret(encrypted_secret: str) -> str:
    return decrypt_value(encrypted_secret)


def get_github_oauth_url(state: str) -> str:
    client_id, _, callback_url = _require_github_oauth_settings()
    params = httpx.QueryParams(
        {
            "client_id": client_id,
            "redirect_uri": callback_url,
            "scope": GITHUB_OAUTH_SCOPE,
            "state": state,
        }
    )
    return f"{GITHUB_AUTHORIZE_URL}?{params}"


async def exchange_code_for_token(code: str) -> str:
    client_id, client_secret, callback_url = _require_github_oauth_settings()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                GITHUB_ACCESS_TOKEN_URL,
                headers={"Accept": "application/json"},
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": callback_url,
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub OAuth failed",
        ) from exc

    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="GitHub OAuth failed")

    return access_token


async def get_github_user(access_token: str) -> dict[str, int | str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                GITHUB_USER_URL,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub OAuth failed",
        ) from exc

    payload = response.json()
    github_id = payload.get("id")
    github_login = payload.get("login")
    if not github_id or not github_login:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="GitHub OAuth failed")

    return {
        "id": github_id,
        "login": github_login,
    }


def create_jwt(user_id: uuid.UUID | str, token_version: int) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_LIFETIME_DAYS)
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.session_secret, algorithm=ALGORITHM)


def decode_jwt(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.session_secret, algorithms=[ALGORITHM])


async def get_current_user(
    session: DbSession,
    session_token: SessionToken = None,
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_jwt(session_token)
        user_id = uuid.UUID(payload["sub"])
        token_version = int(payload["tv"])
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        ) from exc

    user = await session.get(User, user_id)
    if user is None or user.token_version != token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    set_user_id(str(user.id))
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
