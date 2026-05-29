"""Integration tests for Teams (stage 15.1) and team-aware Projects/Tasks (stage 15.2)."""
from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.project import Project
from app.models.task import Task
from app.models.team import Team, TeamInvite, TeamMember
from app.models.user import User
from app.services.auth import encrypt_webhook_secret, hash_password

# ── DB helpers ────────────────────────────────────────────────────────────────

async def create_user(db_session, email: str, *, password: str = "testpassword") -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=email.split("@")[0],
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def create_team(db_session, owner: User, *, name: str = "Test Team") -> Team:
    team = Team(name=name, owner_id=owner.id)
    db_session.add(team)
    await db_session.flush()
    db_session.add(TeamMember(team_id=team.id, user_id=owner.id))
    await db_session.commit()
    await db_session.refresh(team)
    return team


async def add_member(db_session, team: Team, user: User) -> TeamMember:
    member = TeamMember(team_id=team.id, user_id=user.id)
    db_session.add(member)
    await db_session.commit()
    return member


async def create_invite(
    db_session,
    team: Team,
    creator: User,
    *,
    expires_at: datetime | None = None,
    used_by_id: uuid.UUID | None = None,
) -> TeamInvite:
    invite = TeamInvite(
        team_id=team.id,
        created_by=creator.id,
        expires_at=expires_at,
        used_by_id=used_by_id,
    )
    db_session.add(invite)
    await db_session.commit()
    await db_session.refresh(invite)
    return invite


