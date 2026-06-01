"""Route-level tests for CommitGroup confirm/cancel, focused on team access."""
from __future__ import annotations

import secrets

from sqlalchemy import select

from app.models.commit_group import CommitGroup
from app.models.project import Project
from app.models.task import Task
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services.auth import (
    encrypt_github_access_token,
    encrypt_webhook_secret,
    hash_password,
)


async def _create_user(db_session, email: str, *, github: bool = False) -> User:
    user = User(
        email=email,
        password_hash=hash_password("testpassword"),
        display_name=email.split("@")[0],
    )
    if github:
        user.github_id = secrets.randbits(31)
        user.github_login = email.split("@")[0]
        user.github_access_token = encrypt_github_access_token("github-token")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_team_with_member(db_session, owner: User, member: User) -> Team:
    team = Team(name="Team", owner_id=owner.id)
    db_session.add(team)
    await db_session.flush()
    db_session.add(TeamMember(team_id=team.id, user_id=owner.id))
    db_session.add(TeamMember(team_id=team.id, user_id=member.id))
    await db_session.commit()
    await db_session.refresh(team)
    return team


async def _create_project(db_session, owner: User, team: Team | None) -> Project:
    project = Project(
        user_id=owner.id,
        team_id=team.id if team else None,
        name="Proj",
        source_repo="org/source",
        source_branch="main",
        target_repo="org/target",
        target_branch="main",
        webhook_secret=encrypt_webhook_secret(secrets.token_hex(32)),
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project


async def _create_group(
    db_session, project: Project, owner: User, team: Team | None
) -> CommitGroup:
    group = CommitGroup(
        project_id=project.id,
        user_id=owner.id,
        team_id=team.id if team else None,
        github_sha="after-sha",
        github_ref="refs/heads/main",
        commit_message="Bulk update",
        file_paths=["docs/a.md", "docs/b.md"],
        status="pending_confirmation",
    )
    db_session.add(group)
    await db_session.commit()
    await db_session.refresh(group)
    return group


async def test_team_member_can_cancel_team_group(auth_client, db_session, test_user):
    """A member acting on a group owned by the project owner must succeed, not 404."""
    owner = await _create_user(db_session, "owner@example.com", github=True)
    team = await _create_team_with_member(db_session, owner, test_user)
    project = await _create_project(db_session, owner, team)
    group = await _create_group(db_session, project, owner, team)

    resp = await auth_client.delete(f"/commit-groups/{group.id}")

    assert resp.status_code == 204
    refreshed = await db_session.get(CommitGroup, group.id)
    await db_session.refresh(refreshed)
    assert refreshed.status == "cancelled"


async def test_non_member_cannot_cancel_group(auth_client, db_session, test_user):
    """A user with no shared team must not see another user's group (404)."""
    owner = await _create_user(db_session, "stranger@example.com", github=True)
    project = await _create_project(db_session, owner, None)
    group = await _create_group(db_session, project, owner, None)

    resp = await auth_client.delete(f"/commit-groups/{group.id}")

    assert resp.status_code == 404


async def test_team_member_confirm_uses_owner_token(
    auth_client, db_session, test_user, mocker
):
    """Member confirms a team group: tasks run with the owner's identity/token."""
    owner = await _create_user(db_session, "owner2@example.com", github=True)
    team = await _create_team_with_member(db_session, owner, test_user)
    project = await _create_project(db_session, owner, team)
    group = await _create_group(db_session, project, owner, team)

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# Source", "source-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    github_ctor = mocker.patch(
        "app.api.routes.commit_groups.GitHubClient", return_value=github_client
    )
    mocker.patch(
        "app.services.commit_groups.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    resp = await auth_client.post(f"/commit-groups/{group.id}/confirm")

    assert resp.status_code == 202
    assert resp.json()["created"] == 2
    # GitHub client built from the owner's token, not the member's (member has none).
    github_ctor.assert_called_once_with("github-token")

    tasks = (
        await db_session.scalars(select(Task).where(Task.commit_group_id == group.id))
    ).all()
    assert len(tasks) == 2
    assert all(task.user_id == owner.id for task in tasks)
    assert all(task.team_id == team.id for task in tasks)
