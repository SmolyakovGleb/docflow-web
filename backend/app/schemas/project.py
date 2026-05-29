from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

_REPO_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _validate_repo_name(value: str) -> str:
    if not _REPO_NAME_PATTERN.fullmatch(value):
        raise ValueError("Repository must match owner/repo")
    return value


class ProjectCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    source_repo: str
    source_branch: str = "main"
    target_repo: str
    target_branch: str = "main"
    exclude_patterns: list[str] = Field(default_factory=list)
    team_id: UUID | None = None
    incremental_threshold: int = Field(40, ge=1, le=100)

    @field_validator("source_repo", "target_repo")
    @classmethod
    def validate_repo_fields(cls, value: str) -> str:
        return _validate_repo_name(value)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    source_repo: str
    source_branch: str
    target_repo: str
    target_branch: str
    exclude_patterns: list[str]
    webhook_url: str
    version: int
    created_at: datetime
    team_id: UUID | None
    is_team_project: bool
    pipeline_paused: bool
    webhook_file_limit: int
    incremental_threshold: int


class ProjectCreateResponse(ProjectRead):
    webhook_secret: str


class ProjectWebhookSecretResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    webhook_secret: str


class ProjectFilesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[str]


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str | None = None
    source_branch: str | None = None
    target_branch: str | None = None
    exclude_patterns: list[str] | None = None
    pipeline_paused: bool | None = None
    webhook_file_limit: int | None = Field(None, ge=1, le=1000)
    incremental_threshold: int | None = Field(None, ge=1, le=100)
