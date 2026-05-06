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
    created_at: datetime


class ProjectCreateResponse(ProjectRead):
    webhook_secret: str


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str | None = None
    source_repo: str | None = None
    source_branch: str | None = None
    target_repo: str | None = None
    target_branch: str | None = None
    exclude_patterns: list[str] | None = None

    @field_validator("source_repo", "target_repo")
    @classmethod
    def validate_repo_fields(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_repo_name(value)
