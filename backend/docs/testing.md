# DocFlow Web Backend — Тестирование

## Подход

**TDD для сервисов** — сначала тест, потом реализация:
- `services/auth.py` — хэширование, JWT
- `services/github.py` — GitHub API клиент (мокируем httpx)
- Webhook HMAC-верификация, дедупликация, exclude_patterns

**Тест сразу после для эндпоинтов** — реализовал роутер, сразу написал тест, только потом переходишь к следующему этапу.

**Не тестируем:** ORM-модели (просто декларации), Pydantic-схемы (FastAPI валидирует автоматически), Alembic-миграции.

---

## Стек

| Библиотека | Назначение |
|---|---|
| `pytest` + `pytest-asyncio` | Запуск async тестов |
| `httpx.AsyncClient` | HTTP-клиент для тестирования FastAPI |
| `pytest-mock` | Удобный `mocker` фикстур вместо `unittest.mock` |
| `factory-boy` | Фабрики тестовых объектов |
| `freezegun` | Заморозка времени (тесты JWT expiry) |

---

## Запуск

```bash
# Поднять тестовую БД (один раз)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db_test -d

# Все тесты
cd backend
python -m pytest

# Конкретный файл
python -m pytest tests/test_auth.py -v

# Конкретный тест
python -m pytest tests/test_auth.py::test_login_success -v

# С выводом print()
python -m pytest -s

# Остановиться на первом падении
python -m pytest -x
```

---

## Тестовая база данных

Отдельный PostgreSQL контейнер на порту `5433`, база `docflow_test`.

```
DATABASE_TEST_URL=postgresql+asyncpg://docflow:docflow_secret@localhost:5433/docflow_test
```

Хранится в `tmpfs` — данные в памяти, быстрый старт, автоматически очищается при остановке контейнера.

Между тестами данные сбрасываются через `TRUNCATE ... CASCADE` — каждый тест начинается с чистой БД.

---

## Структура тестов

```
backend/tests/
├── conftest.py              # фикстуры инфраструктуры
├── factories.py             # factory-boy фабрики (добавляются по мере создания моделей)
├── services/
│   ├── test_auth_service.py    # unit — чистые функции auth
│   ├── test_github_client.py   # unit — GitHub API (мокируем httpx)
│   └── test_webhook_security.py # unit — HMAC
├── test_auth.py             # integration — /auth/*
├── test_projects.py         # integration — /projects/*
├── test_webhook.py          # integration — /webhook/*
├── test_tasks.py            # integration — /tasks/*
├── test_publish.py          # integration — /tasks/{id}/publish
├── test_history.py          # integration — /history, /analytics
├── test_dictionaries.py     # integration — /dictionaries/*
└── test_notifications.py    # integration — /notifications/*
```

---

## Фикстуры (conftest.py)

| Фикстура | Scope | Что даёт |
|---|---|---|
| `engine` | session | Async SQLAlchemy engine, создаёт схему один раз |
| `db_session` | function | Сессия БД, очищает данные после каждого теста |
| `client` | function | `AsyncClient` с подменённой БД, не аутентифицирован |
| `auth_client` | function | Тот же клиент с JWT cookie (логин выполнен) |
| `test_user` | function | Пользователь в БД: `test@example.com` / `testpassword` |
| `test_project` | function | Проект в БД, принадлежит `test_user` |

Фикстуры `test_user`, `auth_client`, `test_project` становятся доступны после реализации соответствующих этапов (1, 3, 5).

---

## Примеры тестов

### Unit-тест (без БД, без HTTP)

```python
# tests/services/test_auth_service.py
from freezegun import freeze_time
from app.services.auth import hash_password, verify_password, create_jwt, decode_jwt

def test_hash_password_not_plaintext():
    assert hash_password("secret") != "secret"

def test_verify_password_correct():
    hashed = hash_password("secret")
    assert verify_password("secret", hashed) is True

def test_verify_password_wrong():
    hashed = hash_password("secret")
    assert verify_password("wrong", hashed) is False

def test_decode_expired_jwt():
    token = create_jwt(user_id="abc")
    with freeze_time("+31 days"):
        with pytest.raises(ExpiredSignatureError):
            decode_jwt(token)
```

### Integration-тест (HTTP + реальная БД)

