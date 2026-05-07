from __future__ import annotations

import io
import secrets
from datetime import UTC, datetime

from sqlalchemy import select

from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services.auth import encrypt_github_access_token


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
    github_ref: str = "refs/heads/main",
    github_sha: str | None = "after-sha",
    source_file_sha: str | None = "source-sha",
    translated_content: str | None = "# Target",
    log: str | None = None,
    error: str | None = None,
    completed_at: datetime | None = None,
) -> Task:
    task = Task(
        project_id=project.id,
        file_path=file_path,
        github_ref=github_ref,
        github_sha=github_sha,
        commit_message="Update docs",
        source_file_sha=source_file_sha,
        target_file_sha="target-sha",
        original_content="# Source",
        translated_content=translated_content,
        status=status,
        log=log,
        error=error,
        completed_at=completed_at,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


async def test_get_tasks_own_only(auth_client, db_session, test_project, test_user):
    own_task = await create_task(db_session, test_project, file_path="docs/own.md")

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
    await create_task(db_session, other_project, file_path="docs/other.md")

    response = await auth_client.get("/tasks")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == str(own_task.id)


async def test_get_tasks_without_project_filter_returns_all_own(
    auth_client,
    db_session,
    test_project,
    test_user,
):
    second_project = Project(
        user_id=test_user.id,
        name="Second Project",
        source_repo="team/source-two",
        source_branch="main",
        target_repo="team/target-two",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(second_project)
    await db_session.commit()
    await db_session.refresh(second_project)

    await create_task(db_session, test_project, file_path="docs/one.md")
    await create_task(db_session, second_project, file_path="docs/two.md")

    response = await auth_client.get("/tasks")

    assert response.status_code == 200
    assert response.json()["total"] == 2


async def test_get_tasks_hides_orphaned_tasks(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project)
    task.project_id = None
    await db_session.commit()

    response = await auth_client.get("/tasks")

    assert response.status_code == 200
    assert response.json()["total"] == 0


async def test_get_task_not_found(auth_client):
    response = await auth_client.get("/tasks/550e8400-e29b-41d4-a716-446655440999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


async def test_get_task_detail_success(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project)

    response = await auth_client.get(f"/tasks/{task.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(task.id)
    assert payload["original_content"] == "# Source"
    assert payload["translated_content"] == "# Target"
    assert payload["publications"] == []


async def test_get_task_log_returns_text(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project, log="line one\nline two")

    response = await auth_client.get(f"/tasks/{task.id}/log")

    assert response.status_code == 200
    assert response.text == "line one\nline two"
    assert response.headers["content-type"].startswith("text/plain")


async def test_get_task_log_no_content(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project, log=None)

    response = await auth_client.get(f"/tasks/{task.id}/log")

    assert response.status_code == 204
    assert response.text == ""


async def test_patch_task_updates_content(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project)

    response = await auth_client.patch(
        f"/tasks/{task.id}",
        json={"translated_content": "# Edited"},
    )

    assert response.status_code == 200
    assert response.json()["translated_content"] == "# Edited"

    await db_session.refresh(task)
    assert task.translated_content == "# Edited"


async def test_patch_task_running_rejected(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project, status="running")

    response = await auth_client.patch(
        f"/tasks/{task.id}",
        json={"translated_content": "# Edited"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot edit task with status 'running'"}


async def test_manual_task_from_repo(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# Source", "source-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    run_task = mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(
        "/tasks/manual",
        json={
            "project_id": str(test_project.id),
            "file_paths": ["docs/manual.md"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["created"] == 1
    assert len(payload["task_ids"]) == 1
    assert payload["skipped"] == []

    task = await db_session.scalar(select(Task).where(Task.file_path == "docs/manual.md"))
    assert task is not None
    assert task.github_ref == "manual"
    assert task.github_sha is None
    assert task.commit_message == "manual"
    assert task.source_file_sha == "source-sha"
    assert task.original_content == "# Source"
    run_task.assert_awaited_once()


async def test_manual_task_from_repo_requires_github_link(auth_client, test_project):
    response = await auth_client.post(
        "/tasks/manual",
        json={
            "project_id": str(test_project.id),
            "file_paths": ["docs/manual.md"],
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "GitHub account is not linked"}


async def test_manual_task_upload_success(auth_client, db_session, test_project, mocker):
    run_task = mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(
        "/tasks/manual",
        data={
            "project_id": str(test_project.id),
            "target_path": "docs/uploaded.md",
        },
        files={"file": ("uploaded.md", io.BytesIO(b"# Source"), "text/markdown")},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["created"] == 1
    assert payload["skipped"] == []

    task = await db_session.scalar(select(Task).where(Task.file_path == "docs/uploaded.md"))
    assert task is not None
    assert task.github_ref == "manual"
    assert task.github_sha is None
    assert task.commit_message == "manual"
    assert task.source_file_sha is None
    assert task.original_content == "# Source"
    run_task.assert_awaited_once()


async def test_manual_task_upload_without_github_link_allowed(
    auth_client,
    db_session,
    test_project,
    mocker,
):
    mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(
        "/tasks/manual",
        data={
            "project_id": str(test_project.id),
            "target_path": "docs/uploaded.md",
        },
        files={"file": ("uploaded.md", io.BytesIO(b"# Source"), "text/markdown")},
    )

    assert response.status_code == 201
    assert response.json()["created"] == 1


async def test_upload_non_md_rejected(auth_client, test_project):
    response = await auth_client.post(
        "/tasks/manual",
        data={
            "project_id": str(test_project.id),
            "target_path": "docs/uploaded.md",
        },
        files={"file": ("uploaded.txt", io.BytesIO(b"hello"), "text/plain")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Only .md files are allowed"}


async def test_upload_too_large_rejected(auth_client, test_project):
    response = await auth_client.post(
        "/tasks/manual",
        data={
            "project_id": str(test_project.id),
            "target_path": "docs/uploaded.md",
        },
        files={"file": ("uploaded.md", io.BytesIO(b"a" * 1_048_577), "text/markdown")},
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "File is too large"}


async def test_manual_task_partial_success_with_skipped(
    auth_client,
    db_session,
    test_project,
    test_user,
    mocker,
):
    await link_github(test_user, db_session)
    test_project.exclude_patterns = ["docs/private/**"]
    await db_session.commit()

    await create_task(db_session, test_project, file_path="docs/active.md", status="queued")

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# Source", "source-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    run_task = mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(
        "/tasks/manual",
        json={
            "project_id": str(test_project.id),
            "file_paths": ["docs/active.md", "docs/private/secret.md", "docs/new.md"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["created"] == 1
    assert len(payload["task_ids"]) == 1
    assert payload["skipped"] == [
        {
            "file_path": "docs/private/secret.md",
            "reason": "excluded_by_pattern",
            "existing_task_id": None,
        },
        {
            "file_path": "docs/active.md",
            "reason": "already_queued",
            "existing_task_id": payload["skipped"][1]["existing_task_id"],
        },
    ]
    run_task.assert_awaited_once()


async def test_retry_task_success(auth_client, db_session, test_project, test_user, mocker):
    await link_github(test_user, db_session)
    task = await create_task(
        db_session,
        test_project,
        status="done",
        github_ref="refs/heads/main",
        source_file_sha="source-sha",
        translated_content="# Target",
        log="old log",
        error="old error",
        completed_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
    )

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value="source-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    run_task = mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(f"/tasks/{task.id}/retry")

    assert response.status_code == 202
    assert response.json() == {"id": str(task.id), "status": "queued"}

    await db_session.refresh(task)
    assert task.status == "queued"
    assert task.translated_content is None
    assert task.log is None
    assert task.error is None
    assert task.completed_at is None
    run_task.assert_awaited_once()


async def test_retry_task_running_rejected(auth_client, db_session, test_project):
    task = await create_task(db_session, test_project, status="running")

    response = await auth_client.post(f"/tasks/{task.id}/retry")

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot retry task with status 'running'"}


async def test_retry_task_source_changed_conflict(
    auth_client,
    db_session,
    test_project,
    test_user,
    mocker,
):
    await link_github(test_user, db_session)
    task = await create_task(
        db_session,
        test_project,
        status="done",
        github_ref="refs/heads/main",
        source_file_sha="old-source-sha",
    )

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value="new-source-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    run_task = mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(f"/tasks/{task.id}/retry")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Source file has changed since task was created",
        "source_diff": {
            "old_sha": "old-source-sha",
            "new_sha": "new-source-sha",
        },
    }
    run_task.assert_not_awaited()


async def test_retry_force_ignores_sha_conflict(
    auth_client,
    db_session,
    test_project,
    test_user,
    mocker,
):
    await link_github(test_user, db_session)
    task = await create_task(
        db_session,
        test_project,
        status="done",
        github_ref="refs/heads/main",
        source_file_sha="old-sha",
    )

    github_client = mocker.Mock()
    github_client.get_file_sha = mocker.AsyncMock(return_value="new-sha")
    mocker.patch("app.services.tasks.GitHubClient", return_value=github_client)
    mocker.patch("app.api.routes.tasks.pipeline_runner.run_task", new=mocker.AsyncMock())

    response = await auth_client.post(f"/tasks/{task.id}/retry", json={"force": True})

    assert response.status_code == 202
    assert response.json()["status"] == "queued"


async def test_get_tasks_filter_by_status(auth_client, db_session, test_project):
    await create_task(db_session, test_project, file_path="docs/done.md", status="done")
    await create_task(db_session, test_project, file_path="docs/failed.md", status="failed")

    response = await auth_client.get("/tasks?status=done")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["status"] == "done"


async def test_get_tasks_filter_by_foreign_project(auth_client, db_session):
    other_user = User(email="foreign@example.com", password_hash="h", display_name="Other")
    db_session.add(other_user)
    await db_session.flush()

    other_project = Project(
        user_id=other_user.id,
        name="Foreign Project",
        source_repo="team/foreign-source",
        source_branch="main",
        target_repo="team/foreign-target",
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(other_project)
    await db_session.commit()

    response = await auth_client.get(f"/tasks?project_id={other_project.id}")

    assert response.status_code == 404


async def test_upload_non_utf8_rejected(auth_client, test_project):
    response = await auth_client.post(
        "/tasks/manual",
        data={
            "project_id": str(test_project.id),
            "target_path": "docs/file.md",
        },
        files={"file": ("file.md", io.BytesIO(b"\xff\xfe\xfd binary content"), "text/markdown")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "File must be UTF-8 encoded"}


async def test_retry_manual_upload_skips_source_sha_check(
    auth_client,
    db_session,
    test_project,
    mocker,
):
    task = await create_task(
        db_session,
        test_project,
        status="failed",
        github_ref="manual",
        github_sha=None,
        source_file_sha=None,
        translated_content=None,
        error="failure",
    )

    github_client_cls = mocker.patch("app.services.tasks.GitHubClient")
    run_task = mocker.patch(
        "app.api.routes.tasks.pipeline_runner.run_task",
        new=mocker.AsyncMock(),
    )

    response = await auth_client.post(f"/tasks/{task.id}/retry")

    assert response.status_code == 202
    assert response.json() == {"id": str(task.id), "status": "queued"}
    github_client_cls.assert_not_called()
    run_task.assert_awaited_once()
