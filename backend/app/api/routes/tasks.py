from __future__ import annotations

from typing import Annotated, AsyncIterator
from uuid import UUID

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.user import User
from app.schemas.task import (
    RetryRequest,
    TaskPublishResponse,
    TaskCreateResponse,
    TaskDetail,
    TaskListResponse,
    TaskStatus,
    TaskSummary,
    TaskUpdate,
)
from app.services import pipeline_runner
from app.services import task_list_events
from app.services.auth import get_current_user
from app.services.projects import _get_user_team_id, get_project_visible_or_404
from app.services.tasks import (
    PublishConflictError,
    SourceFileChangedError,
    create_manual_task_from_upload,
    create_manual_tasks_from_repo,
    delete_queued_task,
    ensure_task_removable,
    get_task_or_404,
    list_tasks,
    parse_manual_repo_payload,
    parse_upload_payload,
    publish_task,
    reset_task_for_retry,
    update_task_content,
)
router = APIRouter(prefix="/tasks", tags=["tasks"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)


async def _single_status_event(status_value: str) -> AsyncIterator[str]:
    yield pipeline_runner.format_sse_event("status_change", {"status": status_value})


TASK_EVENTS_STREAM_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


async def _stream_task_events(task_id: UUID, request: Request) -> AsyncIterator[str]:
    queue = pipeline_runner.TASK_EVENT_QUEUES[task_id]
    reached_end = False

    try:
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break

            try:
                item = await asyncio.wait_for(queue.get(), timeout=10.0)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
                continue

            if item is None:
                reached_end = True
                break
            yield pipeline_runner.format_sse_event(item["event"], item["data"])
    finally:
        if reached_end:
            pipeline_runner.TASK_EVENT_QUEUES.pop(task_id, None)


@router.get(
    "",
    response_model=TaskListResponse,
    summary="Список задач",
    description=(
        "Задачи текущего пользователя по всем его проектам. "
        "Задачи с `project_id=null` включаются, если принадлежат текущему пользователю. "
        "Фильтры: `project_id`, `status`. Поддерживается пагинация."
    ),
)
async def get_tasks(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    status: TaskStatus | None = None,
    search: str | None = Query(default=None, min_length=1, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> TaskListResponse:
    items, total, status_counts = await list_tasks(
        session,
        current_user,
        project_id=project_id,
        status_filter=status,
        search=search,
        limit=limit,
        offset=offset,
    )
    return TaskListResponse(
        items=[TaskSummary.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
        status_counts=status_counts,
    )


@router.get(
    "/events",
    summary="SSE-стрим списка задач",
    description=(
        "Server-Sent Events для текущего списка задач. "
        "Поддерживает те же фильтры, что и `GET /tasks`: `project_id`, `status`, `search`. "
        "Событие `task_entered` приходит, когда задача впервые попадает в текущий scope подписки."
    ),
    responses={
        200: {"description": "SSE-поток (text/event-stream)"},
        404: {"description": "Проект не найден"},
    },
)
async def task_list_events_stream(
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    status: TaskStatus | None = None,
    search: str | None = Query(default=None, min_length=1, max_length=200),
) -> StreamingResponse:
    if project_id is not None:
        await get_project_visible_or_404(session, project_id, current_user)

    team_id = await _get_user_team_id(session, current_user.id)

    subscription = task_list_events.register_subscription(
        user_id=current_user.id,
        team_id=team_id,
        status=status,
        project_id=project_id,
        search=search,
    )

    async def _stream() -> AsyncIterator[str]:
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    item = await asyncio.wait_for(subscription.queue.get(), timeout=20.0)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue

                if item is None:
                    break

                yield task_list_events.format_sse_event(item["event"], item["data"])
        finally:
            task_list_events.close_subscription(subscription.id)

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.get(
    "/{task_id}",
    response_model=TaskDetail,
    summary="Детали задачи",
    description="Полные данные задачи: оригинал, перевод, SHA файлов, история публикаций.",
    responses={
        200: {"description": "Детали задачи"},
        404: {"description": "Задача не найдена или принадлежит другому пользователю"},
    },
)
async def get_task(task_id: UUID, session: DbSession, current_user: CurrentUser) -> TaskDetail:
    task = await get_task_or_404(session, task_id, current_user, with_publications=True)
    return TaskDetail.model_validate(task)


@router.get(
    "/{task_id}/log",
    summary="Лог пайплайна",
    description="Сырой текстовый лог выполнения пайплайна (`text/plain`). `204` если задача ещё в очереди и лог пуст.",
    responses={
        200: {"description": "Лог (text/plain)"},
        204: {"description": "Лог пуст"},
        404: {"description": "Задача не найдена"},
    },
)
async def get_task_log(task_id: UUID, session: DbSession, current_user: CurrentUser) -> Response:
    task = await get_task_or_404(session, task_id, current_user)
    if not task.log:
        return Response(status_code=204)
    return PlainTextResponse(task.log)


@router.patch(
    "/{task_id}",
    response_model=TaskDetail,
    summary="Обновить перевод",
    description=(
        "Сохраняет отредактированный перевод. "
        "Допускается только для статусов `done`, `failed` и `conflict`."
    ),
    responses={
        200: {"description": "Задача обновлена"},
        400: {"description": "Нельзя редактировать задачу со статусом `running` или `queued`"},
        404: {"description": "Задача не найдена"},
    },
)
async def patch_task(
    task_id: UUID,
    payload: TaskUpdate,
    session: DbSession,
    current_user: CurrentUser,
) -> TaskDetail:
    task = await get_task_or_404(session, task_id, current_user, with_publications=True)
    updated_task = await update_task_content(session, task, payload)
    return TaskDetail.model_validate(updated_task)


@router.post(
    "/manual",
    response_model=TaskCreateResponse,
    status_code=201,
    summary="Ручной запуск перевода",
    description=(
        "Два варианта запуска:\n\n"
        "**A — файлы из репозитория** (`application/json`):\n"
        "```json\n{\"project_id\": \"...\", \"file_paths\": [\"docs/crm-deal-get.md\"]}\n```\n"
        "Требует привязанный GitHub-аккаунт. Скачивает файлы через GitHub API.\n\n"
        "**B — загрузка файла** (`multipart/form-data`):\n"
        "Поля: `project_id` (необязательно), `target_path`, `file` (только `.md`, UTF-8, максимум 1 MB).\n"
        "GitHub-аккаунт не требуется.\n\n"
        "Поддерживает частичный успех: `skipped` содержит пропущенные файлы с причиной."
    ),
    responses={
        201: {"description": "Задачи созданы и поставлены в очередь"},
        400: {"description": "GitHub не привязан / невалидный файл / неверный формат запроса"},
        413: {"description": "Файл превышает 1 MB"},
    },
)
async def create_manual_tasks(
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
) -> TaskCreateResponse:
    content_type = request.headers.get("content-type", "")
    logger.info("create_manual_tasks called", extra={"content_type": content_type, "user_id": str(current_user.id)})

    if content_type.startswith("application/json"):
        payload = parse_manual_repo_payload(await request.json())
        result = await create_manual_tasks_from_repo(session, current_user, payload)
    else:
        form = await request.form()
        uploaded_file = form.get("file")
        if uploaded_file is None or not hasattr(uploaded_file, "filename"):
            raise HTTPException(status_code=400, detail="Missing file upload")

        upload_payload = parse_upload_payload(
            project_id=str(form.get("project_id", "")),
            target_path=str(form.get("target_path", "")),
            filename=uploaded_file.filename,
            content=await uploaded_file.read(),
        )
        result = await create_manual_task_from_upload(session, current_user, upload_payload)

    for task in result.created_tasks:
        await pipeline_runner.schedule_task(task.id)

    return TaskCreateResponse(
        created=len(result.created_tasks),
        task_ids=[task.id for task in result.created_tasks],
        skipped=result.skipped,
    )


@router.post(
    "/{task_id}/retry",
    status_code=202,
    summary="Повторить перевод",
    description=(
        "Сбрасывает результаты задачи (`translated_content`, `log`, `error`) и запускает пайплайн заново. "
        "Применимо для статусов `done` и `failed`.\n\n"
        "Если source-файл изменился в GitHub с момента создания задачи — возвращает `409`. "
        "Передайте `force: true` чтобы продолжить со старой версией файла. "
        "Для upload-задач (`github_ref=manual`, `source_file_sha=null`) проверка SHA пропускается."
    ),
    responses={
        202: {"description": "Задача поставлена в очередь"},
        400: {"description": "Нельзя повторить задачу со статусом `running`"},
        404: {"description": "Задача не найдена"},
        409: {"description": "Source-файл изменился — нужен `force: true` или новая задача"},
    },
)
async def retry_task(
    task_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
    payload: RetryRequest | None = None,
) -> dict[str, str]:
    retry_payload = payload or RetryRequest()
    task = await get_task_or_404(session, task_id, current_user)
    try:
        reset_task = await reset_task_for_retry(
            session,
            task,
            current_user,
            force=retry_payload.force,
        )
    except SourceFileChangedError as exc:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Source file has changed since task was created",
                "source_diff": {
                    "old_sha": exc.old_sha,
                    "new_sha": exc.new_sha,
                },
            },
        )

    await pipeline_runner.schedule_task(reset_task.id)
    return {"id": str(reset_task.id), "status": reset_task.status}


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Убрать задачу из очереди",
    description="Удаляет зависшую задачу из статуса `queued`, не отправляя её в pipeline.",
    responses={
        204: {"description": "Задача удалена"},
        400: {"description": "Удалять можно только задачи со статусом `queued`"},
        404: {"description": "Задача не найдена"},
    },
)
async def delete_task_route(
    task_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> Response:
    task = await get_task_or_404(session, task_id, current_user)
    ensure_task_removable(task)
    await pipeline_runner.cancel_scheduled_task(task.id)
    await delete_queued_task(session, task)
    logger.info("task_deleted_from_queue", extra={"task_id": str(task_id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{task_id}/publish",
    response_model=TaskPublishResponse,
    summary="Опубликовать перевод",
    description=(
        "Публикует `translated_content` в target-репозиторий через GitHub API. "
        "Доступно только для `status=done` и `status=conflict`.\n\n"
        "**Алгоритм:**\n"
        "1. Получить текущий SHA EN-файла в target repo\n"
        "2. Сравнить с `task.target_file_sha` (зафиксирован при создании задачи)\n"
        "3. Расхождение → `409` с `base/ours/theirs` для 3-way diff в UI\n"
        "4. Совпадение → создать/обновить файл в GitHub, записать `Publication`, "
        "обновить `task.status=published`\n\n"
        "При `409`: отредактируйте перевод через `PATCH /tasks/{id}`, затем повторите publish."
    ),
    responses={
        200: {"description": "Опубликовано успешно, возвращает `commit_sha`"},
        400: {"description": "Задача не в статусе `done`"},
        404: {"description": "Задача не найдена"},
        409: {"description": "EN-файл изменился вручную — конфликт, нужен 3-way merge"},
        502: {"description": "Ошибка GitHub API"},
    },
)
async def publish_task_route(
    task_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> TaskPublishResponse:
    task = await get_task_or_404(session, task_id, current_user)
    try:
        result = await publish_task(session, task, current_user)
    except PublishConflictError as exc:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Conflict: target file was modified since this task was created",
                "conflict": {
                    "base": exc.base,
                    "ours": exc.ours,
                    "theirs": exc.theirs,
                },
            },
        )

    return TaskPublishResponse.model_validate(result)


@router.get(
    "/{task_id}/events",
    summary="SSE-стрим событий задачи",
    description=(
        "Server-Sent Events о прогрессе выполнения пайплайна (`text/event-stream`). "
        "Используется фронтендом пока задача в статусе `running`.\n\n"
        "**Типы событий:**\n"
        "- `stage_update` — смена этапа: `{stage, index, total}`\n"
        "- `log_line` — строка лога: `{line}`\n"
        "- `status_change` — финальный статус: `{status}` (`done` или `failed`)\n\n"
        "После `status_change` поток закрывается. "
        "Если задача уже завершена или ещё в `queued` — сразу отправляется одно событие `status_change`."
    ),
    responses={
        200: {"description": "SSE-поток (text/event-stream)"},
        404: {"description": "Задача не найдена"},
    },
)
async def task_events(
    task_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    task = await get_task_or_404(session, task_id, current_user)
    queue = pipeline_runner.TASK_EVENT_QUEUES.get(task.id)

    if queue is None:
        return StreamingResponse(
            _single_status_event(task.status),
            media_type="text/event-stream",
            headers=TASK_EVENTS_STREAM_HEADERS,
        )

    return StreamingResponse(
        _stream_task_events(task.id, request),
        media_type="text/event-stream",
        headers=TASK_EVENTS_STREAM_HEADERS,
    )
