from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.webhook import _get_project_owner
from app.db.session import get_db_session
from app.models.commit_group import CommitGroup
from app.models.user import User
from app.schemas.commit_group import CommitGroupListResponse, CommitGroupRead
from app.services import task_list_events
from app.services import github_app
from app.services.auth import decrypt_github_access_token, get_current_user
from app.services.commit_groups import confirm_commit_group, list_commit_groups
from app.services.github import GitHubClient
from app.services.projects import _get_user_team_id

router = APIRouter(prefix="/commit-groups", tags=["commit-groups"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_group_or_404(session: AsyncSession, group_id: UUID, user: User) -> CommitGroup:
    group = await session.get(CommitGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Commit group not found")
    if group.user_id != user.id:
        # A team member may act on a group that belongs to their team.
        team_id = await _get_user_team_id(session, user.id)
        if team_id is None or group.team_id != team_id:
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

    await session.refresh(group, ["project"])
    # Tasks always run with the project owner's GitHub token, so a team member
    # can confirm a group even if their own GitHub account is not linked.
    owner = await _get_project_owner(session, group.project)
    installation_token = await github_app.installation_token_for_repo(
        session, group.project.source_repo
    )
    if installation_token is not None:
        github_client = GitHubClient(installation_token)
    else:
        if not owner.github_linked or not owner.github_access_token:
            raise HTTPException(status_code=400, detail="GitHub account is not linked")
        github_client = GitHubClient(decrypt_github_access_token(owner.github_access_token))
    tasks = await confirm_commit_group(session, group, owner, github_client)
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
