from __future__ import annotations

import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectCreateResponse, ProjectRead, ProjectUpdate
from app.services.auth import encrypt_webhook_secret, get_current_user
from app.services.projects import ensure_github_linked, get_project_or_404

router = APIRouter(prefix="/projects", tags=["projects"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get(
    "",
    response_model=list[ProjectRead],
    summary="Список проектов",
    description="Возвращает все проекты текущего пользователя, отсортированные по дате создания (новые первые). `webhook_secret` в ответе отсутствует.",
)
async def get_projects(session: DbSession, current_user: CurrentUser) -> list[Project]:
    result = await session.scalars(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    return list(result.all())


@router.post(
    "",
    response_model=ProjectCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создать проект",
    description=(
        "Создаёт пару source/target репозиториев и генерирует `webhook_secret`. "
        "`webhook_secret` возвращается **только здесь** — сохраните его для настройки GitHub Webhook. "
        "`source_repo` и `target_repo` должны быть в формате `owner/repo`. "
        "Требует привязанный GitHub-аккаунт."
    ),
    responses={
        201: {"description": "Проект создан, `webhook_secret` в ответе"},
        400: {"description": "GitHub-аккаунт не привязан или невалидный формат репо"},
        422: {"description": "Ошибка валидации полей"},
    },
)
async def create_project(
    payload: ProjectCreate,
    session: DbSession,
    current_user: CurrentUser,
) -> ProjectCreateResponse:
    ensure_github_linked(current_user)

    plaintext_secret = secrets.token_hex(32)
    project = Project(
        user_id=current_user.id,
        name=payload.name,
        source_repo=payload.source_repo,
        source_branch=payload.source_branch,
        target_repo=payload.target_repo,
        target_branch=payload.target_branch,
        webhook_secret=encrypt_webhook_secret(plaintext_secret),
        exclude_patterns=payload.exclude_patterns,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)

    response = ProjectCreateResponse.model_validate(project)
    response.webhook_secret = plaintext_secret
    return response


@router.get(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Детали проекта",
    responses={
        200: {"description": "Проект найден"},
        404: {"description": "Проект не найден или не принадлежит текущему пользователю"},
    },
)
async def get_project(project_id: UUID, session: DbSession, current_user: CurrentUser) -> Project:
    return await get_project_or_404(session, project_id, current_user)


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    summary="Обновить проект",
    description="Частичное обновление: передавайте только изменяемые поля. `source_repo` и `target_repo` изменить нельзя.",
    responses={
        200: {"description": "Проект обновлён"},
        404: {"description": "Проект не найден или не принадлежит текущему пользователю"},
    },
)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    session: DbSession,
    current_user: CurrentUser,
) -> Project:
    project = await get_project_or_404(session, project_id, current_user)
    expected_version = project.version
    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return project

    result = await session.execute(
        update(Project)
        .where(Project.id == project.id, Project.version == expected_version)
        .values(**changes, version=expected_version + 1)
    )
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project was modified concurrently; refresh and retry",
        )
    await session.commit()
    await session.refresh(project)
    return project


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить проект",
    description="Удаляет проект. Связанные задачи сохраняются (`project_id` → `null`).",
    responses={
        204: {"description": "Проект удалён"},
        404: {"description": "Проект не найден или не принадлежит текущему пользователю"},
    },
)
async def delete_project(
    project_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> Response:
    project = await get_project_or_404(session, project_id, current_user)
    await session.delete(project)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
