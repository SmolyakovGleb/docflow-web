from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from app.models.project import Project
from app.models.task import Task
from app.models.user import User


async def create_user(db_session, *, email: str, display_name: str) -> User:
    user = User(
        email=email,
        password_hash="hash",
        display_name=display_name,
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


async def create_task(
    db_session,
    *,
    project: Project,
    file_path: str,
    status: str,
    created_at: datetime,
    completed_at: datetime | None = None,
    error: str | None = None,
) -> Task:
    task = Task(
        project_id=project.id,
        file_path=file_path,
        github_ref="refs/heads/main",
        github_sha="commit-sha",
        commit_message="analytics docs",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        translated_content="# Target" if status in {"done", "published"} else None,
        status=status,
        error=error,
        created_at=created_at,
        completed_at=completed_at,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


async def test_analytics_empty_when_no_projects(auth_client, db_session):
    response = await auth_client.get("/analytics")

    assert response.status_code == 200
    assert response.json() == {
        "total_tasks": 0,
        "success_rate": 0.0,
        "avg_duration_seconds": 0.0,
        "tasks_by_status": {
            "queued": 0,
            "running": 0,
            "done": 0,
            "failed": 0,
            "published": 0,
        },
        "tasks_per_day": [],
        "top_errors": [],
    }


async def test_analytics_success_rate(auth_client, db_session, test_user):
    own_project = await create_project(
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
        source_repo="TEAM/DOCS",
        target_repo="team/other-en",
    )
    outsider = await create_user(
        db_session,
        email="outsider@example.com",
        display_name="Outsider",
    )
    outsider_project = await create_project(
        db_session,
        user=outsider,
        name="Outsider Project",
        source_repo="another/repo",
        target_repo="another/repo-en",
    )

    base = datetime(2026, 5, 1, 10, 0, tzinfo=UTC)
    await create_task(
        db_session,
        project=own_project,
        file_path="docs/done.md",
        status="done",
        created_at=base,
        completed_at=base + timedelta(minutes=5),
    )
    await create_task(
        db_session,
        project=own_project,
        file_path="docs/published.md",
        status="published",
        created_at=base + timedelta(hours=1),
        completed_at=base + timedelta(hours=1, minutes=10),
    )
    await create_task(
        db_session,
        project=own_project,
        file_path="docs/failed.md",
        status="failed",
        created_at=base + timedelta(hours=2),
        completed_at=base + timedelta(hours=2, minutes=15),
        error="Traceback...\nValueError: bad payload",
    )
    await create_task(
        db_session,
        project=own_project,
        file_path="docs/queued.md",
        status="queued",
        created_at=base + timedelta(hours=3),
    )
    await create_task(
        db_session,
        project=teammate_project,
        file_path="docs/shared.md",
        status="done",
        created_at=base + timedelta(hours=4),
        completed_at=base + timedelta(hours=4, minutes=20),
    )
    await create_task(
        db_session,
        project=outsider_project,
        file_path="docs/hidden.md",
        status="failed",
        created_at=base + timedelta(hours=5),
        completed_at=base + timedelta(hours=5, minutes=30),
        error="Traceback...\nRuntimeError: hidden",
    )

    response = await auth_client.get("/analytics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_tasks"] == 5
    assert payload["success_rate"] == 0.75
    assert payload["tasks_by_status"] == {
        "queued": 1,
        "running": 0,
        "done": 2,
        "failed": 1,
        "published": 1,
    }
    assert payload["avg_duration_seconds"] == 750.0


async def test_analytics_tasks_per_day_and_top_errors(auth_client, db_session, test_user):
    project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    day_one = datetime(2026, 5, 1, 8, 0, tzinfo=UTC)
    day_two = datetime(2026, 5, 2, 9, 0, tzinfo=UTC)

    await create_task(
        db_session,
        project=project,
        file_path="docs/one.md",
        status="failed",
        created_at=day_one,
        completed_at=day_one + timedelta(minutes=5),
        error="Traceback...\nValidationError: broken schema",
    )
    await create_task(
        db_session,
        project=project,
        file_path="docs/two.md",
        status="failed",
        created_at=day_two,
        completed_at=day_two + timedelta(minutes=15),
        error="Traceback...\nValidationError: broken schema",
    )
    await create_task(
        db_session,
        project=project,
        file_path="docs/three.md",
        status="failed",
        created_at=day_two + timedelta(hours=1),
        completed_at=day_two + timedelta(hours=1, minutes=10),
        error="Traceback...\nRuntimeError: pipeline crashed",
    )

    response = await auth_client.get("/analytics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["tasks_per_day"] == [
        {"date": "2026-05-01", "count": 1},
        {"date": "2026-05-02", "count": 2},
    ]
    assert payload["top_errors"] == [
        {"error_type": "ValidationError", "count": 2},
        {"error_type": "RuntimeError", "count": 1},
    ]


async def test_analytics_filter_by_project(auth_client, db_session, test_user):
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
    base = datetime(2026, 5, 1, 10, 0, tzinfo=UTC)

    await create_task(
        db_session,
        project=first_project,
        file_path="docs/first.md",
        status="done",
        created_at=base,
        completed_at=base + timedelta(minutes=5),
    )
    await create_task(
        db_session,
        project=second_project,
        file_path="docs/second.md",
        status="failed",
        created_at=base + timedelta(hours=1),
        completed_at=base + timedelta(hours=1, minutes=5),
        error="Traceback...\nRuntimeError: failed",
    )

    response = await auth_client.get(f"/analytics?project_id={first_project.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_tasks"] == 1
    assert payload["tasks_by_status"]["done"] == 1
    assert payload["tasks_by_status"]["failed"] == 0


async def test_analytics_empty_range_returns_zeroes(auth_client, db_session, test_user):
    project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    created_at = datetime(2026, 5, 1, 10, 0, tzinfo=UTC)
    await create_task(
        db_session,
        project=project,
        file_path="docs/file.md",
        status="done",
        created_at=created_at,
        completed_at=created_at + timedelta(minutes=5),
    )

    response = await auth_client.get(
        "/analytics?from=2026-05-10T00:00:00Z&to=2026-05-11T00:00:00Z"
    )

    assert response.status_code == 200
    assert response.json() == {
        "total_tasks": 0,
        "success_rate": 0.0,
        "avg_duration_seconds": 0.0,
        "tasks_by_status": {
            "queued": 0,
            "running": 0,
            "done": 0,
            "failed": 0,
            "published": 0,
        },
        "tasks_per_day": [],
        "top_errors": [],
    }


async def test_analytics_date_range_boundary(auth_client, db_session, test_user):
    project = await create_project(
        db_session,
        user=test_user,
        name="Own Project",
        source_repo="team/docs",
        target_repo="team/docs-en",
    )
    lower = datetime(2026, 5, 1, 0, 0, tzinfo=UTC)
    upper = datetime(2026, 5, 2, 0, 0, tzinfo=UTC)

    await create_task(
        db_session,
        project=project,
        file_path="docs/before.md",
        status="done",
        created_at=lower - timedelta(seconds=1),
        completed_at=lower + timedelta(minutes=1),
    )
    await create_task(
        db_session,
        project=project,
        file_path="docs/lower.md",
        status="done",
        created_at=lower,
        completed_at=lower + timedelta(minutes=2),
    )
    await create_task(
        db_session,
        project=project,
        file_path="docs/upper.md",
        status="done",
        created_at=upper,
        completed_at=upper + timedelta(minutes=3),
    )

    response = await auth_client.get(
        "/analytics",
        params={
            "from": lower.isoformat(),
            "to": upper.isoformat(),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_tasks"] == 2
    assert payload["tasks_per_day"] == [
        {"date": "2026-05-01", "count": 1},
        {"date": "2026-05-02", "count": 1},
    ]
