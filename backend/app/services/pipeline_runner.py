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

from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.models.task import Task
from app.services import dictionary_merger

PIPELINE_ROOT = Path(__file__).resolve().parents[3] / "pipeline"
TASK_EVENT_QUEUES: dict[UUID, asyncio.Queue[dict[str, Any] | None]] = {}
PIPELINE_RUN_LOCK = asyncio.Lock()
_BACKGROUND_TASKS: set[asyncio.Task] = set()
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
    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        queue: asyncio.Queue[dict[str, Any] | None],
    ) -> None:
        super().__init__()
        self._loop = loop
        self._queue = queue
        self._lines: list[str] = []
        self.setFormatter(logging.Formatter("%(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        line = self.format(record)
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
    *,
    stage: str,
    index: int,
    total: int,
) -> None:
    task.current_stage = stage
    await session.commit()
    await _emit_event(queue, "stage_update", {"stage": stage, "index": index, "total": total})


def _prepare_workspace(
    task: Task,
    merged_data: dictionary_merger.MergedPipelineData,
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
    input_file.write_text(task.original_content, encoding="utf-8")
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


async def run_task(task_id: UUID) -> None:
    session_factory = get_session_factory()

    async with session_factory() as session:
        task = await session.get(Task, task_id)
        if task is None:
            return

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        _evict_oldest_queues_if_needed()
        TASK_EVENT_QUEUES[task.id] = queue
        log_handler: QueueLogHandler | None = None
        workspace: Path | None = None

        try:
            task.status = "running"
            task.current_stage = "prepare"
            task.conflict_base = None
            task.conflict_ours = None
            task.conflict_theirs = None
            await session.commit()
            app_logger.info("task_started", extra={"task_id": str(task.id)})

            await _emit_event(queue, "stage_update", {"stage": "prepare", "index": 1, "total": 3})
            merged_data = await dictionary_merger.merge_pipeline_data(session)
            workspace, input_file, output_dir, pre_translator_dir = _prepare_workspace(
                task,
                merged_data,
            )

            loop = asyncio.get_running_loop()
            log_handler = QueueLogHandler(loop, queue)
            logger = _build_task_logger(task.id, log_handler)

            await _set_stage(session, task, queue, stage="pipeline", index=2, total=3)
            async with PIPELINE_RUN_LOCK:
                output_file = await _execute_pipeline(
                    input_file=input_file,
                    output_dir=output_dir,
                    pre_translator_dir=pre_translator_dir,
                    merged_data=merged_data,
                    logger=logger,
                )

            await _set_stage(session, task, queue, stage="persist", index=3, total=3)
            task.translated_content = output_file.read_text(encoding="utf-8")
            task.log = log_handler.get_log()
            task.error = None
            task.status = "done"
            task.current_stage = None
            task.completed_at = datetime.now(UTC)
            await session.commit()
            await _emit_event(queue, "status_change", {"status": "done"})
            app_logger.info("task_completed", extra={"task_id": str(task.id)})
        except Exception:
            task.translated_content = None
            task.log = _sanitize_error(log_handler.get_log()) if log_handler else None
            task.error = _sanitize_error(traceback.format_exc())
            task.status = "failed"
            task.current_stage = None
            task.completed_at = datetime.now(UTC)
            await session.commit()
            await _emit_event(queue, "status_change", {"status": "failed"})
            app_logger.exception("task_failed", extra={"task_id": str(task.id)})
        finally:
            if workspace is not None:
                shutil.rmtree(workspace, ignore_errors=True)
            await queue.put(None)
            _t = asyncio.create_task(_cleanup_queue_after(task.id, delay=3600.0))
            _BACKGROUND_TASKS.add(_t)
            _t.add_done_callback(_BACKGROUND_TASKS.discard)
