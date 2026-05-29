from __future__ import annotations

import asyncio
import uuid

import pytest

from app.api.routes import tasks as task_routes
from app.models.task import Task
from app.services import pipeline_runner, task_list_events


async def create_task(db_session, test_project, status: str) -> Task:
    task = Task(
        user_id=test_project.user_id,
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


async def test_task_events_disconnect_keeps_queue_for_reconnect(db_session, test_project):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project, "running")

    queue: asyncio.Queue = asyncio.Queue()
    await queue.put(
        {"event": "stage_update", "data": {"stage": "pipeline", "index": 2, "total": 3}}
    )
    pipeline_runner.TASK_EVENT_QUEUES[task.id] = queue

    class FakeRequest:
        def __init__(self) -> None:
            self._calls = 0

        async def is_disconnected(self) -> bool:
            self._calls += 1
            return self._calls > 1

    stream = task_routes._stream_task_events(task.id, FakeRequest())

    assert await anext(stream) == ": connected\n\n"
    assert "event: stage_update" in await anext(stream)

    with pytest.raises(StopAsyncIteration):
        await anext(stream)

    assert task.id in pipeline_runner.TASK_EVENT_QUEUES


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


async def test_task_events_conflict_returns_current_status(auth_client, db_session, test_project):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project, "conflict")

    async with auth_client.stream("GET", f"/tasks/{task.id}/events") as response:
        body = await response.aread()

    text = body.decode("utf-8")
    assert response.status_code == 200
    assert "event: status_change" in text
    assert '"status": "conflict"' in text


async def test_task_events_not_found(auth_client):
    response = await auth_client.get(f"/tasks/{uuid.uuid4()}/events")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


async def test_task_list_events_stream_emits_matching_scope_event(
    auth_client,
    db_session,
    test_project,
):
    task_list_events.TASK_LIST_EVENT_SUBSCRIPTIONS.clear()
    task = await create_task(db_session, test_project, "queued")

    async def emit_once_subscribed():
        while not task_list_events.TASK_LIST_EVENT_SUBSCRIPTIONS:
            await asyncio.sleep(0)
        subscription = next(iter(task_list_events.TASK_LIST_EVENT_SUBSCRIPTIONS.values()))
        task_list_events.publish_task_entered_scope(task)
        task_list_events.close_subscription(subscription.id)

    emitter = asyncio.create_task(emit_once_subscribed())
    try:
        async with auth_client.stream("GET", "/tasks/events?status=queued") as response:
            body = await response.aread()
    finally:
        await emitter

    text = body.decode("utf-8")
    assert response.status_code == 200
    assert "event: task_entered" in text
    assert f'"task_id": "{task.id}"' in text


async def test_task_list_events_stream_emits_when_task_enters_status_scope(
    auth_client,
    db_session,
    test_project,
):
    task_list_events.TASK_LIST_EVENT_SUBSCRIPTIONS.clear()
    task = await create_task(db_session, test_project, "failed")

    async def emit_once_subscribed():
        while not task_list_events.TASK_LIST_EVENT_SUBSCRIPTIONS:
            await asyncio.sleep(0)
        subscription = next(iter(task_list_events.TASK_LIST_EVENT_SUBSCRIPTIONS.values()))
        task_list_events.publish_task_entered_scope(task, previous_status="running")
        task_list_events.close_subscription(subscription.id)

    emitter = asyncio.create_task(emit_once_subscribed())
    try:
        async with auth_client.stream("GET", "/tasks/events?status=failed") as response:
            body = await response.aread()
    finally:
        await emitter

    text = body.decode("utf-8")
    assert response.status_code == 200
    assert "event: task_entered" in text
    assert '"status": "failed"' in text
