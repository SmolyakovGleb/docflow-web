from __future__ import annotations

import secrets

from sqlalchemy import select

from app.models.project import Project
from app.models.task import Task
from app.models.user import User


async def test_create_project(auth_client, db_session, test_user):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = "encrypted-token"
    await db_session.commit()

    response = await auth_client.post(
        "/projects",
        json={
            "name": "Docs EN",
            "source_repo": "team/docs-ru",
            "source_branch": "main",
            "target_repo": "team/docs-en",
            "target_branch": "main",
            "exclude_patterns": ["**/README.md"],
        },
    )

    assert response.status_code == 201
    payload = response.json()

    assert payload["name"] == "Docs EN"
    assert payload["source_repo"] == "team/docs-ru"
    assert payload["target_repo"] == "team/docs-en"
    assert payload["exclude_patterns"] == ["**/README.md"]
    assert payload["webhook_secret"]
    assert payload["webhook_url"].endswith(f"/webhook/{payload['id']}")

    project = await db_session.scalar(select(Project).where(Project.id == payload["id"]))
    assert project is not None
    assert project.user_id == test_user.id
    assert project.webhook_secret == payload["webhook_secret"]


async def test_create_project_requires_github_link(auth_client):
    response = await auth_client.post(
        "/projects",
        json={
            "name": "Docs EN",
            "source_repo": "team/docs-ru",
            "target_repo": "team/docs-en",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "GitHub account is not linked"}


async def test_create_project_validates_repo_format(auth_client, db_session, test_user):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = "encrypted-token"
    await db_session.commit()

    response = await auth_client.post(
        "/projects",
        json={
            "name": "Docs EN",
            "source_repo": "invalid-repo-name",
            "target_repo": "team/docs-en",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "source_repo"]


async def test_get_projects_own_only(auth_client, db_session, test_user):
    own_project = Project(
        user_id=test_user.id,
        name="Own Project",
        source_repo="team/source-one",
        source_branch="main",
        target_repo="team/target-one",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
        exclude_patterns=["docs/**"],
    )
    other_user = User(
        email="other@example.com",
        password_hash="hash",
        display_name="Other User",
    )
    db_session.add_all([own_project, other_user])
    await db_session.flush()

    other_project = Project(
        user_id=other_user.id,
        name="Other Project",
        source_repo="team/source-two",
        source_branch="main",
        target_repo="team/target-two",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(other_project)
    await db_session.commit()

    response = await auth_client.get("/projects")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == str(own_project.id)
    assert payload[0]["exclude_patterns"] == ["docs/**"]
    assert "webhook_secret" not in payload[0]


async def test_get_project_not_found(auth_client, db_session, test_user):
    other_user = User(
        email="other@example.com",
        password_hash="hash",
        display_name="Other User",
    )
    db_session.add(other_user)
    await db_session.flush()

    other_project = Project(
        user_id=other_user.id,
        name="Other Project",
        source_repo="team/source-two",
        source_branch="main",
        target_repo="team/target-two",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(other_project)
    await db_session.commit()

    response = await auth_client.get(f"/projects/{other_project.id}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found"}


async def test_webhook_secret_not_in_get(auth_client, db_session, test_project):
    test_user = await db_session.get(User, test_project.user_id)
    assert test_user is not None

    response = await auth_client.get(f"/projects/{test_project.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(test_project.id)
    assert "webhook_secret" not in payload


async def test_get_project_returns_exclude_patterns(auth_client, db_session, test_project):
    test_project.exclude_patterns = ["docs/**", "**/README.md"]
    await db_session.commit()

    response = await auth_client.get(f"/projects/{test_project.id}")

    assert response.status_code == 200
    assert response.json()["exclude_patterns"] == ["docs/**", "**/README.md"]


async def test_get_projects_unauthenticated(client):
    response = await client.get("/projects")

    assert response.status_code == 401


async def test_patch_project_not_found(auth_client, db_session):
    other_user = User(
        email="other@example.com",
        password_hash="hash",
        display_name="Other User",
    )
    db_session.add(other_user)
    await db_session.flush()

    other_project = Project(
        user_id=other_user.id,
        name="Other Project",
        source_repo="team/source",
        source_branch="main",
        target_repo="team/target",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(other_project)
    await db_session.commit()

    response = await auth_client.patch(
        f"/projects/{other_project.id}",
        json={"name": "Hacked"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found"}


async def test_delete_project_not_found(auth_client, db_session):
    other_user = User(
        email="other2@example.com",
        password_hash="hash",
        display_name="Other User",
    )
    db_session.add(other_user)
    await db_session.flush()

    other_project = Project(
        user_id=other_user.id,
        name="Other Project",
        source_repo="team/source",
        source_branch="main",
        target_repo="team/target",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(other_project)
    await db_session.commit()

    response = await auth_client.delete(f"/projects/{other_project.id}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found"}


async def test_patch_project_invalid_repo(auth_client, test_project):
    response = await auth_client.patch(
        f"/projects/{test_project.id}",
        json={"source_repo": "invalid-no-slash"},
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "source_repo"]


async def test_patch_project_empty_body(auth_client, db_session, test_project):
    original_name = test_project.name

    response = await auth_client.patch(f"/projects/{test_project.id}", json={})

    assert response.status_code == 200
    assert response.json()["name"] == original_name

    await db_session.refresh(test_project)
    assert test_project.name == original_name


async def test_patch_project_updates_fields(auth_client, db_session, test_project):
    response = await auth_client.patch(
        f"/projects/{test_project.id}",
        json={
            "name": "Renamed Project",
            "source_repo": "team/new-source",
            "source_branch": "develop",
            "target_repo": "team/new-target",
            "target_branch": "release",
            "exclude_patterns": ["**/drafts/**"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Renamed Project"
    assert payload["source_repo"] == "team/new-source"
    assert payload["source_branch"] == "develop"
    assert payload["target_repo"] == "team/new-target"
    assert payload["target_branch"] == "release"
    assert payload["exclude_patterns"] == ["**/drafts/**"]

    await db_session.refresh(test_project)
    assert test_project.name == "Renamed Project"
    assert test_project.source_repo == "team/new-source"
    assert test_project.target_repo == "team/new-target"


async def test_delete_project(auth_client, db_session, test_project):
    response = await auth_client.delete(f"/projects/{test_project.id}")

    assert response.status_code == 204

    get_response = await auth_client.get(f"/projects/{test_project.id}")
    assert get_response.status_code == 404

    deleted_project = await db_session.get(Project, test_project.id)
    assert deleted_project is None


async def test_delete_project_keeps_tasks_with_null_project_id(
    auth_client,
    db_session,
    test_project,
):
    task = Task(
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="abc123",
        commit_message="Update docs",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        translated_content="# Target",
        status="done",
    )
    db_session.add(task)
    await db_session.commit()

    response = await auth_client.delete(f"/projects/{test_project.id}")

    assert response.status_code == 204

    await db_session.refresh(task)
    assert task.project_id is None
