from fastapi import FastAPI
from slowapi.errors import RateLimitExceeded
from slowapi.extension import _rate_limit_exceeded_handler

from app.api.router import api_router
from app.api.routes.auth import limiter
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
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
        ],
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(api_router)
    return app


app = create_app()
