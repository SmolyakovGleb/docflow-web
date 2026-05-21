# DocFlow Web — Backend

FastAPI-бэкенд для веб-сервиса вокруг переводческого пайплайна DocFlow AI.

## Что делает

Принимает GitHub webhook при пуше `.md`-файлов → запускает перевод через пайплайн в фоне → предоставляет REST API для фронтенда: ревью diff, публикация в target repo, управление словарями, уведомления в Bitrix24.

## Стек

| Компонент | Технология |
|-----------|-----------|
| Framework | FastAPI 0.115+ |
| БД | PostgreSQL 15 (asyncpg + SQLAlchemy 2.0 async) |
| Миграции | Alembic |
| Auth | JWT httponly cookie (python-jose) + bcrypt (passlib) |
| GitHub | OAuth App + REST API v3 (httpx) |
| Уведомления | Bitrix24 incoming webhook / REST API |
| Pipeline | git submodule `../pipeline/` |
| Python | 3.11 |

## Структура

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory
│   ├── core/
│   │   └── config.py        # pydantic-settings, все env vars
│   ├── db/
│   │   ├── base.py          # DeclarativeBase
│   │   └── session.py       # async engine + get_db_session()
│   ├── models/              # SQLAlchemy ORM модели
│   ├── schemas/             # Pydantic схемы (request/response)
│   ├── api/
│   │   ├── router.py        # корневой APIRouter
│   │   └── routes/          # роутеры по доменам
│   └── services/            # бизнес-логика
├── migrations/              # Alembic
│   └── versions/
├── docs/                    # внутренняя документация
├── alembic.ini
├── pyproject.toml
└── Dockerfile
```

## Запуск

### Docker (рекомендуется)

```bash
# из корня репозитория
docker compose up --build

# с hot-reload для разработки
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Локально без Docker

Предварительно запустить PostgreSQL и выставить в `.env`:
```
DATABASE_URL=postgresql://docflow:docflow_secret@localhost:5432/docflow
```

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -e ".[dev]"

# применить миграции
alembic upgrade head

# запустить сервер
uvicorn app.main:app --reload --port 8000
```

## Переменные окружения

Файл `.env` в корне репозитория (рядом с `docker-compose.yml`).

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | PostgreSQL DSN. В Docker: `@db:5432`, локально: `@localhost:5432` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Для контейнера БД |
| `SESSION_SECRET` | Секрет для подписи JWT (hex, минимум 32 байта) |
| `GITHUB_CLIENT_ID` | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App Client Secret |
| `APP_BASE_URL` | Публичный base URL backend; используется для webhook URL и внешних backend-ссылок |
| `FRONTEND_BASE_URL` | Публичный base URL frontend; GitHub callback собирается как `${FRONTEND_BASE_URL}/auth/github/callback` |
| `API_KEY` | Ключ Bitrix GPT (из проекта DocFlow AI) |
| `BASE_URL` | Endpoint Bitrix GPT |
| `MODEL` | Модель, например `bitrixgpt-5.5` |

## Миграции

```bash
# создать новую миграцию
alembic revision --autogenerate -m "add users table"

# применить все
alembic upgrade head

# откатить последнюю
alembic downgrade -1
```

## Тесты

```bash
pytest
```

Режим `asyncio_mode = auto` задан в `pyproject.toml` — все async-тесты работают без декоратора.

## API

Документация всех эндпоинтов: [`../docs/api.md`](../docs/api.md)

Swagger UI доступен на `http://localhost:8000/docs` при `debug=true`.
