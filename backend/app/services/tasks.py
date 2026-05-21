from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import pathspec
from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.publication import Publication
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import ManualTaskFromRepo, TaskStatus, TaskUpdate
from app.services import bitrix_notify
from app.services import task_list_events
from app.services.auth import decrypt_github_access_token
from app.services.github import GitHubClient
from app.services.projects import _get_user_team_id, get_project_or_404, get_project_visible_or_404

ACTIVE_TASK_STATUSES = ("queued", "running")
ALL_TASK_STATUSES = ("queued", "running", "done", "failed", "published", "conflict")
EDITABLE_TASK_STATUSES = {"done", "failed", "conflict"}
RETRYABLE_TASK_STATUSES = {"done", "failed"}
PUBLISHABLE_TASK_STATUSES = {"done", "conflict"}
REMOVABLE_TASK_STATUSES = {"queued"}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ManualTaskCreationResult:
    created_tasks: list[Task]
    skipped: list[dict[str, Any]]


@dataclass(frozen=True)
class UploadTaskPayload:
    project_id: UUID | None
    target_path: str
    filename: str
    content: str


@dataclass(frozen=True)
class SourceFileChangedError(Exception):
    old_sha: str | None
    new_sha: str | None

    def __post_init__(self) -> None:
        Exception.__init__(self, f"source SHA changed: {self.old_sha!r} → {self.new_sha!r}")


@dataclass(frozen=True)
class PublishConflictError(Exception):
    base: str
    ours: str
    theirs: str

    def __post_init__(self) -> None:
        Exception.__init__(self, "Conflict: target file was modified since this task was created")


@dataclass(frozen=True)
class PublishTaskResult:
    task_id: UUID
    status: str
    commit_sha: str
    target_repo: str
    target_path: str


def ensure_github_access(user: User) -> str:
    if not user.github_linked or not user.github_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account is not linked",
        )

    return decrypt_github_access_token(user.github_access_token)


def _visibility_condition(user_id: UUID, team_id: UUID | None):
    if team_id is not None:
        return or_(Task.user_id == user_id, Task.team_id == team_id)
    return Task.user_id == user_id


def _base_visible_task_query(user_id: UUID, team_id: UUID | None = None):
    return select(Task).where(_visibility_condition(user_id, team_id))


async def get_task_or_404(
    session: AsyncSession,
    task_id: UUID,
    current_user: User,
    *,
    with_publications: bool = False,
) -> Task:
    team_id = await _get_user_team_id(session, current_user.id)
    query = _base_visible_task_query(current_user.id, team_id).where(Task.id == task_id)
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
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Task], int, dict[str, int]]:
    team_id = await _get_user_team_id(session, current_user.id)

    if project_id is not None:
        await get_project_visible_or_404(session, project_id, current_user)

    vis = _visibility_condition(current_user.id, team_id)
    query = _base_visible_task_query(current_user.id, team_id).options(selectinload(Task.project))
    count_query = select(func.count()).select_from(Task).where(vis)
    status_counts_query = (
        select(Task.status, func.count())
        .where(vis)
        .group_by(Task.status)
    )

    if project_id is not None:
        query = query.where(Task.project_id == project_id)
        count_query = count_query.where(Task.project_id == project_id)
        status_counts_query = status_counts_query.where(Task.project_id == project_id)
    if status_filter is not None:
        query = query.where(Task.status == status_filter)
        count_query = count_query.where(Task.status == status_filter)
    if search:
        like_pattern = f"%{search.strip()}%"
        if like_pattern != "%%":
            search_condition = or_(
                Task.file_path.ilike(like_pattern),
                Task.commit_message.ilike(like_pattern),
            )
            query = query.where(search_condition)
            count_query = count_query.where(search_condition)
            status_counts_query = status_counts_query.where(search_condition)

    query = query.order_by(Task.created_at.desc()).limit(limit).offset(offset)

    items = list((await session.scalars(query)).all())
    total = int((await session.scalar(count_query)) or 0)
    status_counts = {status: 0 for status in ALL_TASK_STATUSES}
    for row_status, count in (await session.execute(status_counts_query)).all():
        status_counts[str(row_status)] = int(count)

    return items, total, status_counts


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


