from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.user import User


def ensure_github_linked(user: User) -> None:
    if user.github_linked:
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="GitHub account is not linked",
    )


async def get_project_or_404(
    session: AsyncSession,
    project_id: UUID,
    current_user: User,
) -> Project:
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
