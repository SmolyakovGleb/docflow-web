from __future__ import annotations

import secrets
from datetime import UTC, datetime

from sqlalchemy import select

from app.models.project import Project
from app.models.publication import Publication
from app.models.task import Task
from app.models.user import User
from app.services.auth import encrypt_github_access_token
from app.services.github import GitHubAPIError


async def link_github(user: User, db_session) -> None:
    user.github_id = 123456
    user.github_login = "octocat"
    user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()


async def create_task(
    db_session,
    project: Project,
    *,
    file_path: str = "docs/index.md",
    status: str = "done",
    translated_content: str | None = "# Target",
    target_file_sha: str | None = "target-sha",
    original_content: str = "# Source",
) -> Task:
    task = Task(
        project_id=project.id,
        file_path=file_path,
        github_ref="refs/heads/main",
        github_sha="after-sha",
        commit_message="Update docs",
        source_file_sha="source-sha",
        target_file_sha=target_file_sha,
        original_content=original_content,
        translated_content=translated_content,
        status=status,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


async def test_publish_success(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)
    task = await create_task(db_session, test_project)

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    github_client.create_or_update_file = mocker.AsyncMock(return_value="commit-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    notify = mocker.patch("app.services.tasks.bitrix_notify.notify", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 200
    assert response.json() == {
        "task_id": str(task.id),
        "status": "published",
        "commit_sha": "commit-sha",
        "target_repo": test_project.target_repo,
        "target_path": task.file_path,
    }

    await db_session.refresh(task)
    assert task.status == "published"

    publication = await db_session.scalar(select(Publication).where(Publication.task_id == task.id))
    assert publication is not None
    assert publication.published_by == test_user.id
    assert publication.target_repo == test_project.target_repo
    assert publication.target_path == task.file_path
    assert publication.commit_sha == "commit-sha"
    assert publication.target_file_sha_before == "target-sha"

    github_client.create_or_update_file.assert_awaited_once_with(
        repo=test_project.target_repo,
        path=task.file_path,
        message="Publish translation: docs/index.md",
        content="# Target",
        sha="target-sha",
        branch=test_project.target_branch,
    )
    notify.assert_awaited_once()


async def test_publish_not_done_status(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)
    task = await create_task(db_session, test_project, status="failed")

    github_client_cls = mocker.patch("app.services.tasks.GitHubClient")
    notify = mocker.patch("app.services.tasks.bitrix_notify.notify", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 400
    assert response.json() == {"detail": "Task must be in 'done' status to publish"}
    github_client_cls.assert_not_called()
    notify.assert_not_awaited()


async def test_publish_conflict_detected(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)
    task = await create_task(db_session, test_project, target_file_sha="target-sha")

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value="new-target-sha")
    github_client.get_file_content = mocker.AsyncMock(return_value=("# Theirs", "new-target-sha"))
    github_client.create_or_update_file = mocker.AsyncMock()
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    notify = mocker.patch("app.services.tasks.bitrix_notify.notify", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Conflict: target file was modified since this task was created",
        "conflict": {
            "base": "# Source",
            "ours": "# Target",
            "theirs": "# Theirs",
        },
    }

    await db_session.refresh(task)
    assert task.status == "done"
    assert await db_session.scalar(select(Publication).where(Publication.task_id == task.id)) is None
    github_client.create_or_update_file.assert_not_awaited()
    notify.assert_not_awaited()


async def test_publish_new_file(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)
    task = await create_task(db_session, test_project, target_file_sha=None, file_path="docs/new.md")

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value=None)
    github_client.create_or_update_file = mocker.AsyncMock(return_value="commit-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    notify = mocker.patch("app.services.tasks.bitrix_notify.notify", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 200
    assert response.json()["status"] == "published"
    github_client.create_or_update_file.assert_awaited_once_with(
        repo=test_project.target_repo,
        path="docs/new.md",
        message="Publish translation: docs/new.md",
        content="# Target",
        sha=None,
        branch=test_project.target_branch,
    )
    notify.assert_awaited_once()


async def test_publish_keeps_completed_at(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)
    task = await create_task(db_session, test_project)
    task.completed_at = datetime(2026, 5, 7, 12, 0, tzinfo=UTC)
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    github_client.create_or_update_file = mocker.AsyncMock(return_value="commit-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    mocker.patch("app.services.tasks.bitrix_notify.notify", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 200
    await db_session.refresh(task)
    assert task.completed_at == datetime(2026, 5, 7, 12, 0, tzinfo=UTC)


async def test_publish_requires_github_link(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project)

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 400
    assert response.json() == {"detail": "GitHub account is not linked"}


async def test_publish_other_user_task(auth_client, db_session, test_project):
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

    task = await create_task(db_session, other_project)

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


async def test_publish_github_error_returns_502(
    auth_client,
    db_session,
    test_project,
    test_user,
    mocker,
):
    await link_github(test_user, db_session)
    task = await create_task(db_session, test_project)

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(
        side_effect=GitHubAPIError(status_code=502, detail="GitHub request failed")
    )
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    notify = mocker.patch("app.services.tasks.bitrix_notify.notify", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/publish")

    assert response.status_code == 502
    assert response.json() == {"detail": "GitHub request failed"}
    notify.assert_not_awaited()
