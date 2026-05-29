from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.user import User

logger = logging.getLogger(__name__)


def ensure_github_linked(user: User) -> None:
    if user.github_linked:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="GitHub account is not linked",
    )


async def _get_user_team_id(session: AsyncSession, user_id: UUID) -> UUID | None:
    from app.models.team import TeamMember
    m = await session.scalar(select(TeamMember).where(TeamMember.user_id == user_id))
    return m.team_id if m is not None else None


async def get_project_or_404(
    session: AsyncSession,
    project_id: UUID,
    current_user: User,
) -> Project:
    """Owner-only access — use for write operations."""
    project = await session.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    if project is not None:
        return project

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Project not found",
    )


async def get_project_visible_or_404(
    session: AsyncSession,
    project_id: UUID,
    current_user: User,
) -> Project:
    """Owner OR team member access — use for read operations."""
    team_id = await _get_user_team_id(session, current_user.id)

    logger.info(
        "get_project_visible_or_404",
        extra={
            "project_id": str(project_id),
            "user_id": str(current_user.id),
            "team_id": str(team_id),
        },
    )

    if team_id is not None:
        cond = or_(Project.user_id == current_user.id, Project.team_id == team_id)
    else:
        cond = Project.user_id == current_user.id

    project = await session.scalar(select(Project).where(Project.id == project_id, cond))
    if project is not None:
        return project

    logger.warning(
        "get_project_visible_or_404 not found",
        extra={
            "project_id": str(project_id),
            "user_id": str(current_user.id),
            "team_id": str(team_id),
        },
    )
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Project not found",
    )
