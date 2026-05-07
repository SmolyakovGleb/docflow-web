from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.publication import Publication
from app.models.task import Task
from app.models.user import User


def normalize_repo_name(repo_name: str) -> str:
    return repo_name.strip().lower()


async def get_visible_source_repos(
    session: AsyncSession,
    current_user: User,
) -> set[str]:
    source_repos = await session.scalars(
        select(Project.source_repo).where(Project.user_id == current_user.id)
    )
    return {normalize_repo_name(repo_name) for repo_name in source_repos.all()}


def apply_source_repo_filter(query, visible_source_repos: set[str]):
    if visible_source_repos:
        return query.where(func.lower(Project.source_repo).in_(visible_source_repos))
    return query.where(False)


def apply_history_filters(
    query,
    *,
    visible_source_repos: set[str],
    project_id: UUID | None,
    published_by: UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    query = query.join(Task, Publication.task_id == Task.id).join(Project, Task.project_id == Project.id)
    query = apply_source_repo_filter(query, visible_source_repos)

    if project_id is not None:
        query = query.where(Task.project_id == project_id)
    if published_by is not None:
        query = query.where(Publication.published_by == published_by)
    if date_from is not None:
        query = query.where(Publication.published_at >= date_from)
    if date_to is not None:
        query = query.where(Publication.published_at <= date_to)
    return query


def extract_error_type(error_text: str) -> str:
    lines = [line.strip() for line in error_text.splitlines() if line.strip()]
    if not lines:
        return "UnknownError"

    last_line = lines[-1]
    error_name = last_line.partition(":")[0].strip()
    if not error_name:
        return "UnknownError"
    return error_name.split(".")[-1] or "UnknownError"


async def get_visible_project_or_404(
    session: AsyncSession,
    project_id: UUID,
    visible_source_repos: set[str],
) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if normalize_repo_name(project.source_repo) not in visible_source_repos:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    return project
