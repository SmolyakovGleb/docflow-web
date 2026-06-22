from __future__ import annotations

import uuid as uuid_module
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

PASSWORD_REQUIRES_DIGIT_PATTERN = r".*\d.*"


class UserRegister(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        max_length=72,
        pattern=PASSWORD_REQUIRES_DIGIT_PATTERN,
    )
    display_name: str | None = None
    invite_token: uuid_module.UUID | None = None


class UserLogin(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str | None
    github_linked: bool
    github_login: str | None
    is_admin: bool


class AuthResult(UserRead):
    # JWT в теле ответа: фронт кладёт его в localStorage и шлёт `Authorization: Bearer`.
    # Нужно, потому что за гейтвеем VibeCode httpOnly-кука (Set-Cookie) вырезается.
    access_token: str


class GithubConnectResponse(BaseModel):
    # connect стал XHR-эндпоинтом (вместо 302): фронт получает URL и сам делает на него переход.
    authorize_url: str | None = None
    already_linked: bool = False


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current_password: str = Field(..., min_length=1, max_length=72)
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=72,
        pattern=PASSWORD_REQUIRES_DIGIT_PATTERN,
    )
