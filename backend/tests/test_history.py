from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.project import Project
from app.models.publication import Publication
from app.models.task import Task
from app.models.user import User


async def create_user(db_session, *, email: str, display_name: str, github_login: str | None = None) -> User:
    user = User(
        email=email,
        password_hash="hash",
        display_name=display_name,
        github_login=github_login,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def create_project(
    db_session,
    *,
    user: User,
    name: str,
    source_repo: str,
    target_repo: str,
) -> Project:
    project = Project(
        user_id=user.id,
        name=name,
        source_repo=source_repo,
        source_branch="main",
        target_repo=target_repo,
        target_branch="main",
        webhook_secret=secrets.token_hex(32),
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project


async def create_task_with_publication(
    db_session,
    *,
    project: Project,
    publisher: User,
    file_path: str,
    published_at: datetime | None = None,
) -> Publication:
    task = Task(
        user_id=project.user_id,
        project_id=project.id,
        file_path=file_path,
        github_ref="refs/heads/main",
        github_sha="commit-sha",
        commit_message="publish docs",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        translated_content="# Target",
        status="published",
    )
    db_session.add(task)
    await db_session.flush()

    publication = Publication(
        task_id=task.id,
        published_by=publisher.id,
        target_repo=project.target_repo,
        target_path=file_path,
        commit_sha="commit-sha",
        target_file_sha_before="target-sha",
    )
    if published_at is not None:
        publication.published_at = published_at
    db_session.add(publication)
    await db_session.commit()
    await db_session.refresh(publication)
    return publication


async def test_history_empty_when_no_projects(auth_client, db_session):
    response = await auth_client.get("/history")

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 50, "offset": 0}


async def test_history_shared_by_source_repo(auth_client, db_session, test_user):
    teammate = await create_user(
        db_session,
        email="teammate@example.com",
        display_name="Teammate",
        github_login="teammate-gh",
    )
    teammate_project = await create_project(
        db_session,
        user=teammate,
        name="Teammate Project",
        source_repo="Team/Docs",
        target_repo="team/docs-en",
    )
    publication = await create_task_with_publication(
        db_session,
        project=teammate_project,
        publisher=teammate,
        file_path="docs/shared.md",
    )

    own_project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/other-en",
    )
    await create_task_with_publication(
        db_session,
        project=own_project,
        publisher=test_user,
        file_path="docs/own.md",
    )

    response = await auth_client.get("/history")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert {item["file_path"] for item in payload["items"]} == {"docs/shared.md", "docs/own.md"}

    teammate_item = next(item for item in payload["items"] if item["file_path"] == "docs/shared.md")
    assert teammate_item["id"] == str(publication.id)
    assert teammate_item["source_repo"] == "Team/Docs"
    assert teammate_item["published_by"]["display_name"] == "Teammate"
    assert teammate_item["published_by"]["github_login"] == "teammate-gh"


async def test_history_isolated_by_source_repo(auth_client, db_session, test_user):
    own_project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    await create_task_with_publication(
        db_session,
        project=own_project,
        publisher=test_user,
        file_path="docs/own.md",
    )

    outsider = await create_user(
        db_session,
        email="outsider@example.com",
        display_name="Outsider",
        github_login="outsider-gh",
    )
    outsider_project = await create_project(
        db_session,
        user=outsider,
        name="Outsider Project",
        source_repo="another/repo",
        target_repo="another/repo-en",
    )
    await create_task_with_publication(
        db_session,
        project=outsider_project,
        publisher=outsider,
        file_path="docs/outsider.md",
    )

    response = await auth_client.get("/history")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["file_path"] == "docs/own.md"


async def test_history_filter_by_project(auth_client, db_session, test_user):
    first_project = await create_project(
        db_session,
        user=test_user,
        name="First Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    second_project = await create_project(
        db_session,
        user=test_user,
        name="Second Project",
        source_repo="team/docs",
        target_repo="team/docs-alt-en",
    )
    await create_task_with_publication(
        db_session,
        project=first_project,
        publisher=test_user,
        file_path="docs/first.md",
    )
    await create_task_with_publication(
        db_session,
        project=second_project,
        publisher=test_user,
        file_path="docs/second.md",
    )

    response = await auth_client.get(f"/history?project_id={first_project.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["file_path"] == "docs/first.md"


async def test_history_filter_by_published_by(auth_client, db_session, test_user):
    project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    teammate = await create_user(
        db_session,
        email="teammate@example.com",
        display_name="Teammate",
    )
    teammate_project = await create_project(
        db_session,
        user=teammate,
        name="Teammate Project",
        source_repo="team/docs",
        target_repo="team/other-en",
    )

    await create_task_with_publication(
        db_session,
        project=project,
        publisher=test_user,
        file_path="docs/own.md",
    )
    await create_task_with_publication(
        db_session,
        project=teammate_project,
        publisher=teammate,
        file_path="docs/teammate.md",
    )

    response = await auth_client.get(f"/history?published_by={test_user.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["file_path"] == "docs/own.md"


async def test_history_orphaned_publication_hidden(auth_client, db_session, test_user):
    project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    publication = await create_task_with_publication(
        db_session,
        project=project,
        publisher=test_user,
        file_path="docs/orphaned.md",
    )

    task = await db_session.scalar(select(Task).where(Task.id == publication.task_id))
    assert task is not None
    task.project_id = None
    await db_session.commit()

    response = await auth_client.get("/history")

    assert response.status_code == 200
    assert response.json()["total"] == 0


async def test_history_date_filters_and_sorting(auth_client, db_session, test_user):
    project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    now = datetime.now(UTC)
    older = await create_task_with_publication(
        db_session,
        project=project,
        publisher=test_user,
        file_path="docs/older.md",
        published_at=now - timedelta(days=3),
    )
    newer = await create_task_with_publication(
        db_session,
        project=project,
        publisher=test_user,
        file_path="docs/newer.md",
        published_at=now - timedelta(days=1),
    )

    response = await auth_client.get(
        "/history",
        params={
            "from": older.published_at.isoformat(),
            "to": newer.published_at.isoformat(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert [item["file_path"] for item in payload["items"]] == ["docs/newer.md", "docs/older.md"]
