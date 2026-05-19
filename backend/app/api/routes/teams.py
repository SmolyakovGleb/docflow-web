from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db_session
from app.models.team import Team, TeamInvite, TeamMember
from app.models.user import User
from app.schemas.team import (
    TeamCreate,
    TeamDetail,
    TeamInviteCreate,
    TeamInvitePreviewRead,
    TeamInviteRead,
    TeamInviteStatus,
    TeamJoin,
    TeamMemberRead,
    TeamRename,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/teams", tags=["teams"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)


async def _load_team_full(session: AsyncSession, team_id: uuid.UUID) -> Team:
    team = await session.scalar(
        select(Team)
        .options(selectinload(Team.members).selectinload(TeamMember.user))
        .where(Team.id == team_id)
    )
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


def _invite_status(invite: TeamInvite) -> TeamInviteStatus:
    if invite.used_by_id is not None:
        return "used"
    if invite.expires_at is not None and invite.expires_at <= datetime.now(timezone.utc):
        return "expired"
    return "active"


def _to_invite_read(invite: TeamInvite) -> TeamInviteRead:
    return TeamInviteRead(
        id=invite.id,
        token=invite.token,
        created_by_email=invite.creator.email,
        used_by_email=invite.used_by.email if invite.used_by else None,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
        status=_invite_status(invite),
    )


def _to_team_detail(team: Team) -> TeamDetail:
    members = [
        TeamMemberRead(
            user_id=member.user_id,
            email=member.user.email,
            display_name=member.user.display_name,
            github_linked=member.user.github_linked,
            joined_at=member.joined_at,
            role="owner" if member.user_id == team.owner_id else "member",
        )
        for member in team.members
    ]
    return TeamDetail(
        id=team.id,
        name=team.name,
        owner_id=team.owner_id,
        created_at=team.created_at,
        member_count=len(team.members),
        members=members,
    )


async def _get_membership(session: AsyncSession, user_id: uuid.UUID) -> TeamMember | None:
    return await session.scalar(select(TeamMember).where(TeamMember.user_id == user_id))


async def _get_active_invite(session: AsyncSession, token: UUID) -> TeamInvite | None:
    now = datetime.now(timezone.utc)
    return await session.scalar(
        select(TeamInvite)
        .where(
            TeamInvite.token == token,
            TeamInvite.used_by_id.is_(None),
            (TeamInvite.expires_at.is_(None)) | (TeamInvite.expires_at > now),
        )
    )


async def _require_member(session: AsyncSession, user_id: uuid.UUID) -> TeamMember:
    membership = await _get_membership(session, user_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not in a team")
    return membership


def _require_owner(team: Team, user_id: uuid.UUID) -> None:
    if team.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner access required")


@router.post("", response_model=TeamDetail, status_code=status.HTTP_201_CREATED, summary="Создать команду")
async def create_team(payload: TeamCreate, session: DbSession, current_user: CurrentUser) -> TeamDetail:
    existing = await _get_membership(session, current_user.id)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in a team")

    team = Team(name=payload.name, owner_id=current_user.id)
    session.add(team)
    await session.flush()

    session.add(TeamMember(team_id=team.id, user_id=current_user.id))
    await session.commit()

    team_full = await _load_team_full(session, team.id)
    logger.info("team_created", extra={"team_id": str(team.id), "owner_id": str(current_user.id)})
    return _to_team_detail(team_full)


@router.get("/me", response_model=TeamDetail, summary="Моя команда")
async def get_my_team(session: DbSession, current_user: CurrentUser) -> TeamDetail:
    membership = await _require_member(session, current_user.id)
    team = await _load_team_full(session, membership.team_id)
    return _to_team_detail(team)


@router.patch("/me", response_model=TeamDetail, summary="Переименовать команду")
async def rename_team(payload: TeamRename, session: DbSession, current_user: CurrentUser) -> TeamDetail:
    membership = await _require_member(session, current_user.id)
    team = await _load_team_full(session, membership.team_id)
    _require_owner(team, current_user.id)

    team.name = payload.name
    await session.commit()

    team_full = await _load_team_full(session, team.id)
    logger.info("team_renamed", extra={"team_id": str(team.id)})
    return _to_team_detail(team_full)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить команду")
async def delete_team(session: DbSession, current_user: CurrentUser) -> None:
    membership = await _require_member(session, current_user.id)
    team = await session.get(Team, membership.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    _require_owner(team, current_user.id)

    await session.delete(team)
    await session.commit()
    logger.info("team_deleted", extra={"team_id": str(team.id)})


@router.delete("/me/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Исключить участника")
async def remove_member(
    target_user_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> None:
    membership = await _require_member(session, current_user.id)
    team = await session.get(Team, membership.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    _require_owner(team, current_user.id)

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot remove themselves; delete the team instead",
        )
    if target_user_id == team.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the team owner")

    target_membership = await session.scalar(
        select(TeamMember).where(TeamMember.team_id == team.id, TeamMember.user_id == target_user_id)
    )
    if target_membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await session.delete(target_membership)
    await session.commit()
    logger.info("team_member_removed", extra={"team_id": str(team.id), "user_id": str(target_user_id)})


@router.post("/me/leave", status_code=status.HTTP_204_NO_CONTENT, summary="Покинуть команду")
async def leave_team(session: DbSession, current_user: CurrentUser) -> None:
    membership = await _require_member(session, current_user.id)
    team = await session.get(Team, membership.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if team.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot leave the team; delete it instead",
        )

    await session.delete(membership)
    await session.commit()
    logger.info("team_left", extra={"team_id": str(team.id), "user_id": str(current_user.id)})


@router.get("/me/invites", response_model=list[TeamInviteRead], summary="Список приглашений")
async def list_invites(session: DbSession, current_user: CurrentUser) -> list[TeamInviteRead]:
    membership = await _require_member(session, current_user.id)
    team = await session.get(Team, membership.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    _require_owner(team, current_user.id)

    invites = (
        await session.scalars(
            select(TeamInvite)
            .options(selectinload(TeamInvite.creator), selectinload(TeamInvite.used_by))
            .where(TeamInvite.team_id == team.id)
            .order_by(TeamInvite.created_at.desc())
        )
    ).all()
    return [_to_invite_read(invite) for invite in invites]


@router.post(
    "/me/invites",
    response_model=TeamInviteRead,
    status_code=status.HTTP_201_CREATED,
    summary="Создать приглашение",
)
async def create_invite(
    payload: TeamInviteCreate,
    session: DbSession,
    current_user: CurrentUser,
) -> TeamInviteRead:
    membership = await _require_member(session, current_user.id)
    team = await session.get(Team, membership.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    _require_owner(team, current_user.id)

    expires_at = None
    if payload.expires_in_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)

    invite = TeamInvite(team_id=team.id, created_by=current_user.id, expires_at=expires_at)
    session.add(invite)
    await session.commit()

    invite_full = await session.scalar(
        select(TeamInvite)
        .options(selectinload(TeamInvite.creator), selectinload(TeamInvite.used_by))
        .where(TeamInvite.id == invite.id)
    )
    logger.info("team_invite_created", extra={"team_id": str(team.id), "invite_id": str(invite.id)})
    return _to_invite_read(invite_full)  # type: ignore[arg-type]


@router.delete(
    "/me/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отозвать приглашение",
)
async def revoke_invite(invite_id: UUID, session: DbSession, current_user: CurrentUser) -> None:
    membership = await _require_member(session, current_user.id)
    team = await session.get(Team, membership.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    _require_owner(team, current_user.id)

    invite = await session.get(TeamInvite, invite_id)
    if invite is None or invite.team_id != team.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.used_by_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke an already used invite",
        )

    invite.expires_at = datetime.now(timezone.utc)
    await session.commit()
    logger.info("team_invite_revoked", extra={"invite_id": str(invite_id)})


@router.get(
    "/invite-preview",
    response_model=TeamInvitePreviewRead,
    summary="Получить превью приглашения в команду",
)
async def get_invite_preview(token: UUID, session: DbSession) -> TeamInvitePreviewRead:
    invite = await _get_active_invite(session, token)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invite token",
        )

    team = await _load_team_full(session, invite.team_id)
    return TeamInvitePreviewRead(
        team_name=team.name,
        member_count=len(team.members),
    )


@router.post("/join", response_model=TeamDetail, summary="Вступить в команду по приглашению")
async def join_team(payload: TeamJoin, session: DbSession, current_user: CurrentUser) -> TeamDetail:
    existing = await _get_membership(session, current_user.id)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in a team")

    invite = await _get_active_invite(session, payload.token)
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invite token",
        )

    invite.used_by_id = current_user.id
    session.add(TeamMember(team_id=invite.team_id, user_id=current_user.id))
    await session.commit()

    team = await _load_team_full(session, invite.team_id)
    logger.info("team_joined", extra={"team_id": str(invite.team_id), "user_id": str(current_user.id)})
    return _to_team_detail(team)
