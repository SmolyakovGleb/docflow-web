from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db_session
from app.models.dictionary_entry import DictionaryEntry
from app.models.invite_token import InviteToken
from app.models.notification_channel import NotificationChannel
from app.models.project import Project
from app.models.publication import Publication
from app.models.task import Task
from app.models.user import User
from app.schemas.admin import (
    AdminTaskListResponse,
    AdminTaskRead,
    AdminUserRead,
    AdminUserUpdate,
    InviteTokenCreate,
    InviteTokenRead,
    InviteTokenStatus,
)
from app.services.auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
AdminUser = Annotated[User, Depends(require_admin)]
logger = logging.getLogger(__name__)


def _token_status(token: InviteToken) -> InviteTokenStatus:
    if token.used_by_id is not None:
        return "used"
    if token.expires_at is not None and token.expires_at <= datetime.now(timezone.utc):
        return "expired"
    return "active"


def _to_invite_read(token: InviteToken) -> InviteTokenRead:
    return InviteTokenRead(
        id=token.id,
        token=token.token,
        created_by_email=token.created_by.email,
        used_by_email=token.used_by.email if token.used_by else None,
        expires_at=token.expires_at,
        created_at=token.created_at,
        status=_token_status(token),
    )


def _to_admin_user_read(user: User, task_count: int) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        github_linked=user.github_linked,
        is_admin=user.is_admin,
        task_count=task_count,
        created_at=user.created_at,
        invite_token_id=user.invite_token_id,
    )


def _to_admin_task_read(task: Task) -> AdminTaskRead:
    return AdminTaskRead(
        id=task.id,
        file_path=task.file_path,
        status=task.status,
        created_at=task.created_at,
        updated_at=task.updated_at,
        user_id=task.user_id,
        user_email=task.user.email,
        project_id=task.project_id,
        project_name=task.project_name,
    )


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserRead], summary="Все пользователи")
async def list_users(session: DbSession, _: AdminUser) -> list[AdminUserRead]:
    users = (await session.scalars(select(User).order_by(User.created_at))).all()

    task_counts_rows = (
        await session.execute(
            select(Task.user_id, func.count(Task.id).label("cnt"))
            .group_by(Task.user_id)
        )
    ).all()
    task_counts = {row.user_id: row.cnt for row in task_counts_rows}

    return [_to_admin_user_read(u, task_counts.get(u.id, 0)) for u in users]


@router.patch("/users/{user_id}", response_model=AdminUserRead, summary="Обновить роль")
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    session: DbSession,
    current_admin: AdminUser,
) -> AdminUserRead:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_admin.id and not payload.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove admin from yourself",
        )
    user.is_admin = payload.is_admin
    await session.commit()
    await session.refresh(user)

    task_count = await session.scalar(
        select(func.count(Task.id)).where(Task.user_id == user.id)
    ) or 0
    logger.info(
        "admin_user_updated",
        extra={"target_user_id": str(user_id), "is_admin": payload.is_admin},
    )
    return _to_admin_user_read(user, task_count)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить пользователя",
)
async def delete_user(
    user_id: UUID,
    session: DbSession,
    current_admin: AdminUser,
) -> None:
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Delete in FK-safe order to avoid constraint violations.
    # 1. Publications for user's own tasks
    user_task_ids = select(Task.id).where(Task.user_id == user_id)
    await session.execute(delete(Publication).where(Publication.task_id.in_(user_task_ids)))
    # 2. Publications this user made on other people's tasks
    await session.execute(delete(Publication).where(Publication.published_by == user_id))
    # 3. Tasks
    await session.execute(delete(Task).where(Task.user_id == user_id))
    # 4. Projects (tasks already removed; tasks.project_id has SET NULL but is moot now)
    await session.execute(delete(Project).where(Project.user_id == user_id))
    # 5. Notification channels
    await session.execute(
        delete(NotificationChannel).where(NotificationChannel.created_by == user_id)
    )
    # 6. Dictionary entries: null out updated_by refs, then delete owned entries
    await session.execute(
        update(DictionaryEntry)
        .where(DictionaryEntry.updated_by == user_id)
        .values(updated_by=None)
    )
    await session.execute(delete(DictionaryEntry).where(DictionaryEntry.created_by == user_id))
    # 7. User (invite_tokens.created_by_id CASCADE, used_by_id SET NULL automatically)
    await session.delete(user)
    await session.commit()
    logger.info("admin_user_deleted", extra={"target_user_id": str(user_id)})


# ── Invite tokens ─────────────────────────────────────────────────────────────

@router.get("/invite-tokens", response_model=list[InviteTokenRead], summary="Список инвайтов")
async def list_invite_tokens(session: DbSession, _: AdminUser) -> list[InviteTokenRead]:
    tokens = (
        await session.scalars(
            select(InviteToken)
            .options(selectinload(InviteToken.created_by), selectinload(InviteToken.used_by))
            .order_by(InviteToken.created_at.desc())
        )
    ).all()
    return [_to_invite_read(t) for t in tokens]


@router.post(
    "/invite-tokens",
    response_model=InviteTokenRead,
    status_code=status.HTTP_201_CREATED,
    summary="Создать инвайт",
)
async def create_invite_token(
    payload: InviteTokenCreate,
    session: DbSession,
    current_admin: AdminUser,
) -> InviteTokenRead:
    expires_at = None
    if payload.expires_in_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)

    token = InviteToken(
        created_by_id=current_admin.id,
        expires_at=expires_at,
    )
    session.add(token)
    await session.commit()
    await session.refresh(token)

    token_with_relations = await session.scalar(
        select(InviteToken)
        .options(selectinload(InviteToken.created_by), selectinload(InviteToken.used_by))
        .where(InviteToken.id == token.id)
    )
    logger.info("invite_token_created", extra={"token_id": str(token.id)})
    return _to_invite_read(token_with_relations)  # type: ignore[arg-type]


@router.delete(
    "/invite-tokens/{token_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отозвать инвайт",
)
async def revoke_invite_token(token_id: UUID, session: DbSession, _: AdminUser) -> None:
    token = await session.get(InviteToken, token_id)
    if token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    if token.used_by_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke a token that has already been used",
        )
    token.expires_at = datetime.now(timezone.utc)
    await session.commit()
    logger.info("invite_token_revoked", extra={"token_id": str(token_id)})


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=AdminTaskListResponse, summary="Все задачи")
async def list_all_tasks(
    session: DbSession,
    _: AdminUser,
    user_id: UUID | None = Query(None),
    task_status: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AdminTaskListResponse:
    query = (
        select(Task)
        .options(selectinload(Task.user), selectinload(Task.project))
    )
    if user_id is not None:
        query = query.where(Task.user_id == user_id)
    if task_status is not None:
        query = query.where(Task.status == task_status)

    total = await session.scalar(
        select(func.count()).select_from(query.subquery())
    ) or 0

    tasks = (
        await session.scalars(
            query.order_by(Task.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()

    return AdminTaskListResponse(
        items=[_to_admin_task_read(t) for t in tasks],
        total=total,
    )
