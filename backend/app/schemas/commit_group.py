from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class CommitGroupRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    github_sha: str
    github_ref: str
    commit_message: str | None
    commit_author_name: str | None
    commit_author_login: str | None
    file_paths: list[str]
    status: str
    created_at: datetime
    confirmed_at: datetime | None


class CommitGroupListResponse(BaseModel):
    items: list[CommitGroupRead]
    total: int