def ensure_task_publishable(task: Task) -> None:
    if task.status in PUBLISHABLE_TASK_STATUSES:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Task must be in 'done' or 'conflict' status to publish",
    )


def ensure_task_removable(task: Task) -> None:
    if task.status in REMOVABLE_TASK_STATUSES:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Cannot remove task with status '{task.status}' from queue",
    )


def is_manual_upload_task(task: Task) -> bool:
    return task.github_ref == "manual" and task.source_file_sha is None


def clear_task_conflict(task: Task) -> None:
    task.conflict_base = None
    task.conflict_ours = None
    task.conflict_theirs = None


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
    *,
    user_id: UUID,
    file_paths: list[str],
    project_id: UUID | None,
) -> dict[str, Task]:
    if not file_paths:
        return {}

    query = select(Task).where(
        Task.file_path.in_(file_paths),
        Task.status.in_(ACTIVE_TASK_STATUSES),
    )
    if project_id is None:
        # No project: scope to this user's upload tasks
        query = query.where(Task.project_id.is_(None), Task.user_id == user_id)
    else:
        # Project-scoped: any active task for this project blocks creation,
        # regardless of which team member created it
        query = query.where(Task.project_id == project_id)

    active_tasks = (await session.scalars(query)).all()
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
    *,
    user_id: UUID,
    file_path: str,
    original_content: str,
    source_file_sha: str,
    target_file_sha: str | None,
) -> Task:
    return Task(
        user_id=user_id,
        project_id=project.id,
        team_id=project.team_id,
        file_path=file_path,
        github_ref="manual",
        github_sha=None,
        commit_message="manual",
        source_file_sha=source_file_sha,
        target_file_sha=target_file_sha,
        original_content=original_content,
        status="queued",
    )


def _build_upload_task(
    *,
    user_id: UUID,
    project: Project | None,
    payload: UploadTaskPayload,
) -> Task:
    return Task(
        user_id=user_id,
        project_id=project.id if project is not None else None,
        team_id=project.team_id if project is not None else None,
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
    project = await get_project_visible_or_404(session, payload.project_id, current_user)
    # Use project owner's GitHub token — team members may not have GitHub linked
    project_owner = current_user if project.user_id == current_user.id else await session.get(User, project.user_id)
    access_token = ensure_github_access(project_owner)
    github_client = GitHubClient(access_token)

    unique_paths = list(dict.fromkeys(payload.file_paths))
    candidate_paths, skipped = _apply_exclude_patterns(unique_paths, project.exclude_patterns)
    active_tasks_by_path = await _get_active_tasks_by_path(
        session,
        user_id=current_user.id,
        file_paths=candidate_paths,
        project_id=project.id,
    )
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
                user_id=current_user.id,
                file_path=file_path,
                original_content=original_content,
                source_file_sha=source_file_sha,
                target_file_sha=target_file_sha,
            )
        )

    if created_tasks:
        session.add_all(created_tasks)
        await session.commit()
        for task in created_tasks:
            task_list_events.publish_task_entered_scope(task)

    return ManualTaskCreationResult(created_tasks=created_tasks, skipped=skipped)


async def create_manual_task_from_upload(
    session: AsyncSession,
    current_user: User,
    payload: UploadTaskPayload,
) -> ManualTaskCreationResult:
    project = (
        await get_project_visible_or_404(session, payload.project_id, current_user)
        if payload.project_id is not None
        else None
    )

    if not payload.filename.endswith(".md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .md files are allowed",
        )

    candidate_paths, skipped = _apply_exclude_patterns(
        [payload.target_path],
        project.exclude_patterns if project is not None else [],
    )
    active_tasks_by_path = await _get_active_tasks_by_path(
        session,
        user_id=current_user.id,
        file_paths=candidate_paths,
        project_id=project.id if project is not None else None,
    )
    files_to_create = _append_active_task_skips(candidate_paths, active_tasks_by_path, skipped)

    created_tasks: list[Task] = []
    if files_to_create:
        task = _build_upload_task(
            user_id=current_user.id,
            project=project,
            payload=payload,
        )
        created_tasks.append(task)
        session.add(task)
        await session.commit()
        task_list_events.publish_task_entered_scope(task)

    return ManualTaskCreationResult(created_tasks=created_tasks, skipped=skipped)


