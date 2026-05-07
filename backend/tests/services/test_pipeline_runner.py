from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.task import Task
from app.services import pipeline_runner
from app.services.dictionary_merger import MergedPipelineData


async def create_task(db_session, test_project):
    task = Task(
        project_id=test_project.id,
        file_path="docs/index.md",
        github_ref="refs/heads/main",
        github_sha="after-sha",
        commit_message="Update docs",
        source_file_sha="source-sha",
        target_file_sha="target-sha",
        original_content="# Source",
        status="queued",
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


def make_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def drain_queue(queue):
    items = []
    while not queue.empty():
        items.append(queue.get_nowait())
    return items


async def test_run_task_success(engine, db_session, test_project, mocker):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )
    mocker.patch(
        "app.services.pipeline_runner.dictionary_merger.merge_pipeline_data",
        new=mocker.AsyncMock(
            return_value=MergedPipelineData(
                dictionary={"a": "b"},
                glossary={"x": "y"},
                prompt="Prompt",
                pre_translator_files={
                    "static_terms": {},
                    "section_headings": {},
                    "note_titles": {},
                    "include_labels": {},
                },
            )
        ),
    )

    async def fake_execute(
        *,
        input_file,
        output_dir,
        pre_translator_dir,
        merged_data,
        logger,
    ):
        assert input_file.read_text(encoding="utf-8") == "# Source"
        assert pre_translator_dir.exists()
        logger.info("pipeline log")
        output_path = output_dir / input_file.name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("# Translated", encoding="utf-8")
        return output_path

    mocker.patch("app.services.pipeline_runner._execute_pipeline", side_effect=fake_execute)

    await pipeline_runner.run_task(task.id)

    session_factory = make_session_factory(engine)
    async with session_factory() as session:
        updated_task = await session.get(Task, task.id)

    assert updated_task is not None
    assert updated_task.status == "done"
    assert updated_task.translated_content == "# Translated"
    assert "pipeline log" in (updated_task.log or "")
    assert updated_task.error is None
    assert updated_task.completed_at is not None


async def test_run_task_failure_sets_failed_status(engine, db_session, test_project, mocker):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )
    mocker.patch(
        "app.services.pipeline_runner.dictionary_merger.merge_pipeline_data",
        new=mocker.AsyncMock(
            return_value=MergedPipelineData(
                dictionary={},
                glossary={},
                prompt="Prompt",
                pre_translator_files={
                    "static_terms": {},
                    "section_headings": {},
                    "note_titles": {},
                    "include_labels": {},
                },
            )
        ),
    )

    async def fake_execute(*, logger, **kwargs):
        logger.info("before failure")
        raise RuntimeError("pipeline crashed")

    mocker.patch("app.services.pipeline_runner._execute_pipeline", side_effect=fake_execute)

    await pipeline_runner.run_task(task.id)

    session_factory = make_session_factory(engine)
    async with session_factory() as session:
        updated_task = await session.get(Task, task.id)

    assert updated_task is not None
    assert updated_task.status == "failed"
    assert updated_task.translated_content is None
    assert "RuntimeError: pipeline crashed" in (updated_task.error or "")
    assert "before failure" in (updated_task.log or "")
    assert updated_task.completed_at is not None


async def test_run_task_captures_log(engine, db_session, test_project, mocker):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )
    mocker.patch(
        "app.services.pipeline_runner.dictionary_merger.merge_pipeline_data",
        new=mocker.AsyncMock(
            return_value=MergedPipelineData(
                dictionary={},
                glossary={},
                prompt="Prompt",
                pre_translator_files={
                    "static_terms": {},
                    "section_headings": {},
                    "note_titles": {},
                    "include_labels": {},
                },
            )
        ),
    )

    async def fake_execute(
        *,
        input_file,
        output_dir,
        pre_translator_dir,
        merged_data,
        logger,
    ):
        logger.info("line one")
        logger.warning("line two")
        output_path = output_dir / input_file.name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("# Translated", encoding="utf-8")
        return output_path

    mocker.patch("app.services.pipeline_runner._execute_pipeline", side_effect=fake_execute)

    await pipeline_runner.run_task(task.id)

    session_factory = make_session_factory(engine)
    async with session_factory() as session:
        updated_task = await session.get(Task, task.id)

    assert updated_task is not None
    assert "line one" in (updated_task.log or "")
    assert "line two" in (updated_task.log or "")


async def test_run_task_emits_sse_events(engine, db_session, test_project, mocker):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )
    mocker.patch(
        "app.services.pipeline_runner.dictionary_merger.merge_pipeline_data",
        new=mocker.AsyncMock(
            return_value=MergedPipelineData(
                dictionary={},
                glossary={},
                prompt="Prompt",
                pre_translator_files={
                    "static_terms": {},
                    "section_headings": {},
                    "note_titles": {},
                    "include_labels": {},
                },
            )
        ),
    )

    async def fake_execute(
        *,
        input_file,
        output_dir,
        pre_translator_dir,
        merged_data,
        logger,
    ):
        logger.info("pipeline log")
        output_path = output_dir / input_file.name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("# Translated", encoding="utf-8")
        return output_path

    mocker.patch("app.services.pipeline_runner._execute_pipeline", side_effect=fake_execute)

    await pipeline_runner.run_task(task.id)

    queue = pipeline_runner.TASK_EVENT_QUEUES[task.id]
    events = drain_queue(queue)

    assert events[0]["event"] == "stage_update"
    assert events[0]["data"]["stage"] == "prepare"
    assert events[1]["event"] == "stage_update"
    assert events[1]["data"]["stage"] == "pipeline"
    assert any(event["event"] == "log_line" for event in events if event is not None)
    assert events[-2] == {"event": "status_change", "data": {"status": "done"}}
    assert events[-1] is None


async def test_run_task_uses_lock(engine, db_session, test_project, mocker):
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    first_task = await create_task(db_session, test_project)
    second_task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )
    mocker.patch(
        "app.services.pipeline_runner.dictionary_merger.merge_pipeline_data",
        new=mocker.AsyncMock(
            return_value=MergedPipelineData(
                dictionary={},
                glossary={},
                prompt="Prompt",
                pre_translator_files={
                    "static_terms": {},
                    "section_headings": {},
                    "note_titles": {},
                    "include_labels": {},
                },
            )
        ),
    )

    call_order: list[int] = []
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    call_count = 0

    async def fake_execute(*, input_file, output_dir, **kwargs):
        nonlocal call_count
        call_count += 1
        n = call_count
        call_order.append(n)
        if n == 1:
            first_started.set()
            await release_first.wait()
        output_path = output_dir / input_file.name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("# done", encoding="utf-8")
        return output_path

    mocker.patch("app.services.pipeline_runner._execute_pipeline", side_effect=fake_execute)

    first_run = asyncio.create_task(pipeline_runner.run_task(first_task.id))
    second_run = asyncio.create_task(pipeline_runner.run_task(second_task.id))

    await first_started.wait()
    await asyncio.sleep(0.05)
    assert call_order == [1]  # second task hasn't entered yet — lock is held

    release_first.set()
    await asyncio.gather(first_run, second_run)

    assert call_order == [1, 2]  # both ran, sequentially
