from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commit_group import CommitGroup
from app.models.task import Task
from app.models.user import User
from app.services import pipeline_runner, task_list_events
from app.services.github import GitHubClient


async def list_commit_groups(
    session: AsyncSession,
    *,
    user_id: UUID,
    team_id: UUID | None,
    project_id: UUID | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[CommitGroup], int]:
    q = select(CommitGroup).where(
        (CommitGroup.user_id == user_id)
        if team_id is None
        else (CommitGroup.user_id == user_id) | (CommitGroup.team_id == team_id)
    )
    if project_id:
        q = q.where(CommitGroup.project_id == project_id)
    if status:
        q = q.where(CommitGroup.status == status)
    q = q.order_by(CommitGroup.created_at.desc())
    total = (await session.scalar(
        select(func.count()).select_from(q.subquery())
    )) or 0
    items = (await session.scalars(q.offset(offset).limit(limit))).all()
    return list(items), total


async def confirm_commit_group(
    session: AsyncSession,
    commit_group: CommitGroup,
    owner: User,
    github_client: GitHubClient,
) -> list[Task]:
    from app.api.routes.webhook import _fetch_file_metadata_safe, _get_previous_task_ids

    commit_group.status = "processing"
    commit_group.confirmed_at = datetime.now(UTC)
    await session.commit()
    task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_updated")

    active_tasks = (await session.scalars(
        select(Task).where(
            Task.project_id == commit_group.project_id,
            Task.file_path.in_(commit_group.file_paths),
            Task.status.in_(("queued", "running")),
        )
    )).all()
    active_by_path = {t.file_path: t for t in active_tasks}
    to_process = [fp for fp in commit_group.file_paths if fp not in active_by_path]

    project = commit_group.project
    try:
        fetched = await asyncio.gather(*[
            _fetch_file_metadata_safe(github_client, project, fp) for fp in to_process
        ])
    except Exception:
        commit_group.status = "pending_confirmation"
        commit_group.confirmed_at = None
        await session.commit()
        task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_updated")
        raise

    previous_task_by_path = await _get_previous_task_ids(
        session, commit_group.project_id, to_process
    )

    tasks_to_create = [
        Task(
            user_id=owner.id,
            project_id=commit_group.project_id,
            team_id=commit_group.team_id,
            commit_group_id=commit_group.id,
            file_path=fp,
            github_ref=commit_group.github_ref,
            github_sha=commit_group.github_sha,
            commit_message=commit_group.commit_message,
            commit_author_name=commit_group.commit_author_name,
            commit_author_login=commit_group.commit_author_login,
            source_file_sha=source_sha,
            target_file_sha=target_sha,
            original_content=content,
            status="queued",
            before_sha=commit_group.before_sha,
            previous_task_id=previous_task_by_path.get(fp),
        )
        for fp, content, source_sha, target_sha in fetched
    ]

    session.add_all(tasks_to_create)
    commit_group.status = "done"
    await session.commit()
    task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_updated")

    for task in tasks_to_create:
        task_list_events.publish_task_entered_scope(task)
        await pipeline_runner.schedule_task(task.id)

    return tasks_to_create
