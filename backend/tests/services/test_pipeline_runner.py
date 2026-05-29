from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.task import Task
from app.services import pipeline_runner
from app.services.dictionary_merger import MergedPipelineData
from app.services.incremental_translate import TranslationContext


async def create_task(db_session, test_project):
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


def reset_pipeline_runner_state():
    pipeline_runner.TASK_EVENT_QUEUES.clear()
    pipeline_runner._SCHEDULED_PIPELINES.clear()
    pipeline_runner._DEFERRED_TASKS.clear()
    pipeline_runner._PAUSED_PROJECTS.clear()
    pipeline_runner._BACKGROUND_TASKS.clear()
    pipeline_runner._CURRENT_TASK_ID = None
    pipeline_runner._CURRENT_EXECUTION = None
    pipeline_runner._WORKER_TASK = None
    pipeline_runner._PIPELINE_QUEUE = asyncio.Queue()


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
    assert updated_task.current_stage is None
    assert updated_task.translated_content == "# Translated"
    assert "[pipeline] pipeline log" in (updated_task.log or "")
    assert updated_task.error is None
    assert updated_task.completed_at is not None
    assert updated_task.incremental_paragraphs_count is None
    assert updated_task.incremental_total_paragraphs is None
    assert "[prepare] Полный перевод" in (updated_task.log or "")


async def test_run_task_incremental_merges_dirty_paragraphs(
    engine, db_session, test_project, mocker
):
    reset_pipeline_runner_state()
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

    ctx = TranslationContext(
        content="Changed B",
        is_incremental=True,
        dirty_indices=[1],
        aligned_old_ru={0: "RU A", 2: "RU C"},
        new_paras=["A", "Changed B", "C"],
    )
    mocker.patch(
        "app.services.pipeline_runner._build_translation_context",
        new=mocker.AsyncMock(return_value=ctx),
    )

    async def fake_execute(*, input_file, output_dir, logger, **kwargs):
        # only the dirty paragraph is fed to the pipeline
        assert input_file.read_text(encoding="utf-8") == "Changed B"
        logger.info("translating dirty")
        output_path = output_dir / input_file.name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("RU B", encoding="utf-8")
        return output_path

    mocker.patch("app.services.pipeline_runner._execute_pipeline", side_effect=fake_execute)

    await pipeline_runner.run_task(task.id)

    session_factory = make_session_factory(engine)
    async with session_factory() as session:
        updated_task = await session.get(Task, task.id)

    assert updated_task is not None
    assert updated_task.status == "done"
    # clean paragraphs reuse old RU, dirty paragraph uses fresh translation
    assert updated_task.translated_content == "RU A\n\nRU B\n\nRU C"
    assert updated_task.incremental_paragraphs_count == 1
    assert updated_task.incremental_total_paragraphs == 3
    assert "[prepare] Инкрементальный режим: 1 из 3 абзацев" in (updated_task.log or "")


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
    assert updated_task.current_stage is None
    assert updated_task.translated_content is None
    assert "RuntimeError: pipeline crashed" in (updated_task.error or "")
    assert "[pipeline] before failure" in (updated_task.log or "")
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
    assert "[pipeline] line one" in (updated_task.log or "")
    assert "[pipeline] line two" in (updated_task.log or "")


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
    stage_updates = [
        event["data"]["stage"]
        for event in events
        if event is not None and event["event"] == "stage_update"
    ]
    assert stage_updates == ["prepare", "pipeline", "persist"]
    assert any(
        event["event"] == "log_line" and event["data"]["line"] == "[pipeline] pipeline log"
        for event in events
        if event is not None
    )
    assert events[-2] == {"event": "status_change", "data": {"status": "done"}}
    assert events[-1] is None


async def test_schedule_task_preserves_queue_order(engine, db_session, test_project, mocker):
    reset_pipeline_runner_state()
    first_task = await create_task(db_session, test_project)
    second_task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )

    await pipeline_runner.schedule_task(first_task.id)
    await pipeline_runner.schedule_task(second_task.id)
    queued_task_ids = [
        await asyncio.wait_for(pipeline_runner._PIPELINE_QUEUE.get(), timeout=0.1),
        await asyncio.wait_for(pipeline_runner._PIPELINE_QUEUE.get(), timeout=0.1),
    ]

    session_factory = make_session_factory(engine)
    async with session_factory() as session:
        first_updated = await session.get(Task, first_task.id)
        second_updated = await session.get(Task, second_task.id)

    assert first_updated is not None
    assert second_updated is not None
    assert first_updated.status == "queued"
    assert second_updated.status == "queued"
    assert queued_task_ids == [first_task.id, second_task.id]
    assert first_task.id in pipeline_runner._SCHEDULED_PIPELINES
    assert second_task.id in pipeline_runner._SCHEDULED_PIPELINES


async def test_schedule_task_enqueues_task_only_once(
    engine,
    db_session,
    test_project,
    mocker,
):
    reset_pipeline_runner_state()
    task = await create_task(db_session, test_project)

    mocker.patch(
        "app.services.pipeline_runner.get_session_factory",
        return_value=make_session_factory(engine),
    )

    first_scheduled = await pipeline_runner.schedule_task(task.id)
    second_scheduled = await pipeline_runner.schedule_task(task.id)
    queued_task_id = await asyncio.wait_for(pipeline_runner._PIPELINE_QUEUE.get(), timeout=0.1)

    session_factory = make_session_factory(engine)
    async with session_factory() as session:
        updated_task = await session.get(Task, task.id)

    assert first_scheduled is True
    assert second_scheduled is False
    assert queued_task_id == task.id
    assert updated_task is not None
    assert updated_task.status == "queued"
    assert task.id in pipeline_runner._SCHEDULED_PIPELINES
    assert pipeline_runner._PIPELINE_QUEUE.empty()
