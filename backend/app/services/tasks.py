from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import pathspec
from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import ManualTaskFromRepo, TaskStatus, TaskUpdate
from app.services.auth import decrypt_github_access_token
from app.services.github import GitHubClient
from app.services.projects import get_project_or_404

ACTIVE_TASK_STATUSES = ("queued", "running")
EDITABLE_TASK_STATUSES = {"done", "failed"}
RETRYABLE_TASK_STATUSES = {"done", "failed"}


@dataclass(frozen=True)
class ManualTaskCreationResult:
    created_tasks: list[Task]
    skipped: list[dict[str, Any]]


@dataclass(frozen=True)
class UploadTaskPayload:
    project_id: UUID
    target_path: str
    filename: str
    content: str


@dataclass(frozen=True)
class SourceFileChangedError(Exception):
    old_sha: str | None
    new_sha: str | None

    def __post_init__(self) -> None:
        Exception.__init__(self, f"source SHA changed: {self.old_sha!r} → {self.new_sha!r}")


def ensure_github_access(user: User) -> str:
    if not user.github_linked or not user.github_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account is not linked",
        )

    return decrypt_github_access_token(user.github_access_token)


def _base_visible_task_query(current_user: User):
    return (
        select(Task)
        .join(Project, Task.project_id == Project.id)
        .where(Project.user_id == current_user.id)
    )


async def get_task_or_404(
    session: AsyncSession,
    task_id: UUID,
    current_user: User,
    *,
    with_publications: bool = False,
) -> Task:
    query = _base_visible_task_query(current_user).where(Task.id == task_id)
    if with_publications:
        query = query.options(
            selectinload(Task.publications),
            selectinload(Task.project),
        )
    else:
        query = query.options(selectinload(Task.project))

    task = await session.scalar(query)
    if task is not None:
        return task

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")


async def list_tasks(
    session: AsyncSession,
    current_user: User,
    *,
    project_id: UUID | None,
    status_filter: TaskStatus | None,
    limit: int,
    offset: int,
) -> tuple[list[Task], int]:
    if project_id is not None:
        await get_project_or_404(session, project_id, current_user)

    query = _base_visible_task_query(current_user)
    count_query = (
        select(func.count())
        .select_from(Task)
        .join(Project, Task.project_id == Project.id)
        .where(Project.user_id == current_user.id)
    )

    if project_id is not None:
        query = query.where(Task.project_id == project_id)
        count_query = count_query.where(Task.project_id == project_id)
    if status_filter is not None:
        query = query.where(Task.status == status_filter)
        count_query = count_query.where(Task.status == status_filter)

    query = query.order_by(Task.created_at.desc()).limit(limit).offset(offset)

    items = list((await session.scalars(query)).all())
    total = int((await session.scalar(count_query)) or 0)
    return items, total


def ensure_task_editable(task: Task) -> None:
    if task.status in EDITABLE_TASK_STATUSES:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Cannot edit task with status '{task.status}'",
    )


async def update_task_content(
    session: AsyncSession,
    task: Task,
    payload: TaskUpdate,
) -> Task:
    ensure_task_editable(task)
    task.translated_content = payload.translated_content
    await session.commit()
    refreshed_task = await session.scalar(
        select(Task)
        .where(Task.id == task.id)
        .options(
            selectinload(Task.project),
            selectinload(Task.publications),
        )
    )
    if refreshed_task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return refreshed_task


def ensure_task_retryable(task: Task) -> None:
    if task.status in RETRYABLE_TASK_STATUSES:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Cannot retry task with status '{task.status}'",
    )


def is_manual_upload_task(task: Task) -> bool:
    return task.github_ref == "manual" and task.source_file_sha is None


def _apply_exclude_patterns(
    file_paths: list[str],
    patterns: list[str],
) -> tuple[list[str], list[dict[str, Any]]]:
    if not patterns:
        return file_paths, []

    spec = pathspec.PathSpec.from_lines("gitignore", patterns)
    included: list[str] = []
    skipped: list[dict[str, Any]] = []

    for file_path in file_paths:
        if spec.match_file(file_path):
            skipped.append(
                {
                    "file_path": file_path,
                    "reason": "excluded_by_pattern",
                    "existing_task_id": None,
                }
            )
            continue
        included.append(file_path)

    return included, skipped


async def _get_active_tasks_by_path(
    session: AsyncSession,
    project_id: UUID,
    file_paths: list[str],
) -> dict[str, Task]:
    if not file_paths:
        return {}

    active_tasks = (
        await session.scalars(
            select(Task).where(
                Task.project_id == project_id,
                Task.file_path.in_(file_paths),
                Task.status.in_(ACTIVE_TASK_STATUSES),
            )
        )
    ).all()
    return {task.file_path: task for task in active_tasks}


