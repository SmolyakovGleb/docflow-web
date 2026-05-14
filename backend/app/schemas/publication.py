from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserRead


class PublicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    target_repo: str
    target_path: str
    commit_sha: str
    published_at: datetime


class HistoryPublisherOptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str


class HistoryPublicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_id: UUID
    file_path: str | None
    source_repo: str | None
    target_repo: str
    target_path: str
    commit_sha: str
    commit_url: str
    published_by: UserRead = Field(validation_alias="publisher")
    published_at: datetime
    can_open_task: bool = False


class HistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[HistoryPublicationRead]
    publishers: list[HistoryPublisherOptionRead] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
