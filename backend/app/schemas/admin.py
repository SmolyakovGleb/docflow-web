from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

InviteTokenStatus = Literal["active", "used", "expired"]


class AdminUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str | None
    github_linked: bool
    is_admin: bool
    task_count: int
    created_at: datetime
    invite_token_id: UUID | None


class AdminUserUpdate(BaseModel):
    is_admin: bool


class InviteTokenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    token: UUID
    created_by_email: str
    used_by_email: str | None
    expires_at: datetime | None
    created_at: datetime
    status: InviteTokenStatus


class InviteTokenCreate(BaseModel):
    expires_in_days: int | None = Field(None, ge=1)


class AdminTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_path: str
    status: str
    created_at: datetime
    updated_at: datetime
    user_id: UUID
    user_email: str
    project_id: UUID | None
    project_name: str | None


class AdminTaskListResponse(BaseModel):
    items: list[AdminTaskRead]
    total: int
