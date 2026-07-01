from __future__ import annotations

import hashlib
import hmac
import json

from sqlalchemy import select

from app.models.commit_group import CommitGroup
from app.models.task import Task
from app.services.auth import encrypt_github_access_token


def sign_payload(secret: str, payload: dict) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    headers = {
        "X-GitHub-Event": "push",
        "X-Hub-Signature-256": f"sha256={signature}",
        "Content-Type": "application/json",
    }
    return body, headers


async def test_webhook_ping_event(client, test_project):
    payload = {"zen": "Keep it logically awesome."}
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(
        test_project.plaintext_webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()

    response = await client.post(
        f"/webhook/{test_project.id}",
        content=body,
        headers={
            "X-GitHub-Event": "ping",
            "X-Hub-Signature-256": f"sha256={signature}",
            "Content-Type": "application/json",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_webhook_creates_tasks(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(
        return_value=("# Source", "source-sha"),
    )
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    schedule_task = mocker.patch(
        "app.api.routes.webhook.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "sender": {"login": "octocat"},
        "head_commit": {
            "message": "Update docs",
            "author": {
                "name": "Anna Kuznetsova",
            },
        },
        "commits": [
            {
                "added": ["docs/index.md"],
                "modified": ["docs/guide.md"],
            }
        ],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    payload = response.json()
    assert payload["created"] == 2
    assert len(payload["task_ids"]) == 2
    assert payload["skipped"] == []

    tasks = (
        await db_session.scalars(
            select(Task).where(Task.project_id == test_project.id).order_by(Task.file_path)
        )
    ).all()
    assert len(tasks) == 2
    assert tasks[0].commit_message == "Update docs"
    assert tasks[0].commit_author_name == "Anna Kuznetsova"
    assert tasks[0].commit_author_login == "octocat"
    assert tasks[0].github_ref == "refs/heads/main"
    assert tasks[0].github_sha == "after-sha"
    assert tasks[0].source_file_sha == "source-sha"
    assert tasks[0].target_file_sha == "target-sha"
    assert tasks[0].original_content == "# Source"
    assert tasks[0].status == "queued"

    assert github_client.get_file_content.await_count == 2
    github_client.get_file_sha.assert_any_await(
        test_project.target_repo,
        "docs/index.md",
        test_project.target_branch,
    )
    assert schedule_task.await_count == 2


async def test_webhook_invalid_signature(client, test_project):
    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/index.md"], "modified": []}],
    }
    body = json.dumps(payload).encode("utf-8")

    response = await client.post(
        f"/webhook/{test_project.id}",
        content=body,
        headers={
            "X-GitHub-Event": "push",
            "X-Hub-Signature-256": "sha256=wrong",
            "Content-Type": "application/json",
        },
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid webhook signature"}


async def test_webhook_wrong_branch(client, test_project):
    payload = {
        "ref": "refs/heads/develop",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/index.md"], "modified": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 400
    assert response.json() == {"detail": "Push is not for the configured source branch"}


async def test_webhook_non_md_files(client, test_project):
    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/image.png"], "modified": ["docs/readme.txt"]}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 400
    assert response.json() == {"detail": "No translatable files in this push"}


async def test_webhook_deduplication_queued(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")

    task = Task(
        user_id=test_project.user_id,
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="old-after",
        commit_message="Old task",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        status="queued",
    )
    db_session.add(task)
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock()
    github_client.get_file_sha = mocker.AsyncMock()
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    schedule_task = mocker.patch(
        "app.api.routes.webhook.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/index.md"], "modified": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    assert response.json()["created"] == 0
    assert response.json()["skipped"] == [
        {
            "file_path": "docs/index.md",
            "reason": "already_queued",
            "existing_task_id": str(task.id),
        }
    ]
    github_client.get_file_content.assert_not_called()
    github_client.get_file_sha.assert_not_called()
    schedule_task.assert_not_awaited()


async def test_webhook_deduplication_running(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")

    task = Task(
        user_id=test_project.user_id,
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="old-after",
        commit_message="Old task",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        status="running",
    )
    db_session.add(task)
    await db_session.commit()

    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=mocker.Mock())
    mocker.patch("app.api.routes.webhook.pipeline_runner.schedule_task", new=mocker.AsyncMock())

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/index.md"], "modified": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    assert response.json()["created"] == 0
    assert response.json()["skipped"] == [
        {
            "file_path": "docs/index.md",
            "reason": "pipeline_running",
            "existing_task_id": str(task.id),
        }
    ]


async def test_webhook_exclude_patterns(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    test_project.exclude_patterns = ["docs/private/**"]
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock()
    github_client.get_file_sha = mocker.AsyncMock()
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    schedule_task = mocker.patch(
        "app.api.routes.webhook.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/private/secret.md"], "modified": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    assert response.json()["created"] == 0
    assert response.json()["skipped"] == [
        {
            "file_path": "docs/private/secret.md",
            "reason": "excluded_by_pattern",
            "existing_task_id": None,
        }
    ]
    github_client.get_file_content.assert_not_called()
    github_client.get_file_sha.assert_not_called()
    schedule_task.assert_not_awaited()


async def test_webhook_multiple_files(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(
        side_effect=[
            ("# One", "sha-1"),
            ("# Two", "sha-2"),
            ("# Three", "sha-3"),
        ]
    )
    github_client.get_file_sha = mocker.AsyncMock(side_effect=["target-1", "target-2", None])
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    schedule_task = mocker.patch(
        "app.api.routes.webhook.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [
            {
                "added": ["docs/one.md", "docs/two.md"],
                "modified": ["docs/three.md"],
            }
        ],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    assert response.json()["created"] == 3
    assert len(response.json()["task_ids"]) == 3
    assert schedule_task.await_count == 3


async def test_webhook_requires_github_link(client, db_session, test_project, test_user):
    test_user.github_id = None
    test_user.github_login = None
    test_user.github_access_token = None
    await db_session.commit()

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [{"added": ["docs/index.md"], "modified": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 400
    assert response.json() == {"detail": "GitHub account is not linked"}


async def test_webhook_is_atomic_if_github_download_fails(
    client,
    db_session,
    test_project,
    test_user,
    mocker,
):
    from app.services.github import GitHubAPIError

    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(
        side_effect=[
            ("# One", "sha-1"),
            GitHubAPIError(status_code=502, detail="GitHub request failed"),
        ]
    )
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    schedule_task = mocker.patch(
        "app.api.routes.webhook.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "head_commit": {"message": "Update docs"},
        "commits": [
            {
                "added": ["docs/one.md", "docs/two.md"],
                "modified": [],
            }
        ],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 502
    assert response.json() == {"detail": "GitHub request failed"}

    tasks = (await db_session.scalars(select(Task).where(Task.project_id == test_project.id))).all()
    assert tasks == []
    schedule_task.assert_not_awaited()


async def test_webhook_saves_before_sha(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# Source", "source-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    mocker.patch("app.api.routes.webhook.pipeline_runner.schedule_task", new=mocker.AsyncMock())

    payload = {
        "ref": "refs/heads/main",
        "before": "before-sha-abc",
        "after": "after-sha-xyz",
        "head_commit": {"message": "Update docs", "author": {"name": "Dev"}},
        "commits": [{"added": ["docs/index.md"], "modified": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    task = (
        await db_session.scalars(select(Task).where(Task.project_id == test_project.id))
    ).one()
    assert task.before_sha == "before-sha-abc"
    assert task.previous_task_id is None


async def test_webhook_sets_previous_task_id_from_published_task(
    client, db_session, test_project, test_user, mocker
):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")

    published = Task(
        user_id=test_project.user_id,
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="old-sha",
        commit_message="Previous translation",
        source_file_sha="s-sha",
        target_file_sha="t-sha",
        original_content="# Old",
        status="published",
    )
    db_session.add(published)
    await db_session.commit()
    await db_session.refresh(published)

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# New", "new-source-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="new-target-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    mocker.patch("app.api.routes.webhook.pipeline_runner.schedule_task", new=mocker.AsyncMock())

    payload = {
        "ref": "refs/heads/main",
        "before": "before-sha-abc",
        "after": "after-sha-xyz",
        "head_commit": {"message": "Update docs", "author": {"name": "Dev"}},
        "commits": [{"modified": ["docs/index.md"], "added": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    new_task = (
        await db_session.scalars(
            select(Task)
            .where(Task.project_id == test_project.id, Task.status == "queued")
        )
    ).one()
    assert new_task.previous_task_id == published.id
    assert new_task.before_sha == "before-sha-abc"


async def test_webhook_bulk_commit_group_preserves_incremental_context(
    client, db_session, test_project, test_user, mocker
):
    test_project.webhook_file_limit = 1
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")

    published = Task(
        user_id=test_project.user_id,
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="old-after",
        commit_message="Published task",
        source_file_sha="old-source",
        target_file_sha="old-target",
        original_content="# Old",
        translated_content="# Старый",
        status="published",
    )
    db_session.add(published)
    await db_session.commit()
    await db_session.refresh(published)

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# Source", "source-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    mocker.patch(
        "app.services.commit_groups.pipeline_runner.schedule_task",
        new=mocker.AsyncMock(),
    )

    payload = {
        "ref": "refs/heads/main",
        "before": "before-sha-abc",
        "after": "after-sha",
        "head_commit": {"message": "Bulk update"},
        "commits": [{"added": ["docs/index.md"], "modified": ["docs/guide.md"]}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    group = await db_session.scalar(
        select(CommitGroup).where(CommitGroup.project_id == test_project.id)
    )
    assert group is not None
    assert group.before_sha == "before-sha-abc"

    from app.services.commit_groups import confirm_commit_group

    await db_session.refresh(group, ["project"])
    tasks = await confirm_commit_group(db_session, group, test_user, github_client)

    index_task = next(task for task in tasks if task.file_path == "docs/index.md")
    assert index_task.before_sha == "before-sha-abc"
    assert index_task.previous_task_id == published.id
    guide_task = next(task for task in tasks if task.file_path == "docs/guide.md")
    assert guide_task.before_sha == "before-sha-abc"
    assert guide_task.previous_task_id is None


async def test_webhook_ignores_non_published_tasks_for_previous_task_id(
    client, db_session, test_project, test_user, mocker
):
    """Done (not published) tasks must not be picked as previous_task_id."""
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")

    done_task = Task(
        user_id=test_project.user_id,
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="old-sha",
        commit_message="Done but not published",
        source_file_sha="s-sha",
        target_file_sha="t-sha",
        original_content="# Old",
        status="done",
    )
    db_session.add(done_task)
    await db_session.commit()

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(return_value=("# New", "new-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="t-sha-new")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    mocker.patch("app.api.routes.webhook.pipeline_runner.schedule_task", new=mocker.AsyncMock())

    payload = {
        "ref": "refs/heads/main",
        "before": "before-abc",
        "after": "after-xyz",
        "head_commit": {"message": "Another push", "author": {"name": "Dev"}},
        "commits": [{"modified": ["docs/index.md"], "added": []}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)

    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    new_task = (
        await db_session.scalars(
            select(Task)
            .where(Task.project_id == test_project.id, Task.status == "queued")
        )
    ).one()
    assert new_task.previous_task_id is None


async def test_webhook_skips_oversized_file(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    await db_session.commit()

    # лимит 10 символов: большой файл уходит в skipped(too_large), задача не создаётся.
    mocker.patch(
        "app.api.routes.webhook.get_settings",
        return_value=mocker.Mock(max_file_chars=10),
    )

    def content_by_path(repo, path, ref):
        if path == "docs/big.md":
            return ("x" * 50, "big-sha")
        return ("ok", "small-sha")

    github_client = mocker.Mock()
    github_client.get_file_content = mocker.AsyncMock(side_effect=content_by_path)
    github_client.get_file_sha = mocker.AsyncMock(return_value="target-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    mocker.patch("app.api.routes.webhook.pipeline_runner.schedule_task", new=mocker.AsyncMock())

    payload = {
        "ref": "refs/heads/main",
        "after": "after-sha",
        "commits": [{"added": ["docs/small.md"], "modified": ["docs/big.md"]}],
    }
    body, headers = sign_payload(test_project.plaintext_webhook_secret, payload)
    response = await client.post(f"/webhook/{test_project.id}", content=body, headers=headers)

    assert response.status_code == 202
    data = response.json()
    assert data["created"] == 1
    too_large = [s for s in data["skipped"] if s.get("reason") == "too_large"]
    assert len(too_large) == 1
    assert too_large[0]["file_path"] == "docs/big.md"
    assert too_large[0]["limit"] == 10

    tasks = (
        await db_session.scalars(select(Task).where(Task.project_id == test_project.id))
    ).all()
    assert {t.file_path for t in tasks} == {"docs/small.md"}


async def test_catch_up_reconciles_missed_files(client, db_session, test_project, test_user, mocker):
    test_user.github_id = 123456
    test_user.github_login = "octocat"
    test_user.github_access_token = encrypt_github_access_token("github-token")
    db_session.add(
        Task(
            user_id=test_user.id,
            project_id=test_project.id,
            team_id=test_project.team_id,
            file_path="docs/old.md",
            github_ref="refs/heads/main",
            github_sha="old-sha",
            original_content="# Old",
            status="published",
        )
    )
    await db_session.commit()

    mocker.patch(
        "app.api.routes.webhook.get_settings",
        return_value=mocker.Mock(catchup_secret="s3cr3t", max_file_chars=30000),
    )
    github_client = mocker.Mock()
    github_client.get_branch_head_sha = mocker.AsyncMock(return_value="new-sha")
    github_client.compare_files = mocker.AsyncMock(return_value=["docs/new.md"])
    github_client.get_file_content = mocker.AsyncMock(return_value=("# New", "src-sha"))
    github_client.get_file_sha = mocker.AsyncMock(return_value="tgt-sha")
    mocker.patch("app.api.routes.webhook.GitHubClient", return_value=github_client)
    mocker.patch("app.api.routes.webhook.pipeline_runner.schedule_task", new=mocker.AsyncMock())

    response = await client.post("/webhook/catch-up/all", headers={"X-Catchup-Token": "s3cr3t"})

    assert response.status_code == 200
    assert response.json()["created"] >= 1
    github_client.compare_files.assert_any_await(test_project.source_repo, "old-sha", "new-sha")
    new_tasks = (
        await db_session.scalars(
            select(Task).where(
                Task.file_path == "docs/new.md", Task.project_id == test_project.id
            )
        )
    ).all()
    assert len(new_tasks) == 1
    assert new_tasks[0].github_sha == "new-sha"


async def test_catch_up_rejects_bad_token(client, mocker):
    mocker.patch(
        "app.api.routes.webhook.get_settings",
        return_value=mocker.Mock(catchup_secret="s3cr3t"),
    )
    response = await client.post("/webhook/catch-up/all", headers={"X-Catchup-Token": "wrong"})
    assert response.status_code == 403


async def test_catch_up_disabled_without_secret(client, mocker):
    mocker.patch(
        "app.api.routes.webhook.get_settings",
        return_value=mocker.Mock(catchup_secret=None),
    )
    response = await client.post("/webhook/catch-up/all", headers={"X-Catchup-Token": "x"})
    assert response.status_code == 503
