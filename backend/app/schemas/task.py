from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.publication import PublicationRead

TaskStatus = Literal["queued", "running", "done", "failed", "published"]
SkippedReason = Literal["already_queued", "pipeline_running", "excluded_by_pattern"]


class TaskSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID | None = Field(None, description="ID проекта; `null` для удалённых проектов (orphaned tasks)")
    file_path: str = Field(..., description="Путь к файлу относительно корня репозитория, напр. `api-reference/crm/deals/crm-deal-get.md`")
    status: TaskStatus = Field(..., description="Статус: `queued` → `running` → `done`/`failed` → `published`")
    created_at: datetime
    completed_at: datetime | None = Field(None, description="Когда перевод завершился статусом `done` или `failed`")
    updated_at: datetime


class TaskDetail(TaskSummary):
    model_config = ConfigDict(from_attributes=True)

    github_ref: str = Field(..., description="Git ref коммита, напр. `refs/heads/main`; `manual` для ручного запуска")
    github_sha: str | None = Field(None, description="SHA коммита из push-события; `null` для ручного запуска")
    source_file_sha: str | None = Field(None, description="Blob SHA RU-файла в source repo на момент создания задачи; `null` для upload-задач")
    target_file_sha: str | None = Field(None, description="Blob SHA EN-файла в target repo на момент создания задачи; `null` если файл не существовал")
    original_content: str = Field(..., description="Исходный RU текст файла")
    translated_content: str | None = Field(None, description="Переведённый EN текст; `null` пока пайплайн не завершился")
    error: str | None = Field(None, description="Traceback ошибки при `status=failed`; `null` в остальных случаях")
    publications: list[PublicationRead] = Field(default_factory=list, description="История публикаций этой задачи")


class TaskUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    translated_content: str


class TaskListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[TaskSummary]
    total: int
    limit: int
    offset: int


class SkippedFile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    file_path: str
    reason: SkippedReason = Field(
        ...,
        description=(
            "`already_queued` — задача ждёт в очереди; "
            "`pipeline_running` — пайплайн уже выполняется; "
            "`excluded_by_pattern` — файл совпал с `exclude_patterns` проекта"
        ),
    )
    existing_task_id: UUID | None = Field(None, description="ID существующей активной задачи; `null` для `excluded_by_pattern`")


class TaskCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    created: int
    task_ids: list[UUID]
    skipped: list[SkippedFile] = Field(default_factory=list)


class TaskPublishResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: UUID
    status: Literal["published"]
    commit_sha: str = Field(..., description="SHA коммита в target-репозитории")
    target_repo: str = Field(..., description="Target-репозиторий в формате `owner/repo`")
    target_path: str = Field(..., description="Путь к опубликованному файлу в target-репозитории")


class RetryRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    force: bool = Field(False, description="Если `true` — перевести старую версию файла даже если source изменился в GitHub")


class ManualTaskFromRepo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    file_paths: list[str]


class ConflictDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    base: str
    ours: str
    theirs: str