async def create_project(
    db_session,
    owner: User,
    *,
    team: Team | None = None,
    name: str = "Proj",
) -> Project:
    project = Project(
        user_id=owner.id,
        team_id=team.id if team else None,
        name=name,
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


async def create_task(db_session, project: Project, *, team: Team | None = None) -> Task:
    task = Task(
        user_id=project.user_id,
        project_id=project.id,
        team_id=team.id if team else None,
        file_path="docs/file.md",
        github_ref="refs/heads/main",
        original_content="# Doc",
        status="done",
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


# ── Stage 15.1: Teams API ─────────────────────────────────────────────────────

async def test_create_team(auth_client, db_session, test_user):
    resp = await auth_client.post("/teams", json={"name": "Acme"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Acme"
    assert data["owner_id"] == str(test_user.id)
    assert data["member_count"] == 1
    assert data["members"][0]["email"] == test_user.email
    assert data["members"][0]["role"] == "owner"

    team = await db_session.scalar(select(Team).where(Team.owner_id == test_user.id))
    assert team is not None
    assert team.name == "Acme"


async def test_create_team_already_in_team(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.post("/teams", json={"name": "Another"})
    assert resp.status_code == 400
    assert "Already in a team" in resp.json()["detail"]


async def test_get_my_team_not_member(auth_client):
    resp = await auth_client.get("/teams/me")
    assert resp.status_code == 404


async def test_get_my_team(auth_client, db_session, test_user):
    await create_team(db_session, test_user, name="Alpha Team")

    resp = await auth_client.get("/teams/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Alpha Team"
    assert data["owner_id"] == str(test_user.id)
    assert data["member_count"] == 1
    assert data["members"][0]["email"] == test_user.email
    assert data["members"][0]["role"] == "owner"
    assert data["members"][0]["github_linked"] is False


async def test_get_my_team_includes_all_members(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    member_user = await create_user(db_session, "member@example.com")
    await add_member(db_session, team, member_user)

    resp = await auth_client.get("/teams/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["member_count"] == 2
    emails = {m["email"] for m in data["members"]}
    assert emails == {test_user.email, member_user.email}
    roles = {m["email"]: m["role"] for m in data["members"]}
    assert roles[test_user.email] == "owner"
    assert roles[member_user.email] == "member"


async def test_rename_team_as_owner(auth_client, db_session, test_user):
    await create_team(db_session, test_user, name="Old Name")

    resp = await auth_client.patch("/teams/me", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


async def test_rename_team_as_member_forbidden(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)

    resp = await auth_client.patch("/teams/me", json={"name": "Hijacked"})
    assert resp.status_code == 403


async def test_delete_team_as_owner(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)

    resp = await auth_client.delete("/teams/me")
    assert resp.status_code == 204
    assert await db_session.get(Team, team.id) is None


async def test_delete_team_nullifies_project_team_id(
    auth_client, db_session, test_user, test_project
):
    team = await create_team(db_session, test_user)
    test_project.team_id = team.id
    await db_session.commit()

    resp = await auth_client.delete("/teams/me")
    assert resp.status_code == 204

    await db_session.refresh(test_project)
    assert test_project.team_id is None


async def test_delete_team_as_member_forbidden(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)

    resp = await auth_client.delete("/teams/me")
    assert resp.status_code == 403


async def test_remove_member_as_owner(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    member_user = await create_user(db_session, "member@example.com")
    await add_member(db_session, team, member_user)

    resp = await auth_client.delete(f"/teams/me/members/{member_user.id}")
    assert resp.status_code == 204

    membership = await db_session.scalar(
        select(TeamMember).where(TeamMember.user_id == member_user.id)
    )
    assert membership is None


async def test_remove_owner_self_rejected(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.delete(f"/teams/me/members/{test_user.id}")
    assert resp.status_code == 400


async def test_remove_nonexistent_member_returns_404(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.delete(f"/teams/me/members/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_leave_team_as_member(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)

    resp = await auth_client.post("/teams/me/leave")
    assert resp.status_code == 204

    membership = await db_session.scalar(
        select(TeamMember).where(TeamMember.user_id == test_user.id)
    )
    assert membership is None


async def test_leave_team_as_owner_rejected(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.post("/teams/me/leave")
    assert resp.status_code == 400
    assert "delete" in resp.json()["detail"].lower()


async def test_leave_team_not_member_returns_404(auth_client):
    resp = await auth_client.post("/teams/me/leave")
    assert resp.status_code == 404


async def test_create_invite(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.post("/teams/me/invites", json={})
    assert resp.status_code == 201
    data = resp.json()
    assert "token" in data
    assert data["status"] == "active"
    assert data["expires_at"] is None
    assert data["created_by_email"] == test_user.email
    assert data["used_by_email"] is None


async def test_create_invite_with_expiry(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.post("/teams/me/invites", json={"expires_in_days": 7})
    assert resp.status_code == 201
    assert resp.json()["expires_at"] is not None


async def test_list_invites(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    await create_invite(db_session, team, test_user)
    await create_invite(db_session, team, test_user)

    resp = await auth_client.get("/teams/me/invites")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_list_invites_as_member_forbidden(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)

    resp = await auth_client.get("/teams/me/invites")
    assert resp.status_code == 403


async def test_revoke_invite(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    invite = await create_invite(db_session, team, test_user)

    resp = await auth_client.delete(f"/teams/me/invites/{invite.id}")
    assert resp.status_code == 204

    await db_session.refresh(invite)
    assert invite.expires_at is not None
    assert invite.expires_at <= datetime.now(UTC)


async def test_revoke_used_invite_rejected(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    member_user = await create_user(db_session, "used@example.com")
    invite = await create_invite(db_session, team, test_user, used_by_id=member_user.id)

    resp = await auth_client.delete(f"/teams/me/invites/{invite.id}")
    assert resp.status_code == 400


async def test_get_invite_preview_public(client, db_session):
    owner = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner, name="Docs Team")
    teammate = await create_user(db_session, "member@example.com")
    await add_member(db_session, team, teammate)
    invite = await create_invite(db_session, team, owner)

    resp = await client.get(f"/teams/invite-preview?token={invite.token}")
    assert resp.status_code == 200
    assert resp.json() == {
        "team_name": "Docs Team",
        "member_count": 2,
    }


async def test_get_invite_preview_invalid_token_returns_404(client):
    resp = await client.get(f"/teams/invite-preview?token={uuid.uuid4()}")
    assert resp.status_code == 404
    assert "Invalid" in resp.json()["detail"]


async def test_get_invite_preview_expired_token_returns_404(client, db_session):
    owner = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner)
    invite = await create_invite(
        db_session,
        team,
        owner,
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )

    resp = await client.get(f"/teams/invite-preview?token={invite.token}")
    assert resp.status_code == 404
    assert "Invalid" in resp.json()["detail"]


async def test_get_invite_preview_used_token_returns_404(client, db_session):
    owner = await create_user(db_session, "owner2@example.com")
    used_by = await create_user(db_session, "used@example.com")
    team = await create_team(db_session, owner)
    invite = await create_invite(db_session, team, owner, used_by_id=used_by.id)

    resp = await client.get(f"/teams/invite-preview?token={invite.token}")
    assert resp.status_code == 404
    assert "Invalid" in resp.json()["detail"]


async def test_join_team(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    invite = await create_invite(db_session, team, owner2)

    resp = await auth_client.post("/teams/join", json={"token": str(invite.token)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(team.id)
    assert any(m["user_id"] == str(test_user.id) for m in data["members"])

    await db_session.refresh(invite)
    assert invite.used_by_id == test_user.id


async def test_join_team_invalid_token(auth_client):
    resp = await auth_client.post("/teams/join", json={"token": str(uuid.uuid4())})
    assert resp.status_code == 400
    assert "Invalid" in resp.json()["detail"]


async def test_join_team_expired_token(auth_client, db_session):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    expired_at = datetime.now(UTC) - timedelta(hours=1)
    invite = await create_invite(db_session, team, owner2, expires_at=expired_at)

    resp = await auth_client.post("/teams/join", json={"token": str(invite.token)})
    assert resp.status_code == 400


async def test_join_team_already_member(auth_client, db_session, test_user):
    await create_team(db_session, test_user)  # test_user is already in a team

    other_owner = await create_user(db_session, "other@example.com")
    other_team = await create_team(db_session, other_owner)
    invite = await create_invite(db_session, other_team, other_owner)

    resp = await auth_client.post("/teams/join", json={"token": str(invite.token)})
    assert resp.status_code == 400
    assert "Already in a team" in resp.json()["detail"]


# ── Stage 15.2: Projects / Tasks with team context ────────────────────────────

async def test_create_team_project(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    # Project creation requires a linked GitHub account
    test_user.github_id = 99999
    await db_session.commit()

    resp = await auth_client.post("/projects", json={
        "name": "Team Project",
        "source_repo": "org/source",
        "source_branch": "main",
        "target_repo": "org/target",
        "target_branch": "main",
        "team_id": str(team.id),
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["team_id"] == str(team.id)
    assert data["is_team_project"] is True


async def test_create_team_project_non_owner_forbidden(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)

    resp = await auth_client.post("/projects", json={
        "name": "Hijack",
        "source_repo": "org/source",
        "source_branch": "main",
        "target_repo": "org/target",
        "target_branch": "main",
        "team_id": str(team.id),
    })
    assert resp.status_code == 403


async def test_get_projects_includes_team_projects(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    team_project = await create_project(db_session, owner2, team=team, name="Team Project")

    resp = await auth_client.get("/projects")
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert str(team_project.id) in ids


async def test_get_projects_excludes_foreign_team_projects(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    # test_user is NOT added to this team
    team_project = await create_project(db_session, owner2, team=team, name="Foreign Project")

    resp = await auth_client.get("/projects")
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert str(team_project.id) not in ids


async def test_member_can_view_team_project(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    project = await create_project(db_session, owner2, team=team)

    resp = await auth_client.get(f"/projects/{project.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(project.id)


async def test_non_member_cannot_view_team_project(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    # test_user is NOT added to this team
    project = await create_project(db_session, owner2, team=team)

    resp = await auth_client.get(f"/projects/{project.id}")
    assert resp.status_code == 404


async def test_team_project_fields_in_response(auth_client, db_session, test_user):
    team = await create_team(db_session, test_user)
    project = await create_project(db_session, test_user, team=team)

    resp = await auth_client.get(f"/projects/{project.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["team_id"] == str(team.id)
    assert data["is_team_project"] is True


async def test_personal_project_has_no_team(auth_client, db_session, test_user, test_project):
    resp = await auth_client.get(f"/projects/{test_project.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["team_id"] is None
    assert data["is_team_project"] is False


async def test_get_tasks_includes_team_tasks(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    project = await create_project(db_session, owner2, team=team)
    team_task = await create_task(db_session, project, team=team)

    resp = await auth_client.get("/tasks")
    assert resp.status_code == 200
    ids = [t["id"] for t in resp.json()["items"]]
    assert str(team_task.id) in ids


async def test_team_task_fields(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    project = await create_project(db_session, owner2, team=team)
    await create_task(db_session, project, team=team)

    resp = await auth_client.get("/tasks")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["team_id"] == str(team.id)
    assert items[0]["is_team_task"] is True


async def test_get_tasks_excludes_foreign_team_tasks(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    # test_user is NOT added to this team
    project = await create_project(db_session, owner2, team=team)
    await create_task(db_session, project, team=team)

    resp = await auth_client.get("/tasks")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


async def test_personal_task_has_no_team(auth_client, db_session, test_user, test_project):
    await create_task(db_session, test_project)

    resp = await auth_client.get("/tasks")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["team_id"] is None
    assert items[0]["is_team_task"] is False


# ── Stage 15.1: additional validation / edge-case tests ───────────────────────

async def test_create_team_empty_name_rejected(auth_client):
    resp = await auth_client.post("/teams", json={"name": ""})
    assert resp.status_code == 422


async def test_create_team_name_too_long_rejected(auth_client):
    resp = await auth_client.post("/teams", json={"name": "x" * 101})
    assert resp.status_code == 422


async def test_create_invite_expires_in_days_zero_rejected(auth_client, db_session, test_user):
    await create_team(db_session, test_user)

    resp = await auth_client.post("/teams/me/invites", json={"expires_in_days": 0})
    assert resp.status_code == 422


async def test_join_team_used_token(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    other_user = await create_user(db_session, "other@example.com")
    team = await create_team(db_session, owner2)
    invite = await create_invite(db_session, team, owner2, used_by_id=other_user.id)

    resp = await auth_client.post("/teams/join", json={"token": str(invite.token)})
    assert resp.status_code == 400
    assert "Invalid" in resp.json()["detail"]


async def test_member_cannot_update_team_project(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    project = await create_project(db_session, owner2, team=team)

    resp = await auth_client.patch(f"/projects/{project.id}", json={"name": "Hijacked"})
    assert resp.status_code == 404


async def test_member_cannot_delete_team_project(auth_client, db_session, test_user):
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    project = await create_project(db_session, owner2, team=team)

    resp = await auth_client.delete(f"/projects/{project.id}")
    assert resp.status_code == 404


async def test_create_team_project_non_owner_without_github_gets_403(
    auth_client, db_session, test_user
):
    """Non-owner must receive 403, not 400 'GitHub not linked', even without GitHub linked."""
    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)

    resp = await auth_client.post("/projects", json={
        "name": "Hijack",
        "source_repo": "org/source",
        "source_branch": "main",
        "target_repo": "org/target",
        "target_branch": "main",
        "team_id": str(team.id),
    })
    assert resp.status_code == 403


# ── Stage 15.2: deduplication across team members ─────────────────────────────

async def test_dedup_detects_active_task_from_team_member(db_session, test_user):
    """Active task created by another team member blocks creation of a duplicate."""
    from app.models.task import Task
    from app.services.tasks import _get_active_tasks_by_path

    owner2 = await create_user(db_session, "owner2@example.com")
    team = await create_team(db_session, owner2)
    await add_member(db_session, team, test_user)
    project = await create_project(db_session, owner2, team=team)

    active_task = Task(
        user_id=owner2.id,
        project_id=project.id,
        team_id=team.id,
        file_path="docs/readme.md",
        github_ref="refs/heads/main",
        original_content="# content",
        status="queued",
    )
    db_session.add(active_task)
    await db_session.commit()

    result = await _get_active_tasks_by_path(
        db_session,
        user_id=test_user.id,
        file_paths=["docs/readme.md"],
        project_id=project.id,
    )
    assert "docs/readme.md" in result
    assert result["docs/readme.md"].id == active_task.id


async def test_dedup_personal_upload_scoped_to_user(db_session, test_user):
    """Upload tasks without a project are scoped per-user — another user's task is invisible."""
    from app.models.task import Task
    from app.services.tasks import _get_active_tasks_by_path

    other_user = await create_user(db_session, "other@example.com")

    other_task = Task(
        user_id=other_user.id,
        project_id=None,
        team_id=None,
        file_path="docs/file.md",
        github_ref="manual",
        original_content="# x",
        status="queued",
    )
    db_session.add(other_task)
    await db_session.commit()

    result = await _get_active_tasks_by_path(
        db_session,
        user_id=test_user.id,
        file_paths=["docs/file.md"],
        project_id=None,
    )
    assert "docs/file.md" not in result
