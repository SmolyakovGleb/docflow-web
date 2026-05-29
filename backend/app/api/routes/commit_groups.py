from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.commit_group import CommitGroup
from app.models.user import User
from app.schemas.commit_group import CommitGroupListResponse, CommitGroupRead
from app.services import task_list_events
from app.services.auth import decrypt_github_access_token, get_current_user
from app.services.commit_groups import confirm_commit_group, list_commit_groups
from app.services.github import GitHubClient
from app.services.projects import _get_user_team_id

router = APIRouter(prefix="/commit-groups", tags=["commit-groups"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_group_or_404(session: AsyncSession, group_id: UUID, user: User) -> CommitGroup:
    group = await session.get(CommitGroup, group_id)
    if group is None or group.user_id != user.id:
        raise HTTPException(status_code=404, detail="Commit group not found")
    return group


@router.get("", response_model=CommitGroupListResponse)
async def get_commit_groups(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> CommitGroupListResponse:
    team_id = await _get_user_team_id(session, current_user.id)
    items, total = await list_commit_groups(
        session,
        user_id=current_user.id,
        team_id=team_id,
        project_id=project_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return CommitGroupListResponse(
        items=[CommitGroupRead.model_validate(g) for g in items],
        total=total,
    )


@router.post("/{group_id}/confirm", status_code=202)
async def confirm_group_route(
    group_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> dict:
    group = await _get_group_or_404(session, group_id, current_user)
    if group.status != "pending_confirmation":
        raise HTTPException(
            status_code=400, detail=f"Cannot confirm group with status '{group.status}'"
        )
    if not current_user.github_linked or not current_user.github_access_token:
        raise HTTPException(status_code=400, detail="GitHub account is not linked")

    access_token = decrypt_github_access_token(current_user.github_access_token)
    github_client = GitHubClient(access_token)
    await session.refresh(group, ["project"])
    tasks = await confirm_commit_group(session, group, current_user, github_client)
    return {"created": len(tasks), "task_ids": [str(t.id) for t in tasks]}


@router.delete("/{group_id}", status_code=204)
async def cancel_group_route(
    group_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> None:
    group = await _get_group_or_404(session, group_id, current_user)
    if group.status != "pending_confirmation":
        raise HTTPException(
            status_code=400, detail=f"Cannot cancel group with status '{group.status}'"
        )
    group.status = "cancelled"
    await session.commit()
    task_list_events.publish_commit_group_event(group, event_type="commit_group_updated")
