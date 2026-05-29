from __future__ import annotations

import asyncio
import importlib
import json
import logging
import shutil
import sys
import tempfile
import traceback
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from cryptography.fernet import InvalidToken
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services import dictionary_merger, incremental_translate, paragraph_diff, task_list_events
from app.services.auth import decrypt_github_access_token
from app.services.github import GitHubClient
from app.services.incremental_translate import TranslationContext

PIPELINE_ROOT = Path(__file__).resolve().parents[3] / "pipeline"
TASK_EVENT_QUEUES: dict[UUID, asyncio.Queue[dict[str, Any] | None]] = {}
_BACKGROUND_TASKS: set[asyncio.Task] = set()
_SCHEDULED_PIPELINES: dict[UUID, bool] = {}
_PIPELINE_QUEUE: asyncio.Queue[UUID] = asyncio.Queue()
_DEFERRED_TASKS: dict[UUID, list[UUID]] = {}  # project_id → [task_ids]
_PAUSED_PROJECTS: set[UUID] = set()
_CURRENT_TASK_ID: UUID | None = None
_CURRENT_EXECUTION: asyncio.Task[None] | None = None
_WORKER_TASK: asyncio.Task[None] | None = None
MAX_TASK_EVENT_QUEUES = 200
app_logger = logging.getLogger(__name__)


def _evict_oldest_queues_if_needed() -> None:
    while len(TASK_EVENT_QUEUES) >= MAX_TASK_EVENT_QUEUES:
        oldest_id = next(iter(TASK_EVENT_QUEUES))
        evicted = TASK_EVENT_QUEUES.pop(oldest_id, None)
        if evicted is not None:
            evicted.put_nowait(None)


def _sanitize_error(error_text: str) -> str:
    settings = get_settings()
    secrets_to_mask: list[str] = []
    if settings.api_key:
        secrets_to_mask.append(settings.api_key)
    if settings.session_secret:
        secrets_to_mask.append(settings.session_secret)
    for secret in secrets_to_mask:
        if secret and len(secret) >= 8:
            error_text = error_text.replace(secret, "***REDACTED***")
    return error_text


class QueueLogHandler(logging.Handler):
    _KNOWN_STAGE_PREFIXES = ("[prepare]", "[pipeline]", "[persist]")

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        queue: asyncio.Queue[dict[str, Any] | None],
        *,
        stage: str | None = None,
    ) -> None:
        super().__init__()
        self._loop = loop
        self._queue = queue
        self._lines: list[str] = []
        self._stage = stage
        self.setFormatter(logging.Formatter("%(message)s"))

    def set_stage(self, stage: str | None) -> None:
        self._stage = stage

    def _format_line(self, line: str) -> str:
        trimmed = line.lstrip()
        if not self._stage or trimmed.startswith(self._KNOWN_STAGE_PREFIXES):
            return line
        return f"[{self._stage}] {line}"

    def emit(self, record: logging.LogRecord) -> None:
        line = self._format_line(self.format(record))
        self._lines.append(line)
        self._loop.call_soon_threadsafe(
            self._queue.put_nowait,
            {"event": "log_line", "data": {"line": line}},
        )

    def get_log(self) -> str:
        return "\n".join(self._lines)


