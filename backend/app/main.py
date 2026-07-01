from __future__ import annotations

import asyncio
import contextlib
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.extension import _rate_limit_exceeded_handler
from sqlalchemy import update
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.router import api_router
from app.api.routes.auth import limiter
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_context import set_request_id, set_user_id
from app.db.session import get_session_factory
from app.models.task import Task
from app.services.github import GitHubAPIError

logger = logging.getLogger(__name__)


def _warn_missing_pipeline_settings() -> None:
    settings = get_settings()
    missing = [
        name
        for name, value in (
            ("API_KEY", settings.api_key),
            ("BASE_URL", settings.base_url),
            ("MODEL", settings.model),
        )
        if not value
    ]
    if missing:
        logger.warning(
            "Pipeline configuration missing: %s — translation tasks will fail until set",
            ", ".join(missing),
        )


class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> JSONResponse:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


class _LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> JSONResponse:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        set_request_id(request_id)
        set_user_id(None)

        access_logger = logging.getLogger("app.access")
        start = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.monotonic() - start) * 1000)
            access_logger.exception(
                "request_failed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                },
            )
            raise

        duration_ms = int((time.monotonic() - start) * 1000)
        log_method = access_logger.warning if response.status_code >= 500 else access_logger.info
        log_method(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response


@asynccontextmanager
async def _lifespan(app: FastAPI):
    from sqlalchemy import or_, select

    from app.models.project import Project
    from app.services import pipeline_runner

    settings = get_settings()
    configure_logging(level="DEBUG" if settings.debug else "INFO")
    _warn_missing_pipeline_settings()
    session_factory = get_session_factory()

    # Reset stuck running tasks → queued
    async with session_factory() as session:
        result = await session.execute(
            update(Task)
            .where(Task.status == "running")
            .values(status="queued", current_stage=None, error="Прервано перезапуском сервера")
        )
        await session.commit()
    if result.rowcount:
        logger.info("startup_reset_running_tasks", extra={"count": result.rowcount})

    # Load paused projects into memory
    async with session_factory() as session:
        paused_ids = (await session.scalars(
            select(Project.id).where(Project.pipeline_paused == True)  # noqa: E712
        )).all()
        pipeline_runner._PAUSED_PROJECTS.update(paused_ids)

    # Enqueue all queued tasks (skip paused projects)
    async with session_factory() as session:
        paused_project_ids = list(pipeline_runner._PAUSED_PROJECTS)
        queued_ids = (await session.scalars(
            select(Task.id).where(
                Task.status == "queued",
                # NULL project_id (upload/orphan tasks) must still enqueue; SQL
                # `NOT IN (...)` is never true for NULL, so handle it explicitly.
                or_(
                    Task.project_id.is_(None),
                    Task.project_id.notin_(paused_project_ids),
                ),
            ).order_by(Task.created_at)
        )).all()
        for task_id in queued_ids:
            await pipeline_runner.schedule_task(task_id)

    # Start the queue worker
    worker = asyncio.create_task(
        pipeline_runner._queue_worker(), name="docflow.queue_worker"
    )
    pipeline_runner._WORKER_TASK = worker

    # Catch-up при старте: пуш будит спящую VM, но его вебхук-доставка теряется
    # (GitHub-таймаут 10с, без ретрая) — на старте сами добираем пропущенное.
    # Фоном, чтобы не тормозить готовность/health. Гарды от лавины — в reconcile.
    # Включён, когда catch-up сконфигурирован (в тестах секрета нет → без сети).
    if settings.catchup_secret:
        from app.api.routes.webhook import run_startup_catchup

        asyncio.create_task(
            run_startup_catchup(session_factory), name="docflow.startup_catchup"
        )

    yield

    worker.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await worker


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
        lifespan=_lifespan,
        description=(
            "API сервиса DocFlow — автоматический перевод `.md`, `.yaml` и `.yml` "
            "документации RU→EN "
            "через Bitrix GPT с публикацией в GitHub."
        ),
        openapi_tags=[
            {
                "name": "health",
                "description": "Проверка работоспособности сервиса и подключения к БД.",
            },
            {
                "name": "auth",
                "description": (
                    "Регистрация, вход по email/паролю, выход, смена пароля. "
                    "GitHub OAuth для привязки аккаунта — отдельно от основного входа."
                ),
            },
            {
                "name": "projects",
                "description": (
                    "Управление проектами (пары source/target репозиториев). "
                    "Требует привязанный GitHub-аккаунт. "
                    "`webhook_secret` возвращается только при создании."
                ),
            },
            {
                "name": "tasks",
                "description": (
                    "Задачи перевода: список, детали, ручной запуск, retry, публикация в GitHub. "
                    "SSE-стрим прогресса доступен по `GET /tasks/{id}/events`."
                ),
            },
            {
                "name": "webhook",
                "description": (
                    "Приём `push`-событий от GitHub. "
                    "Не требует авторизации — аутентификация через "
                    "HMAC-подпись (`X-Hub-Signature-256`)."
                ),
            },
            {
                "name": "history",
                "description": (
                    "История публикаций. Видны публикации всех пользователей, "
                    "работающих с тем же `source_repo`."
                ),
            },
            {
                "name": "analytics",
                "description": (
                    "Агрегированная статистика: успешность переводов, среднее время, "
                    "динамика по дням, топ ошибок."
                ),
            },
            {
                "name": "dictionaries",
                "description": (
                    "Словари пайплайна. В MVP доступен read-only просмотр merged-данных; "
                    "редактирование отложено до post-MVP per-user модели."
                ),
            },
            {
                "name": "notifications",
                "description": (
                    "Уведомления Bitrix24. В MVP доступен только пустой read-only список каналов; "
                    "реальная доставка и управление каналами отложены до post-MVP."
                ),
            },
        ],
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_base_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(_SecurityHeadersMiddleware)
    app.add_middleware(_LoggingMiddleware)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(GitHubAPIError)
    async def _github_api_error_handler(request: Request, exc: GitHubAPIError) -> JSONResponse:
        logger.warning(
            "github_api_error",
            extra={
                "path": request.url.path,
                "status": exc.status_code,
                "detail": exc.detail,
            },
        )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(api_router)
    return app


app = create_app()
