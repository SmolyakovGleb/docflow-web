from __future__ import annotations

import logging
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


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _warn_missing_pipeline_settings()
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(
            update(Task)
            .where(Task.status == "running")
            .values(status="queued", error="Прервано перезапуском сервера")
        )
        await session.commit()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
        lifespan=_lifespan,
        description=(
            "API сервиса DocFlow — автоматический перевод `.md` документации RU→EN "
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
                    "Не требует авторизации — аутентификация через HMAC-подпись (`X-Hub-Signature-256`)."
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

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(GitHubAPIError)
    async def _github_api_error_handler(request: Request, exc: GitHubAPIError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(api_router)
    return app


app = create_app()
