# DocFlow Web — Docker архитектура

## Контейнеры

| Сервис | Image | Порт (хост:контейнер) | Назначение |
|--------|-------|-----------------------|-----------|
| `db` | `postgres:15-alpine` | `5432:5432` | PostgreSQL |
| `backend` | build: `./backend/Dockerfile` | `8000:8000` | FastAPI + Pipeline |
| `frontend` | build: `./frontend/Dockerfile` | `3000:80` | React (nginx) |

---

## Сетевая топология

```
                    ┌─────────────┐
  Host:3000 ───────▶│  frontend   │
                    │  (nginx:80) │
                    └──────┬──────┘
                           │ proxy /api → backend:8000
                           ▼
  Host:8000 ───────▶┌─────────────┐
  (dev direct)      │   backend   │
                    │ uvicorn:8000│
                    └──────┬──────┘
                           │ postgres://db:5432
                           ▼
                    ┌─────────────┐
                    │     db      │
                    │ postgres:5432│
                    └─────────────┘

Все сервисы — в одной bridge-сети: docflow-network
```

Frontend в production проксирует `/api/*` → `backend:8000` через nginx. Прямой доступ к backend снаружи на порт 8000 нужен только в dev.

---

## Стратегия build context

Ключевой момент: `pipeline/` (git submodule) и `backend/` должны попасть в один Docker-образ. Поэтому **build context — корень репозитория**, а не `backend/`.

```yaml
# docker-compose.yml
backend:
  build:
    context: .                    # ← корень репо
    dockerfile: backend/Dockerfile
```

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app

COPY pipeline/ ./pipeline/        # git submodule со всей логикой
COPY backend/  ./backend/

RUN pip install -e ./backend/

ENV PYTHONPATH=/app/pipeline      # from src.pipeline import run ✓

WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`pipeline/data/` (промпт, словари) попадает в контейнер автоматически через `COPY pipeline/`.

---

## docker-compose.yml (production)

```yaml
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - docflow-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    networks:
      - docflow-network
    ports:
      - "8000:8000"

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    depends_on:
      - backend
    networks:
      - docflow-network
    ports:
      - "3000:80"

volumes:
  postgres_data:

networks:
  docflow-network:
    driver: bridge
```

---

## docker-compose.dev.yml (разработка)

Монтирует исходники для hot reload без пересборки.

```yaml
services:
  backend:
    volumes:
      - ./backend:/app/backend    # hot reload через uvicorn --reload
      - ./pipeline:/app/pipeline  # изменения в пайплайне сразу видны
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile.dev   # vite dev server вместо nginx
    volumes:
      - ./frontend:/app/frontend
      - /app/frontend/node_modules          # исключить node_modules из mount
    ports:
      - "5173:5173"
    command: npm run dev -- --host
```

Запуск в dev-режиме:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Переменные окружения

Все переменные — в `.env` (создаётся из `.env.example`).

| Переменная | Пример | Назначение |
|------------|--------|-----------|
| `POSTGRES_USER` | `docflow` | Пользователь БД |
| `POSTGRES_PASSWORD` | `secret` | Пароль БД |
| `POSTGRES_DB` | `docflow` | Имя БД |
| `DATABASE_URL` | `postgresql://docflow:secret@db:5432/docflow` | SQLAlchemy URL |
| `API_KEY` | `sk-...` | Ключ Bitrix GPT (для пайплайна) |
| `BASE_URL` | `https://...` | Endpoint Bitrix GPT |
| `MODEL` | `bitrixgpt-5.5` | Модель Bitrix GPT |
| `GITHUB_CLIENT_ID` | `Ov23li...` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | `abc123...` | GitHub OAuth App Client Secret |
| `GITHUB_CALLBACK_URL` | `https://your-domain.com/auth/github/callback` | OAuth redirect URL |
| `SESSION_SECRET` | `random-32-char-string` | Секрет для подписи JWT |

> `GITHUB_SOURCE_TOKEN`, `GITHUB_TARGET_TOKEN`, `TARGET_REPO`, `WEBHOOK_SECRET` удалены: GitHub-токены берутся из OAuth-сессии пользователя, a webhook_secret хранится в таблице `projects` per-project.

**Важно:** `DATABASE_URL` использует hostname `db` (имя сервиса в compose), а не `localhost`.

---

## Dockerfile для frontend

```dockerfile
# frontend/Dockerfile (production — multi-stage build)
FROM node:20-alpine AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
```

```nginx
# frontend/nginx.conf
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Миграции при старте

Миграции применяются отдельной командой перед запуском сервисов (не в entrypoint):

```bash
# Применить миграции
docker compose run --rm backend alembic upgrade head

# Затем запустить сервисы
docker compose up -d
```

Или через `command` в `docker-compose.override.yml` для dev:
```yaml
backend:
  command: >
    sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
```

---

## Volumes

| Volume | Назначение |
|--------|-----------|
| `postgres_data` | Данные PostgreSQL (персистентный) |

Логи пайплайна хранятся в `Task.log` (PostgreSQL), не в файловой системе контейнера.
