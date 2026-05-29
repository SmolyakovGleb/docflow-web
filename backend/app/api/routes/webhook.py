from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated, Any
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.commit_group import CommitGroup
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services import pipeline_runner, task_list_events
from app.services.auth import decrypt_github_access_token, decrypt_webhook_secret
from app.services.github import GitHubAPIError, GitHubClient
from app.services.tasks import _apply_exclude_patterns
from app.services.webhook import is_valid_github_signature

router = APIRouter(tags=["webhook"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
ACTIVE_TASK_STATUSES = ("queued", "running")
logger = logging.getLogger(__name__)

_GITHUB_FETCH_SEMAPHORE = asyncio.Semaphore(10)


async def _fetch_file_metadata(github_client: GitHubClient, project: Project, file_path: str):
    source_task = github_client.get_file_content(
        project.source_repo, file_path, project.source_branch
    )
    target_task = github_client.get_file_sha(
        project.target_repo, file_path, project.target_branch
    )
    (original_content, source_file_sha), target_file_sha = await asyncio.gather(
        source_task, target_task
    )
    return file_path, original_content, source_file_sha, target_file_sha


async def _fetch_file_metadata_safe(github_client: GitHubClient, project: Project, file_path: str):
    async with _GITHUB_FETCH_SEMAPHORE:
        return await _fetch_file_metadata(github_client, project, file_path)


def _collect_markdown_files(payload: dict[str, Any]) -> list[str]:
    files: list[str] = []

    for commit in payload.get("commits", []):
        for key in ("added", "modified"):
            for file_path in commit.get(key, []):
                if isinstance(file_path, str) and file_path.lower().endswith(".md"):
                    files.append(file_path)

    return list(dict.fromkeys(files))



async def _get_project_or_404(session: AsyncSession, project_id: UUID) -> Project:
    project = await session.get(Project, project_id)
    if project is not None:
        return project

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


async def _get_project_owner(session: AsyncSession, project: Project) -> User:
    user = await session.get(User, project.user_id)
    if user is not None:
        return user

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


async def _get_previous_task_ids(
    session: AsyncSession,
    project_id: UUID,
    file_paths: list[str],
) -> dict[str, UUID]:
    """Return {file_path: task_id} for the most recent published task per file."""
    if not file_paths:
        return {}

    subq = (
        select(Task.file_path, func.max(Task.created_at).label("max_created_at"))
        .where(
            Task.project_id == project_id,
            Task.file_path.in_(file_paths),
            Task.status == "published",
        )
        .group_by(Task.file_path)
        .subquery()
    )

    rows = (
        await session.execute(
            select(Task.file_path, Task.id).join(
                subq,
                and_(
                    Task.file_path == subq.c.file_path,
                    Task.created_at == subq.c.max_created_at,
                ),
            )
            .where(Task.project_id == project_id, Task.status == "published")
        )
    ).all()

    return {row.file_path: row.id for row in rows}


@router.post(
    "/webhook/{project_id}",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["webhook"],
    summary="GitHub push webhook",
    description=(
        "Принимает `push`-события от GitHub. Аутентификация через HMAC-подпись "
        "(`X-Hub-Signature-256` + `project.webhook_secret`).\n\n"
        "**Алгоритм:**\n"
        "1. Верифицировать HMAC-подпись\n"
        "2. `ping` → `200 {ok: true}`\n"
        "3. Фильтр: только `.md` из `commits[*].added/modified` в `source_branch`\n"
        "4. Применить `exclude_patterns`, дедупликацию (`queued`/`running`)\n"
        "5. Скачать файлы через GitHub API (атомарно — при ошибке задачи не создаются)\n"
        "6. Создать задачи и запустить пайплайн в фоне\n\n"
        "**Возможные `skipped.reason`:** "
        "`already_queued`, `pipeline_running`, `excluded_by_pattern`."
    ),
    responses={
        202: {"description": "Задачи созданы и поставлены в очередь"},
        400: {"description": "Неверный branch / нет .md файлов / нет GitHub-привязки у владельца"},
        403: {"description": "Неверная HMAC-подпись"},
        404: {"description": "Проект не найден"},
        502: {"description": "Ошибка GitHub API при скачивании файла"},
    },
)
async def github_webhook(
    project_id: UUID,
    request: Request,
    session: DbSession,
) -> dict[str, Any]:
    raw_body = await request.body()
    if len(raw_body) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Payload too large"
        )
    project = await _get_project_or_404(session, project_id)

    signature = request.headers.get("X-Hub-Signature-256")
    plaintext_secret = decrypt_webhook_secret(project.webhook_secret)
    if not is_valid_github_signature(plaintext_secret, raw_body, signature):
        logger.warning(
            "webhook_invalid_signature",
            extra={"project_id": str(project.id)},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook signature",
        )

    event_name = request.headers.get("X-GitHub-Event")
    if event_name == "ping":
        return JSONResponse(status_code=status.HTTP_200_OK, content={"ok": True})

    if event_name != "push":
        return JSONResponse(status_code=status.HTTP_200_OK, content={"ok": True})

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        ) from exc

    expected_ref = f"refs/heads/{project.source_branch}"
    if payload.get("ref") != expected_ref:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Push is not for the configured source branch",
        )

    markdown_files = _collect_markdown_files(payload)
    if not markdown_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No translatable files in this push",
        )

    markdown_files, skipped_files = _apply_exclude_patterns(
        markdown_files,
        project.exclude_patterns,
    )

    active_tasks_by_path: dict[str, Task] = {}
    if markdown_files:
        active_tasks = (
            await session.scalars(
                select(Task).where(
                    Task.project_id == project.id,
                    Task.file_path.in_(markdown_files),
                    Task.status.in_(ACTIVE_TASK_STATUSES),
                )
            )
        ).all()
        active_tasks_by_path = {task.file_path: task for task in active_tasks}

    files_to_process: list[str] = []
    for file_path in markdown_files:
        existing_task = active_tasks_by_path.get(file_path)
        if existing_task is None:
            files_to_process.append(file_path)
            continue

        skipped_files.append(
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

    if not files_to_process and skipped_files:
        return {"created": 0, "task_ids": [], "skipped": skipped_files}

    owner = await _get_project_owner(session, project)
    if not owner.github_linked or not owner.github_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub account is not linked",
        )

    try:
        access_token = decrypt_github_access_token(owner.github_access_token)
    except InvalidToken:
        logger.error("webhook_token_decrypt_failed", extra={"project_id": str(project.id)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GitHub access token is corrupted — please re-link your GitHub account",
        ) from None
    github_client = GitHubClient(access_token)
    before_sha: str | None = payload.get("before") or None
    commit_message = None
    commit_author_name = None
    commit_author_login = None
    head_commit = payload.get("head_commit")
    if isinstance(head_commit, dict):
        message = head_commit.get("message")
        if isinstance(message, str):
            commit_message = message
        author = head_commit.get("author")
        if isinstance(author, dict):
            author_name = author.get("name")
            if isinstance(author_name, str):
                commit_author_name = author_name
            author_login = author.get("username")
            if isinstance(author_login, str):
                commit_author_login = author_login
    sender = payload.get("sender")
    if isinstance(sender, dict):
        sender_login = sender.get("login")
        if isinstance(sender_login, str):
            commit_author_login = sender_login

    # Bulk protection: too many files → create CommitGroup for manual confirmation
    if len(files_to_process) > project.webhook_file_limit:
        commit_group = CommitGroup(
            project_id=project.id,
            user_id=owner.id,
            team_id=project.team_id,
            github_sha=payload.get("after"),
            github_ref=str(payload["ref"]),
            commit_message=commit_message,
            commit_author_name=commit_author_name,
            commit_author_login=commit_author_login,
            file_paths=files_to_process,
            status="pending_confirmation",
        )
        session.add(commit_group)
        await session.commit()
        task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_created")
        logger.info(
            "webhook_bulk_commit_group_created",
            extra={"project_id": str(project.id), "files_count": len(files_to_process)},
        )
        return {
            "created": 0,
            "task_ids": [],
            "skipped": skipped_files,
            "commit_group_id": str(commit_group.id),
            "commit_group_status": "pending_confirmation",
        }

    try:
        fetched = await asyncio.gather(
            *[_fetch_file_metadata_safe(github_client, project, fp) for fp in files_to_process]
        )
    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception as exc:
        logger.exception(
            "webhook_fetch_unexpected_error",
            extra={"project_id": str(project.id), "exc_type": type(exc).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error fetching files: {type(exc).__name__}: {exc}",
        ) from exc

    previous_task_by_path = await _get_previous_task_ids(session, project.id, files_to_process)

    tasks_to_create: list[Task] = [
        Task(
            user_id=owner.id,
            project_id=project.id,
            team_id=project.team_id,
            file_path=file_path,
            github_ref=str(payload["ref"]),
            github_sha=payload.get("after"),
            commit_message=commit_message,
            commit_author_name=commit_author_name,
            commit_author_login=commit_author_login,
            source_file_sha=source_file_sha,
            target_file_sha=target_file_sha,
            original_content=original_content,
            status="queued",
            before_sha=before_sha,
            previous_task_id=previous_task_by_path.get(file_path),
        )
        for file_path, original_content, source_file_sha, target_file_sha in fetched
    ]

    try:
        session.add_all(tasks_to_create)
        await session.commit()
    except Exception as exc:
        logger.exception(
            "webhook_commit_failed",
            extra={"project_id": str(project.id), "exc_type": type(exc).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save tasks: {type(exc).__name__}: {exc}",
        ) from exc

    for task in tasks_to_create:
        task_list_events.publish_task_entered_scope(task)
    for task in tasks_to_create:
        await pipeline_runner.schedule_task(task.id)

    logger.info(
        "webhook_processed",
        extra={
            "project_id": str(project.id),
            "created_count": len(tasks_to_create),
            "skipped_count": len(skipped_files),
        },
    )
    return {
        "created": len(tasks_to_create),
        "task_ids": [task.id for task in tasks_to_create],
        "skipped": skipped_files,
    }