```python
# tests/test_auth.py
async def test_register_success(client):
    response = await client.post("/auth/register", json={
        "email": "new@example.com",
        "password": "strongpassword",
        "display_name": "New User",
    })
    assert response.status_code == 201
    assert "session" in response.cookies

async def test_me_unauthenticated(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401

async def test_me_authenticated(auth_client, test_user):
    response = await auth_client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == test_user.email
```

### Тест с моком (мокируем внешний сервис)

```python
# tests/test_webhook.py
async def test_webhook_creates_tasks(auth_client, test_project, mocker):
    mocker.patch(
        "app.services.github.GitHubClient.get_file_content",
        return_value=("# Hello", "sha123"),
    )
    mocker.patch(
        "app.services.github.GitHubClient.get_file_sha",
        return_value=None,
    )
    mocker.patch("app.services.pipeline_runner.run_task")

    payload = make_push_payload(files=["docs/intro.md"])
    sig = make_hmac_signature(payload, test_project.webhook_secret)

    response = await auth_client.post(
        f"/webhook/{test_project.id}",
        content=payload,
        headers={"X-GitHub-Event": "push", "X-Hub-Signature-256": sig},
    )
    assert response.status_code == 202
    assert response.json()["created"] == 1
```

---

## Паттерны

### Мокирование httpx (GitHub клиент)

```python
# pytest-mock через mocker.patch
mocker.patch(
    "app.services.github.GitHubClient.get_file_content",
    return_value=("file content", "blobsha123"),
)

# Или через respx для полного контроля HTTP
import respx, httpx

@respx.mock
async def test_github_get_file(respx_mock):
    respx_mock.get("https://api.github.com/repos/...").mock(
        return_value=httpx.Response(200, json={"content": "...", "sha": "abc"})
    )
```

### Заморозка времени

```python
from freezegun import freeze_time

async def test_jwt_expired(client):
    # Создать токен, сдвинуть время, проверить что отклоняется
    with freeze_time("2026-01-01"):
        await client.post("/auth/login", ...)

    with freeze_time("2026-02-15"):  # +45 дней
        response = await client.get("/auth/me")
        assert response.status_code == 401
```

### Resource ownership (проверяем 404 для чужих объектов)

```python
async def test_get_other_user_project(client, db_session):
    # Создать второго пользователя и его проект
    other_user = User(email="other@example.com", ...)
    other_project = Project(user_id=other_user.id, ...)
    db_session.add_all([other_user, other_project])
    await db_session.commit()

    # Первый пользователь пытается получить чужой проект
    response = await auth_client.get(f"/projects/{other_project.id}")
    assert response.status_code == 404  # не 403
```

### Helpers для webhook

```python
# tests/helpers.py
import hmac, hashlib, json

def make_push_payload(files: list[str], branch: str = "main") -> bytes:
    payload = {
        "ref": f"refs/heads/{branch}",
        "commits": [{"added": files, "modified": [], "removed": []}],
        "head_commit": {"message": "test commit", "id": "abc123"},
    }
    return json.dumps(payload).encode()

def make_hmac_signature(payload: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"sha256={sig}"
```

---

## Что мокировать всегда

| Что | Почему |
|---|---|
| `GitHubClient` методы | Реальные запросы к GitHub в тестах — плохо |
| `pipeline_runner.run_task` | Пайплайн долгий, не нужен в тестах API |
| `bitrix_notify.notify` | Не отправлять реальные уведомления |
| `cryptography.Fernet.encrypt/decrypt` | Иногда полезно мокировать для предсказуемости |

---

## CI (будущее)

При добавлении GitHub Actions — запускать тесты в pipeline:

```yaml
# .github/workflows/test.yml
services:
  postgres:
    image: postgres:15-alpine
    env:
      POSTGRES_USER: docflow
      POSTGRES_PASSWORD: docflow_secret
      POSTGRES_DB: docflow_test
    ports:
      - 5433:5432

steps:
  - run: cd backend && pip install -e ".[dev]" && pytest
    env:
      DATABASE_TEST_URL: postgresql+asyncpg://docflow:docflow_secret@localhost:5433/docflow_test
      SESSION_SECRET: test-secret-for-ci-only-32chars!!
```