def format_sse_event(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _build_task_logger(task_id: UUID, handler: QueueLogHandler) -> logging.Logger:
    logger = logging.getLogger(f"docflow.pipeline.{task_id}")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.handlers.clear()
    logger.addHandler(handler)
    return logger


async def _emit_event(
    queue: asyncio.Queue[dict[str, Any] | None],
    event: str,
    data: dict[str, Any],
) -> None:
    await queue.put({"event": event, "data": data})


async def _set_stage(
    session,
    task: Task,
    queue: asyncio.Queue[dict[str, Any] | None],
    handler: QueueLogHandler | None = None,
    *,
    stage: str,
    index: int,
    total: int,
) -> None:
    task.current_stage = stage
    if handler is not None:
        handler.set_stage(stage)
    await session.commit()
    await _emit_event(queue, "stage_update", {"stage": stage, "index": index, "total": total})


def _prepare_workspace(
    task: Task,
    merged_data: dictionary_merger.MergedPipelineData,
    content: str,
) -> tuple[Path, Path, Path, Path]:
    workspace = Path(tempfile.mkdtemp(prefix=f"docflow_{task.id}_"))
    input_dir = workspace / "input"
    output_dir = workspace / "output"
    pre_translator_dir = workspace / "pre_translator"

    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    dictionary_merger.write_pre_translator_files(
        pre_translator_dir,
        merged_data.pre_translator_files,
    )

    input_file = input_dir / Path(task.file_path).name
    input_file.write_text(content, encoding="utf-8")
    return workspace, input_file, output_dir, pre_translator_dir


def _load_pipeline_modules():
    pipeline_root = str(PIPELINE_ROOT)
    if pipeline_root not in sys.path:
        sys.path.insert(0, pipeline_root)

    pipeline_module = importlib.import_module("src.pipeline")
    pre_translator_config = importlib.import_module("src.processors.pre_translator.config")
    return pipeline_module, pre_translator_config


def _patched_pipeline_dirs(output_dir: Path, pre_translator_dir: Path):
    from contextlib import contextmanager

    @contextmanager
    def _ctx():
        pipeline_module, pre_translator_config = _load_pipeline_modules()
        original_output_dir = pipeline_module.OUTPUT_DIR
        original_pre_translator_dir = pre_translator_config._DEFAULT_DATA_DIR
        pipeline_module.OUTPUT_DIR = output_dir
        pre_translator_config._DEFAULT_DATA_DIR = pre_translator_dir
        try:
            yield pipeline_module
        finally:
            pipeline_module.OUTPUT_DIR = original_output_dir
            pre_translator_config._DEFAULT_DATA_DIR = original_pre_translator_dir

    return _ctx()


def _run_pipeline_sync(
    *,
    input_file: Path,
    output_dir: Path,
    pre_translator_dir: Path,
    merged_data: dictionary_merger.MergedPipelineData,
    logger: logging.Logger,
) -> Path:
    with _patched_pipeline_dirs(output_dir, pre_translator_dir) as pipeline_module:
        pipeline_module.run(
            str(input_file),
            False,
            merged_data.dictionary,
            merged_data.prompt,
            logger,
            merged_data.glossary,
            False,
        )
    return output_dir / input_file.name


async def _execute_pipeline(
    *,
    input_file: Path,
    output_dir: Path,
    pre_translator_dir: Path,
    merged_data: dictionary_merger.MergedPipelineData,
    logger: logging.Logger,
) -> Path:
    return await run_in_threadpool(
        _run_pipeline_sync,
        input_file=input_file,
        output_dir=output_dir,
        pre_translator_dir=pre_translator_dir,
        merged_data=merged_data,
        logger=logger,
    )

async def _cleanup_queue_after(task_id: UUID, delay: float) -> None:
    await asyncio.sleep(delay)
    TASK_EVENT_QUEUES.pop(task_id, None)


async def schedule_task(task_id: UUID) -> bool:
    if task_id in _SCHEDULED_PIPELINES:
        return False
    _PIPELINE_QUEUE.put_nowait(task_id)
    _SCHEDULED_PIPELINES[task_id] = True
    return True


async def cancel_task(task_id: UUID) -> bool:
    if _CURRENT_TASK_ID == task_id and _CURRENT_EXECUTION is not None:
        _CURRENT_EXECUTION.cancel()
        return True
    return False


async def pause_project(project_id: UUID) -> None:
    _PAUSED_PROJECTS.add(project_id)
    if _CURRENT_TASK_ID is not None and _CURRENT_EXECUTION is not None:
        session_factory = get_session_factory()
        async with session_factory() as session:
            task = await session.get(Task, _CURRENT_TASK_ID)
            if task is not None and task.project_id == project_id:
                # Save to deferred so resume_project re-enqueues it
                _DEFERRED_TASKS.setdefault(project_id, []).append(_CURRENT_TASK_ID)
                _CURRENT_EXECUTION.cancel()


async def resume_project(project_id: UUID) -> None:
    from sqlalchemy import select
    _PAUSED_PROJECTS.discard(project_id)
    deferred = _DEFERRED_TASKS.pop(project_id, [])
    for task_id in deferred:
        _PIPELINE_QUEUE.put_nowait(task_id)
        _SCHEDULED_PIPELINES[task_id] = True
    # Also scan DB for queued tasks (handles server restart scenario)
    session_factory = get_session_factory()
    async with session_factory() as session:
        queued = (await session.scalars(
            select(Task.id).where(
                Task.project_id == project_id,
                Task.status == "queued",
                Task.id.notin_(list(_SCHEDULED_PIPELINES.keys())),
            ).order_by(Task.created_at)
        )).all()
        for task_id in queued:
            _PIPELINE_QUEUE.put_nowait(task_id)
            _SCHEDULED_PIPELINES[task_id] = True


async def _queue_worker() -> None:
    global _CURRENT_TASK_ID, _CURRENT_EXECUTION

    while True:
        task_id = await _PIPELINE_QUEUE.get()
        _SCHEDULED_PIPELINES.pop(task_id, None)

        session_factory = get_session_factory()
        async with session_factory() as session:
            task = await session.get(Task, task_id)
            if task is None or task.status != "queued":
                continue
            if task.project_id in _PAUSED_PROJECTS:
                _DEFERRED_TASKS.setdefault(task.project_id, []).append(task_id)
                continue

        _CURRENT_TASK_ID = task_id
        _CURRENT_EXECUTION = asyncio.create_task(
            run_task(task_id), name=f"docflow.task.{task_id}"
        )
        _BACKGROUND_TASKS.add(_CURRENT_EXECUTION)
        try:
            await _CURRENT_EXECUTION
        except asyncio.CancelledError:
            pass  # inner task was cancelled (user cancel or project pause) — worker continues
        except Exception:
            app_logger.exception("queue_worker_unexpected_error", extra={"task_id": str(task_id)})
        finally:
            _BACKGROUND_TASKS.discard(_CURRENT_EXECUTION)
            _CURRENT_EXECUTION = None
            _CURRENT_TASK_ID = None


async def _build_github_client(session, project: Project) -> GitHubClient | None:
    owner = await session.get(User, project.user_id)
    if owner is None or not owner.github_access_token:
        return None
    try:
        token = decrypt_github_access_token(owner.github_access_token)
    except InvalidToken:
        return None
    return GitHubClient(token)


async def _build_translation_context(
    session,
    task: Task,
) -> TranslationContext | None:
    """Best-effort incremental translation context.

    Returns None to mean "translate the full original content". Any failure
    (no project, no GitHub link, GitHub error) degrades gracefully to full
    translation rather than failing the task.
    """
    if task.project_id is None or task.previous_task_id is None or task.before_sha is None:
        return None
    project = await session.get(Project, task.project_id)
    if project is None:
        return None
    github_client = await _build_github_client(session, project)
    if github_client is None:
        return None
    try:
        return await incremental_translate.build_translation_context(
            task, project, task.original_content, github_client
        )
    except Exception:
        app_logger.exception(
            "incremental_context_failed", extra={"task_id": str(task.id)}
        )
        return None


def _assemble_translation(
    ctx: TranslationContext | None,
    output_text: str,
    logger: logging.Logger,
) -> tuple[str, int | None, int | None]:
    """Build the final translated content from the pipeline output.

    Returns (translated_content, incremental_paragraphs_count, incremental_total_paragraphs).
    For full translation the two counts are None.
    """
    if ctx is None or not ctx.is_incremental:
        return output_text, None, None

    dirty = ctx.dirty_indices
    out_paras = paragraph_diff.split_paragraphs(output_text)
    if len(out_paras) != len(dirty):
        logger.warning(
            "Инкрементальный перевод: ожидалось %d абзацев, получено %d — "
            "сборка по доступным",
            len(dirty),
            len(out_paras),
        )
    new_translations = {
        dirty[k]: out_paras[k] for k in range(min(len(dirty), len(out_paras)))
    }
    merged = paragraph_diff.merge_translations(
        ctx.new_paras, dirty, new_translations, ctx.aligned_old_ru
    )
    return merged, len(dirty), len(ctx.new_paras)


async def run_task(task_id: UUID) -> None:
    session_factory = get_session_factory()

    async with session_factory() as session:
        task = await session.get(Task, task_id)
        if task is None:
            return
        if task.status != "queued":
            app_logger.info(
                "task_run_skipped",
                extra={"task_id": str(task.id), "status": task.status},
            )
            return

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        _evict_oldest_queues_if_needed()
        TASK_EVENT_QUEUES[task.id] = queue
        log_handler: QueueLogHandler | None = None
        workspace: Path | None = None

        try:
            previous_status = task.status
            task.status = "running"
            task.current_stage = "prepare"
            task.conflict_base = None
            task.conflict_ours = None
            task.conflict_theirs = None
            await session.commit()
            task_list_events.publish_task_entered_scope(task, previous_status=previous_status)
            task_list_events.publish_task_status_changed(task, previous_status="queued")
            app_logger.info("task_started", extra={"task_id": str(task.id)})

            await _emit_event(queue, "stage_update", {"stage": "prepare", "index": 1, "total": 3})
            merged_data = await dictionary_merger.merge_pipeline_data(session)
            translation_ctx = await _build_translation_context(session, task)
            content_to_translate = (
                translation_ctx.content if translation_ctx is not None else task.original_content
            )
            workspace, input_file, output_dir, pre_translator_dir = _prepare_workspace(
                task,
                merged_data,
                content_to_translate,
            )

            loop = asyncio.get_running_loop()
            log_handler = QueueLogHandler(loop, queue, stage="prepare")
            logger = _build_task_logger(task.id, log_handler)
            if translation_ctx is not None and translation_ctx.is_incremental:
                logger.info(
                    "Инкрементальный режим: %d из %d абзацев",
                    len(translation_ctx.dirty_indices),
                    len(translation_ctx.new_paras),
                )
            else:
                logger.info("Полный перевод")

            await _set_stage(
                session,
                task,
                queue,
                log_handler,
                stage="pipeline",
                index=2,
                total=3,
            )
            output_file = await _execute_pipeline(
                    input_file=input_file,
                    output_dir=output_dir,
                    pre_translator_dir=pre_translator_dir,
                    merged_data=merged_data,
                    logger=logger,
                )

            await _set_stage(
                session,
                task,
                queue,
                log_handler,
                stage="persist",
                index=3,
                total=3,
            )
            output_text = output_file.read_text(encoding="utf-8")
            (
                task.translated_content,
                task.incremental_paragraphs_count,
                task.incremental_total_paragraphs,
            ) = _assemble_translation(translation_ctx, output_text, logger)
            task.log = log_handler.get_log()
            task.error = None
            previous_status = task.status
            task.status = "done"
            task.current_stage = None
            task.completed_at = datetime.now(UTC)
            await session.commit()
            task_list_events.publish_task_entered_scope(task, previous_status=previous_status)
            task_list_events.publish_task_status_changed(task, previous_status="running")
            await _emit_event(queue, "status_change", {"status": "done"})
            app_logger.info("task_completed", extra={"task_id": str(task.id)})
        except asyncio.CancelledError:
            is_deferred = any(task.id in ids for ids in _DEFERRED_TASKS.values())
            if is_deferred:
                # Cancelled by pause_project — reset to queued so resume can pick it up
                task.status = "queued"
                task.current_stage = None
                await session.commit()
                task_list_events.publish_task_entered_scope(task, previous_status="running")
                task_list_events.publish_task_status_changed(task, previous_status="running")
            else:
                task.status = "cancelled"
                task.current_stage = None
                task.completed_at = datetime.now(UTC)
                await session.commit()
                task_list_events.publish_task_status_changed(task, previous_status="running")
            raise
        except Exception:
            task.translated_content = None
            task.log = _sanitize_error(log_handler.get_log()) if log_handler else None
            task.error = _sanitize_error(traceback.format_exc())
            previous_status = task.status
            task.status = "failed"
            task.current_stage = None
            task.completed_at = datetime.now(UTC)
            await session.commit()
            task_list_events.publish_task_entered_scope(task, previous_status=previous_status)
            task_list_events.publish_task_status_changed(task, previous_status="running")
            await _emit_event(queue, "status_change", {"status": "failed"})
            app_logger.exception("task_failed", extra={"task_id": str(task.id)})
        finally:
            if workspace is not None:
                shutil.rmtree(workspace, ignore_errors=True)
            await queue.put(None)
            _t = asyncio.create_task(_cleanup_queue_after(task.id, delay=3600.0))
            _BACKGROUND_TASKS.add(_t)
            _t.add_done_callback(_BACKGROUND_TASKS.discard)
