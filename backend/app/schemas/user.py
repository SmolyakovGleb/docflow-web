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


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    current_password: str = Field(..., min_length=1, max_length=72)
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=72,
        pattern=PASSWORD_REQUIRES_DIGIT_PATTERN,
    )
