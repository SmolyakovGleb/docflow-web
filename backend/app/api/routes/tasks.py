from __future__ import annotations

from typing import Annotated, AsyncIterator
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.user import User
from app.schemas.task import (
    RetryRequest,
    TaskCreateResponse,
    TaskDetail,
    TaskListResponse,
    TaskStatus,
    TaskSummary,
    TaskUpdate,
)
from app.services import pipeline_runner
from app.services.auth import get_current_user
from app.services.tasks import (
    SourceFileChangedError,
    create_manual_task_from_upload,
    create_manual_tasks_from_repo,
    get_task_or_404,
    list_tasks,
    parse_manual_repo_payload,
    parse_upload_payload,
    reset_task_for_retry,
    update_task_content,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _single_status_event(status_value: str) -> AsyncIterator[str]:
    yield pipeline_runner.format_sse_event("status_change", {"status": status_value})


async def _stream_task_events(task_id: UUID) -> AsyncIterator[str]:
    queue = pipeline_runner.TASK_EVENT_QUEUES[task_id]

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield pipeline_runner.format_sse_event(item["event"], item["data"])
    finally:
        pipeline_runner.TASK_EVENT_QUEUES.pop(task_id, None)


@router.get("", response_model=TaskListResponse)
async def get_tasks(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    status: TaskStatus | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> TaskListResponse:
    items, total = await list_tasks(
        session,
        current_user,
        project_id=project_id,
        status_filter=status,
        limit=limit,
        offset=offset,
    )
    return TaskListResponse(
        items=[TaskSummary.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{task_id}", response_model=TaskDetail)
async def get_task(task_id: UUID, session: DbSession, current_user: CurrentUser) -> TaskDetail:
    task = await get_task_or_404(session, task_id, current_user, with_publications=True)
    return TaskDetail.model_validate(task)


@router.get("/{task_id}/log")
async def get_task_log(task_id: UUID, session: DbSession, current_user: CurrentUser) -> Response:
    task = await get_task_or_404(session, task_id, current_user)
    if not task.log:
        return Response(status_code=204)
    return PlainTextResponse(task.log)


@router.patch("/{task_id}", response_model=TaskDetail)
async def patch_task(
    task_id: UUID,
    payload: TaskUpdate,
    session: DbSession,
    current_user: CurrentUser,
) -> TaskDetail:
    task = await get_task_or_404(session, task_id, current_user, with_publications=True)
    updated_task = await update_task_content(session, task, payload)
    return TaskDetail.model_validate(updated_task)


@router.post("/manual", response_model=TaskCreateResponse, status_code=201)
async def create_manual_tasks(
    request: Request,
    background_tasks: BackgroundTasks,
    session: DbSession,
    current_user: CurrentUser,
) -> TaskCreateResponse:
    content_type = request.headers.get("content-type", "")

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
        background_tasks.add_task(pipeline_runner.run_task, task.id)

    return TaskCreateResponse(
        created=len(result.created_tasks),
        task_ids=[task.id for task in result.created_tasks],
        skipped=result.skipped,
    )


@router.post("/{task_id}/retry", status_code=202)
async def retry_task(
    task_id: UUID,
    background_tasks: BackgroundTasks,
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

    background_tasks.add_task(pipeline_runner.run_task, reset_task.id)
    return {"id": str(reset_task.id), "status": reset_task.status}


@router.get("/{task_id}/events")
async def task_events(
    task_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> StreamingResponse:
    task = await get_task_or_404(session, task_id, current_user)
    queue = pipeline_runner.TASK_EVENT_QUEUES.get(task.id)

    if queue is None:
        return StreamingResponse(
            _single_status_event(task.status),
            media_type="text/event-stream",
        )

    return StreamingResponse(
        _stream_task_events(task.id),
        media_type="text/event-stream",
    )
