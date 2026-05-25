from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.publication import PublicationRead

TaskStatus = Literal["queued", "running", "done", "failed", "published", "conflict", "cancelled"]
SkippedReason = Literal["already_queued", "pipeline_running", "excluded_by_pattern"]


class TaskSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID | None = Field(None, description="Project ID; null for orphaned tasks")
    project_name: str | None = Field(None, description="Project name for task list rows")
    file_path: str = Field(..., description="Relative file path inside the repository")
    github_sha: str | None = Field(None, description="GitHub commit SHA; null for manual tasks")
    commit_message: str | None = Field(None, description="Commit message or manual label")
    commit_author_name: str | None = Field(None, description="Git commit author display name")
    commit_author_login: str | None = Field(None, description="GitHub login of the commit author")
    status: TaskStatus = Field(..., description="Task status")
    current_stage: str | None = Field(None, description="Current pipeline stage for running tasks")
    created_at: datetime
    completed_at: datetime | None = Field(None, description="Completion time for done/failed tasks")
    updated_at: datetime
    team_id: UUID | None = Field(None, description="Team ID; null for personal tasks")
    is_team_task: bool = Field(False, description="True if task belongs to a team")


class TaskDetail(TaskSummary):
    model_config = ConfigDict(from_attributes=True)

    github_ref: str = Field(..., description="Git ref; `manual` for manual tasks")
    source_file_sha: str | None = Field(None, description="Source repository blob SHA")
    target_file_sha: str | None = Field(None, description="Target repository blob SHA")
    original_content: str = Field(..., description="Original source content")
    translated_content: str | None = Field(None, description="Translated content")
    conflict_base: str | None = Field(None, description="Original content snapshot for publish conflict")
    conflict_ours: str | None = Field(None, description="Local translated content snapshot for publish conflict")
    conflict_theirs: str | None = Field(None, description="Remote target content snapshot for publish conflict")
    error: str | None = Field(None, description="Pipeline traceback for failed tasks")
    publications: list[PublicationRead] = Field(default_factory=list, description="Task publications")


class TaskUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    translated_content: str = Field(..., max_length=2_097_152)


class TaskListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[TaskSummary]
    total: int
    limit: int
    offset: int
    status_counts: dict[str, int] = Field(default_factory=dict)


class SkippedFile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    file_path: str
    reason: SkippedReason = Field(
        ...,
        description=(
            "`already_queued` - existing queued task; "
            "`pipeline_running` - existing running task; "
            "`excluded_by_pattern` - filtered by project exclude_patterns"
        ),
    )
    existing_task_id: UUID | None = Field(None, description="Existing active task ID when available")


class TaskCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    created: int
    task_ids: list[UUID]
    skipped: list[SkippedFile] = Field(default_factory=list)


class TaskPublishResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: UUID
    status: Literal["published"]
    commit_sha: str = Field(..., description="Commit SHA in the target repository")
    target_repo: str = Field(..., description="Target repository in owner/repo format")
    target_path: str = Field(..., description="Published path in the target repository")


class RetryRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    force: bool = Field(False, description="Retry even if the source file SHA changed")


class ManualTaskFromRepo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    file_paths: list[str]


class ConflictDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    base: str
    ours: str
    theirs: str


class PublishRequest(BaseModel):
    commit_message: str | None = Field(None, description="Custom commit message for the GitHub commit")
    target_path: str | None = Field(None, description="Override target file path in repository")


class BatchPublishRequest(BaseModel):
    task_ids: list[UUID]
    commit_message: str | None = Field(None, description="Custom commit message for the GitHub commit")
    per_task_paths: dict[UUID, str] | None = Field(None, description="Override target path per task ID")


class BatchPublishResponse(BaseModel):
    commit_sha: str | None = Field(None, description="Commit SHA; null if all tasks had conflicts")
    published_task_ids: list[UUID]
    conflict_task_ids: list[UUID]
