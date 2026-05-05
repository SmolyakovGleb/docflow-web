# DocFlow Web — Локальная разработка

## Предварительные требования

- Git
- Docker Desktop
- Аккаунт GitHub с доступом к `bitrix-tools/b24-rest-docs` и `bitrix24/b24restdocs`
- Cloudpub (для тестирования webhook)
- GitHub OAuth App (создаётся один раз, см. ниже)

---

## Первоначальная настройка

### 1. Клонировать репозиторий с submodule

```bash
git clone --recursive https://github.com/gs-bitrix-doc/docflow-web
cd docflow-web
```

Если уже склонировали без `--recursive`:
```bash
git submodule update --init
```

Проверка:
```bash
ls pipeline/src/
# должны быть: pipeline.py, processors/, validators/, fixers/
```

### 2. Создать GitHub OAuth App

Перейти: **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**

| Поле | Значение (dev) |
|------|---------------|
| Application name | `DocFlow Web (local)` |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:8000/auth/github/callback` |

После создания скопировать `Client ID` и сгенерировать `Client Secret`.

### 3. Настроить переменные окружения

```bash
cp .env.example .env
```

Заполнить `.env`:
```env
# PostgreSQL
POSTGRES_USER=docflow
POSTGRES_PASSWORD=docflow_secret
POSTGRES_DB=docflow
DATABASE_URL=postgresql://docflow:docflow_secret@db:5432/docflow

# GitHub OAuth App
GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
GITHUB_CLIENT_SECRET=abc123...
GITHUB_CALLBACK_URL=http://localhost:8000/auth/github/callback

# JWT (любая случайная строка, минимум 32 символа)
SESSION_SECRET=your-very-secret-jwt-key-here

# Bitrix GPT (из проекта DocFlowAI)
API_KEY=your_bitrix_gpt_key
BASE_URL=https://your-bitrix-gpt-endpoint
MODEL=bitrixgpt-5.5
```

> `GITHUB_SOURCE_TOKEN` и `GITHUB_TARGET_TOKEN` больше не нужны: токены берутся из OAuth-сессии пользователя.

### 4. Применить миграции и запустить сервисы

```bash
# Применить миграции БД
docker compose run --rm backend alembic upgrade head

# Запустить в dev-режиме (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Что должно работать:
- `http://localhost:3000` — фронтенд (страница логина через GitHub)
- `http://localhost:8000/health` — `{"status": "ok"}`
- `http://localhost:8000/docs` — Swagger UI

---

## Настройка проекта после логина

1. Открыть `http://localhost:3000` → "Register" (или "Login" если уже зарегистрирован)
2. После входа: открыть профиль → "Connect GitHub" → подтвердить доступ в GitHub OAuth
3. После привязки: нажать "New Project"
4. Заполнить:
   - Source repo: `bitrix-tools/b24-rest-docs`
   - Source branch: `main`
   - Target repo: `bitrix24/b24restdocs` (или тестовый, см. ниже)
   - Target branch: `main`
5. Скопировать `webhook_url` и `webhook_secret` из ответа

---

## Настройка Cloudpub для webhook

GitHub не может слать webhook на `localhost` — нужен публичный URL.

### Шаг 1: Запустить туннель

```bash
cloudpub http 8000
# Выдаст URL вида: https://abc123.cloudpub.ru
```

### Шаг 2: Настроить webhook в GitHub

Перейти в source repo → **Settings → Webhooks → Add webhook**:

| Поле | Значение |
|------|---------|
| Payload URL | `https://abc123.cloudpub.ru/webhook/{project_id}` |
| Content type | `application/json` |
| Secret | `webhook_secret` из созданного проекта |
| Events | `Just the push event` |
| Active | ✓ |

`{project_id}` — UUID проекта из `GET /projects` или из UI.

### Шаг 3: Проверить доставку

Сделать пуш с изменённым `.md`-файлом в source repo.

В GitHub → **Settings → Webhooks → Recent Deliveries** — должно быть `200`.

В логах backend:
```bash
docker compose logs backend -f
# [INFO] Webhook received for project {id}: 1 file(s) queued
```

---

## Тестирование без пуша в боевой репозиторий

Рекомендуется создать тестовые репозитории:

| Роль | Название | Назначение |
|------|----------|-----------|
| Source | `DocFlowAI-test-src` | Куда пушить тестовые `.md`-файлы |
| Target | `DocFlowAI-test-en` | Куда публиковать переводы |

Создать на GitHub → завести отдельный проект в DocFlow Web с этой парой репозиториев → настроить webhook.

---

## Полезные команды

```bash
# Просмотр логов конкретного сервиса
docker compose logs backend -f
docker compose logs db -f

# Зайти в контейнер backend
docker compose exec backend bash

# Проверить что пайплайн импортируется
docker compose exec backend python -c "from src.pipeline import run; print('Pipeline OK')"

# Запустить миграцию
docker compose exec backend alembic upgrade head

# Откатить последнюю миграцию
docker compose exec backend alembic downgrade -1

# Сбросить БД (удалить все данные)
docker compose down -v && docker compose up

# Пересобрать образ backend
docker compose build backend
```

---

## Переход на боевой репозиторий

Когда локальное тестирование завершено:

1. Создать новый GitHub OAuth App (или обновить callback URL в существующем) на prod-домен
2. Обновить `.env` на сервере: `GITHUB_CALLBACK_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
3. В DocFlow Web создать проект с боевой парой репозиториев:
   - Source: `bitrix-tools/b24-rest-docs`
   - Target: `bitrix24/b24restdocs`
4. Настроить webhook в `bitrix-tools/b24-rest-docs` на prod-URL
5. Деплой: `git clone --recursive` + `docker compose up -d`