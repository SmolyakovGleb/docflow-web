from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated, Any
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services import pipeline_runner
from app.services import task_list_events
from app.services.auth import decrypt_github_access_token, decrypt_webhook_secret
from app.services.github import GitHubAPIError, GitHubClient
from app.services.tasks import _apply_exclude_patterns
from app.services.webhook import is_valid_github_signature

router = APIRouter(tags=["webhook"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
ACTIVE_TASK_STATUSES = ("queued", "running")
logger = logging.getLogger(__name__)


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
        "**Возможные `skipped.reason`:** `already_queued`, `pipeline_running`, `excluded_by_pattern`."
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
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Payload too large")
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
        )
    github_client = GitHubClient(access_token)
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

    async def _fetch_file_metadata(file_path: str):
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

    try:
        fetched = await asyncio.gather(
            *[_fetch_file_metadata(fp) for fp in files_to_process]
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

    tasks_to_create: list[Task] = [
        Task(
            user_id=owner.id,
            project_id=project.id,
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
