from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

TeamInviteStatus = Literal["active", "used", "expired"]
TeamMemberRole = Literal["owner", "member"]


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TeamRename(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TeamMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    github_linked: bool
    joined_at: datetime
    role: TeamMemberRole


class TeamDetail(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    member_count: int
    members: list[TeamMemberRead]


class TeamInviteRead(BaseModel):
    id: UUID
    token: UUID
    created_by_email: str
    used_by_email: str | None
    expires_at: datetime | None
    created_at: datetime
    status: TeamInviteStatus


class TeamInviteCreate(BaseModel):
    expires_in_days: int | None = Field(None, ge=1)


class TeamJoin(BaseModel):
    token: UUID


class TeamInvitePreviewRead(BaseModel):
    team_name: str
    member_count: int