def parse_manual_repo_payload(payload: dict[str, Any]) -> ManualTaskFromRepo:
    try:
        parsed = ManualTaskFromRepo.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(include_url=False),
        ) from exc

    for file_path in parsed.file_paths:
        _ensure_safe_relative_path(file_path, field="file_paths[*]")
    return parsed


def _ensure_safe_relative_path(path: str, *, field: str) -> None:
    if not path or path.startswith("/") or "\\" in path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field} must be a forward-slash relative path",
        )
    if any(part in {"", "..", "."} for part in path.split("/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field} must not contain '.' or '..' segments",
        )


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
    _ensure_safe_relative_path(target_path, field="target_path")

    try:
        parsed_project_id = uuid.UUID(project_id) if project_id else None
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
    expected_status = task.status

    if not is_manual_upload_task(task):
        access_token = ensure_github_access(current_user)
        github_client = GitHubClient(access_token)
        if task.project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
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

    from sqlalchemy import update as sql_update

    result = await session.execute(
        sql_update(Task)
        .where(Task.id == task.id, Task.status == expected_status)
        .values(
            translated_content=None,
            conflict_base=None,
            conflict_ours=None,
            conflict_theirs=None,
            log=None,
            error=None,
            completed_at=None,
            status="queued",
            current_stage=None,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task status changed concurrently; refresh and retry",
        )
    await session.commit()
    await session.refresh(task)
    return task


async def delete_queued_task(
    session: AsyncSession,
    task: Task,
) -> None:
    ensure_task_removable(task)
    await session.delete(task)
    await session.commit()


async def publish_task(
    session: AsyncSession,
    task: Task,
    current_user: User,
    commit_message: str | None = None,
    target_path: str | None = None,
) -> PublishTaskResult:
    ensure_task_publishable(task)

    project = task.project
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task has no target repository",
        )

    access_token = ensure_github_access(current_user)
    github_client = GitHubClient(access_token)

    effective_path = target_path or task.file_path
    effective_message = commit_message or f"Publish translation: {task.file_path}"
    path_changed = bool(target_path) and target_path != task.file_path

    current_sha = await github_client.get_file_sha(
        project.target_repo,
        effective_path,
        project.target_branch,
    )

    if not path_changed and current_sha != task.target_file_sha:
        previous_status = task.status
        theirs = ""
        if current_sha is not None:
            theirs, _ = await github_client.get_file_content(
                project.target_repo,
                task.file_path,
                project.target_branch,
            )
        task.status = "conflict"
        task.target_file_sha = current_sha
        task.conflict_base = task.original_content
        task.conflict_ours = task.translated_content or ""
        task.conflict_theirs = theirs
        await session.commit()
        task_list_events.publish_task_entered_scope(task, previous_status=previous_status)
        raise PublishConflictError(
            base=task.original_content,
            ours=task.translated_content or "",
            theirs=theirs,
        )

    commit_sha = await github_client.create_or_update_file(
        repo=project.target_repo,
        path=effective_path,
        message=effective_message,
        content=task.translated_content or "",
        sha=current_sha,
        branch=project.target_branch,
    )

    publication = Publication(
        task_id=task.id,
        published_by=current_user.id,
        target_repo=project.target_repo,
        target_path=effective_path,
        commit_sha=commit_sha,
        target_file_sha_before=current_sha,
    )
    session.add(publication)
    previous_status = task.status
    task.status = "published"
    clear_task_conflict(task)
    await session.commit()
    task_list_events.publish_task_entered_scope(task, previous_status=previous_status)
    logger.info(
        "task_published",
        extra={
            "task_id": str(task.id),
            "target_repo": project.target_repo,
            "commit_sha": commit_sha,
        },
    )

    await bitrix_notify.notify(
        "published",
        {
            "task_id": str(task.id),
            "project_id": str(project.id),
            "target_repo": project.target_repo,
            "target_path": effective_path,
            "commit_sha": commit_sha,
            "published_by": str(current_user.id),
        },
    )

    return PublishTaskResult(
        task_id=task.id,
        status="published",
        commit_sha=commit_sha,
        target_repo=project.target_repo,
        target_path=effective_path,
    )
