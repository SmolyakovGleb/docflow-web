from __future__ import annotations

import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectCreateResponse, ProjectRead, ProjectUpdate
from app.services.auth import get_current_user
from app.services.projects import ensure_github_linked, get_project_or_404

router = APIRouter(prefix="/projects", tags=["projects"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=list[ProjectRead])
async def get_projects(session: DbSession, current_user: CurrentUser) -> list[Project]:
    result = await session.scalars(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    return list(result.all())


@router.post("", response_model=ProjectCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    session: DbSession,
    current_user: CurrentUser,
) -> Project:
    ensure_github_linked(current_user)

    project = Project(
        user_id=current_user.id,
        name=payload.name,
        source_repo=payload.source_repo,
        source_branch=payload.source_branch,
        target_repo=payload.target_repo,
        target_branch=payload.target_branch,
        webhook_secret=secrets.token_hex(32),
        exclude_patterns=payload.exclude_patterns,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: UUID, session: DbSession, current_user: CurrentUser) -> Project:
    return await get_project_or_404(session, project_id, current_user)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    session: DbSession,
    current_user: CurrentUser,
) -> Project:
    project = await get_project_or_404(session, project_id, current_user)

    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field_name, value)

    await session.commit()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> Response:
    project = await get_project_or_404(session, project_id, current_user)
    await session.delete(project)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