def _append_active_task_skips(
    file_paths: list[str],
    active_tasks_by_path: dict[str, Task],
    skipped: list[dict[str, Any]],
) -> list[str]:
    files_to_create: list[str] = []

    for file_path in file_paths:
        existing_task = active_tasks_by_path.get(file_path)
        if existing_task is None:
            files_to_create.append(file_path)
            continue

        skipped.append(
            {
                "file_path": file_path,
                "reason": (
                    "already_queued"
                    if existing_task.status == "queued"
                    else "pipeline_running"
                ),
                "existing_task_id": existing_task.id,
            }
        )

    return files_to_create


def _build_repo_task(
    project: Project,
    file_path: str,
    original_content: str,
    source_file_sha: str,
    target_file_sha: str | None,
) -> Task:
    return Task(
        project_id=project.id,
        file_path=file_path,
        github_ref="manual",
        github_sha=None,
        commit_message="manual",
        source_file_sha=source_file_sha,
        target_file_sha=target_file_sha,
        original_content=original_content,
        status="queued",
    )


def _build_upload_task(project: Project, payload: UploadTaskPayload) -> Task:
    return Task(
        project_id=project.id,
        file_path=payload.target_path,
        github_ref="manual",
        github_sha=None,
        commit_message="manual",
        source_file_sha=None,
        target_file_sha=None,
        original_content=payload.content,
        status="queued",
    )


async def create_manual_tasks_from_repo(
    session: AsyncSession,
    current_user: User,
    payload: ManualTaskFromRepo,
) -> ManualTaskCreationResult:
    project = await get_project_or_404(session, payload.project_id, current_user)
    access_token = ensure_github_access(current_user)
    github_client = GitHubClient(access_token)

    unique_paths = list(dict.fromkeys(payload.file_paths))
    candidate_paths, skipped = _apply_exclude_patterns(unique_paths, project.exclude_patterns)
    active_tasks_by_path = await _get_active_tasks_by_path(session, project.id, candidate_paths)
    files_to_create = _append_active_task_skips(candidate_paths, active_tasks_by_path, skipped)

    created_tasks: list[Task] = []
    for file_path in files_to_create:
        original_content, source_file_sha = await github_client.get_file_content(
            project.source_repo,
            file_path,
            project.source_branch,
        )
        target_file_sha = await github_client.get_file_sha(
            project.target_repo,
            file_path,
            project.target_branch,
        )
        created_tasks.append(
            _build_repo_task(
                project,
                file_path,
                original_content,
                source_file_sha,
                target_file_sha,
            )
        )

    if created_tasks:
        session.add_all(created_tasks)
        await session.commit()

    return ManualTaskCreationResult(created_tasks=created_tasks, skipped=skipped)


async def create_manual_task_from_upload(
    session: AsyncSession,
    current_user: User,
    payload: UploadTaskPayload,
) -> ManualTaskCreationResult:
    project = await get_project_or_404(session, payload.project_id, current_user)

    if not payload.filename.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .md files are allowed",
        )

    candidate_paths, skipped = _apply_exclude_patterns(
        [payload.target_path],
        project.exclude_patterns,
    )
    active_tasks_by_path = await _get_active_tasks_by_path(session, project.id, candidate_paths)
    files_to_create = _append_active_task_skips(candidate_paths, active_tasks_by_path, skipped)

    created_tasks: list[Task] = []
    if files_to_create:
        task = _build_upload_task(project, payload)
        created_tasks.append(task)
        session.add(task)
        await session.commit()

    return ManualTaskCreationResult(created_tasks=created_tasks, skipped=skipped)


def parse_manual_repo_payload(payload: dict[str, Any]) -> ManualTaskFromRepo:
    try:
        return ManualTaskFromRepo.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(include_url=False),
        ) from exc


def parse_upload_payload(
    *,
    project_id: str,
    target_path: str,
    filename: str,
    content: bytes,
) -> UploadTaskPayload:
    if len(content) > 1_048_576:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File is too large",
        )
    if not target_path.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .md files are allowed",
        )

    try:
        parsed_project_id = uuid.UUID(project_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="project_id must be a UUID",
        ) from exc

    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be UTF-8 encoded",
        ) from exc

    return UploadTaskPayload(
        project_id=parsed_project_id,
        target_path=target_path,
        filename=filename,
        content=text_content,
    )


async def reset_task_for_retry(
    session: AsyncSession,
    task: Task,
    current_user: User,
    *,
    force: bool,
) -> Task:
    ensure_task_retryable(task)

    if not is_manual_upload_task(task):
        access_token = ensure_github_access(current_user)
        github_client = GitHubClient(access_token)
        assert task.project is not None
        current_sha = await github_client.get_file_sha(
            task.project.source_repo,
            task.file_path,
            task.project.source_branch,
        )

        if not force and current_sha != task.source_file_sha:
            raise SourceFileChangedError(
                old_sha=task.source_file_sha,
                new_sha=current_sha,
            )

    task.translated_content = None
    task.log = None
    task.error = None
    task.status = "queued"
    await session.commit()
    return task
