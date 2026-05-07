from __future__ import annotations

import json
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services import pipeline_runner
from app.services.auth import decrypt_github_access_token
from app.services.github import GitHubAPIError, GitHubClient
from app.services.tasks import _apply_exclude_patterns
from app.services.webhook import is_valid_github_signature

router = APIRouter(tags=["webhook"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
ACTIVE_TASK_STATUSES = ("queued", "running")


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


@router.post("/webhook/{project_id}", status_code=status.HTTP_202_ACCEPTED)
async def github_webhook(
    project_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    session: DbSession,
) -> dict[str, Any]:
    raw_body = await request.body()
    project = await _get_project_or_404(session, project_id)

    signature = request.headers.get("X-Hub-Signature-256")
    if not is_valid_github_signature(project.webhook_secret, raw_body, signature):
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

    github_client = GitHubClient(decrypt_github_access_token(owner.github_access_token))
    tasks_to_create: list[Task] = []
    commit_message = None
    head_commit = payload.get("head_commit")
    if isinstance(head_commit, dict):
        message = head_commit.get("message")
        if isinstance(message, str):
            commit_message = message

    try:
        for file_path in files_to_process:
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
            tasks_to_create.append(
                Task(
                    project_id=project.id,
                    file_path=file_path,
                    github_ref=str(payload["ref"]),
                    github_sha=payload.get("after"),
                    commit_message=commit_message,
                    source_file_sha=source_file_sha,
                    target_file_sha=target_file_sha,
                    original_content=original_content,
                    status="queued",
                )
            )
    except GitHubAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from None

    session.add_all(tasks_to_create)
    await session.commit()
    for task in tasks_to_create:
        background_tasks.add_task(pipeline_runner.run_task, task.id)

    return {
        "created": len(tasks_to_create),
        "task_ids": [task.id for task in tasks_to_create],
        "skipped": skipped_files,
    }
