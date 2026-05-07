from __future__ import annotations

import asyncio
import uuid

from app.models.task import Task
from app.services import pipeline_runner


async def create_task(db_session, test_project, status: str) -> Task:
    task = Task(
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="after-sha",
        commit_message="Update docs",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        status=status,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


async def test_task_events_running_stream(auth_client, db_session, test_project):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project, "running")

    queue: asyncio.Queue = asyncio.Queue()
    await queue.put(
        {"event": "stage_update", "data": {"stage": "pipeline", "index": 2, "total": 3}}
    )
    await queue.put({"event": "log_line", "data": {"line": "hello"}})
    await queue.put({"event": "status_change", "data": {"status": "done"}})
    await queue.put(None)
    pipeline_runner.TASK_EVENT_QUEUES[task.id] = queue

    async with auth_client.stream("GET", f"/tasks/{task.id}/events") as response:
        body = await response.aread()

    text = body.decode("utf-8")
    assert response.status_code == 200
    assert "event: stage_update" in text
    assert '"stage": "pipeline"' in text
    assert "event: log_line" in text
    assert '"line": "hello"' in text
    assert "event: status_change" in text
    assert '"status": "done"' in text
    assert task.id not in pipeline_runner.TASK_EVENT_QUEUES


async def test_task_events_queued_returns_status_and_closes(auth_client, db_session, test_project):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project, "queued")

    async with auth_client.stream("GET", f"/tasks/{task.id}/events") as response:
        body = await response.aread()

    text = body.decode("utf-8")
    assert response.status_code == 200
    assert "event: status_change" in text
    assert '"status": "queued"' in text


async def test_task_events_finished_returns_current_status(auth_client, db_session, test_project):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project, "done")

    async with auth_client.stream("GET", f"/tasks/{task.id}/events") as response:
        body = await response.aread()

    text = body.decode("utf-8")
    assert response.status_code == 200
    assert "event: status_change" in text
    assert '"status": "done"' in text


async def test_task_events_not_found(auth_client):
    response = await auth_client.get(f"/tasks/{uuid.uuid4()}/events")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}
