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
    environment:
      - VITE_PROXY_TARGET=http://backend:8000
      - CHOKIDAR_USEPOLLING=true
      - CHOKIDAR_INTERVAL=300
      - WATCHPACK_POLLING=true
    ports:
      - "5173:5173"
    command: npm run dev -- --host
```

Для bind-mount в Docker polling включён специально: без него Vite/Chokidar на некоторых хостах и Docker Desktop может не увидеть изменения в `frontend/src` до перезапуска контейнера.

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
| `APP_BASE_URL` | `https://your-backend-domain.com` | Публичный base URL backend; используется для webhook URL и внешних backend-ссылок |
| `FRONTEND_BASE_URL` | `https://your-frontend-domain.com` | Публичный base URL frontend; OAuth callback собирается как `${FRONTEND_BASE_URL}/auth/github/callback` |
| `SESSION_SECRET` | `random-32-char-string` | Секрет для подписи JWT |

> `GITHUB_SOURCE_TOKEN`, `GITHUB_TARGET_TOKEN`, `TARGET_REPO`, `WEBHOOK_SECRET` удалены: GitHub-токены берутся из OAuth-сессии пользователя, a webhook_secret хранится в таблице `projects` per-project.

**Важно:** `DATABASE_URL` использует hostname `db` (имя сервиса в compose), а не `localhost`.

---

## Dockerfile для frontend

**Production** (`frontend/Dockerfile`) — двухэтапная сборка: Node собирает статику, nginx раздаёт:

```dockerfile
# Build context: repo root
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

**Dev** (`frontend/Dockerfile.dev`) — Vite dev server с hot reload:

```dockerfile
# Build context: repo root
FROM node:20-alpine
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
CMD ["npm", "run", "dev"]
```

В dev исходники монтируются через volume — пересборка образа не нужна при изменении кода.

**`frontend/nginx.conf`** — проксирование API и поддержка SSE:

```nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE: без этого nginx буферизует ответ и события не доходят в реальном времени
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        chunked_transfer_encoding on;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

Все вызовы фронтенда идут на `/api/...` → nginx стрипает `/api` и проксирует на `backend:8000/...`.

**Vite proxy для локальной разработки** (без Docker):

```
// vite.config.ts — уже настроен
proxy: {
  '/api': {
    target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
    rewrite: (path) => path.replace('/api', ''),
  }
}
```

В Docker dev `VITE_PROXY_TARGET=http://backend:8000` задаётся через `environment` в `docker-compose.dev.yml`.

**Порты фронтенда:**

| Режим | URL | Сервер |
|-------|-----|--------|
| Dev Docker | `http://localhost:5173` | Vite dev server |
| Dev локально | `http://localhost:5173` | `npm run dev` |
| Prod | `http://localhost:3000` | nginx |

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
|--------|------------|
| `postgres_data` | Данные PostgreSQL (персистентный) |

Логи пайплайна хранятся в `Task.log` (PostgreSQL), не в файловой системе контейнера.

---

## Рабочий процесс

### Первый запуск (один раз на машину)

```bash
# 1. Инициализировать pipeline submodule
git submodule update --init

# 2. Поднять проект в dev-режиме
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# 3. Применить миграции БД
docker compose run --rm backend alembic upgrade head
```

### Ежедневная разработка

```bash
# Запустить
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Запустить в фоне
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Остановить
docker compose down

# Логи бэка
docker compose logs backend -f
```

Код в `backend/app/` монтируется напрямую — uvicorn перезагружается при каждом сохранении файла. Пересборка образа не нужна пока меняется только Python-код.

### Когда нужна пересборка

| Ситуация | Команда |
|----------|---------|
| Добавил зависимость в `pyproject.toml` | `docker compose build backend` |
| Изменился `Dockerfile` | `docker compose build backend` |
| Обновил pipeline submodule | `docker compose build backend` |

После пересборки перезапустить:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Управление миграциями

```bash
# Создать миграцию (после изменения ORM-модели)
docker compose exec backend alembic revision --autogenerate -m "add users table"

# Применить все
docker compose exec backend alembic upgrade head

# Откатить последнюю
docker compose exec backend alembic downgrade -1

# Текущее состояние
docker compose exec backend alembic current
```

> `exec` — команда в работающем контейнере. `run --rm` — одноразовый контейнер (для миграций до старта сервисов).

### Тесты

Unit-тесты запускаются локально — быстрее и не требуют Docker:

```bash
cd backend
python -m pytest
```

Интеграционные тесты (с реальной БД) — поднять только базу:

```bash
docker compose up db -d
DATABASE_URL=postgresql://docflow:docflow_secret@localhost:5432/docflow pytest
```

### Полезные команды

```bash
# Зайти в контейнер бэка
docker compose exec backend bash

# Проверить импорт пайплайна
docker compose exec backend python -c "from src.pipeline import run; print('Pipeline OK')"

# Сбросить БД (удалит все данные)
docker compose down -v

# Статус контейнеров
docker compose ps
```

### Алиасы (рекомендуется)

PowerShell (`$PROFILE`):
```powershell
function dcdev { docker compose -f docker-compose.yml -f docker-compose.dev.yml @args }
```

Bash (`.bashrc`):
```bash
alias dcdev="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
```

Использование:
```bash
dcdev up
dcdev up --build
dcdev logs backend -f
```

---

## Production

### Как прод отличается от dev

| Параметр | Dev | Prod |
|----------|-----|------|
| Код | volume mount (живой) | запечён в образ |
| uvicorn | `--reload` | без флага |
| Порты наружу | 8000 (backend прямой) | только 80/443 через Caddy |
| SSL | нет | автоматически через Caddy + Let's Encrypt |
| Миграции | вручную | перед каждым рестартом |
| pipeline/ | volume mount | запечён в образ |

### Топология в проде

```
Internet (80/443)
       │
       ▼
  ┌─────────┐   автоматический SSL (Let's Encrypt)
  │  Caddy  │
  └────┬────┘
       │ proxy → frontend:80
       ▼
  ┌──────────┐
  │ frontend │  nginx внутри
  │ (nginx)  │──── /api/* → backend:8000
  └──────────┘
       │
       ▼
  ┌──────────┐        ┌──────┐
  │ backend  │───────▶│  db  │
  │ uvicorn  │        │  pg  │
  └──────────┘        └──────┘

Caddy, frontend, backend, db — в одной сети docflow-network.
Наружу смотрит только Caddy (80, 443).
```

### Добавление Caddy в docker-compose.yml

Когда будем деплоить на сервер — добавить в `docker-compose.yml` сервис Caddy и убрать прямые порты backend/frontend:

```yaml
services:
  caddy:
    image: caddy:alpine
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - docflow-network
    depends_on:
      - frontend

  frontend:
    # убрать ports: — внешний доступ только через Caddy
    networks:
      - docflow-network

  backend:
    # убрать ports: 8000:8000 — доступен только внутри сети
    networks:
      - docflow-network

volumes:
  caddy_data:
  caddy_config:
```

`Caddyfile` в корне репо (рядом с docker-compose.yml):

```
your-domain.com {
    reverse_proxy frontend:80
}
```

Caddy сам получит SSL-сертификат от Let's Encrypt при первом старте.

### Первый деплой на сервер

```bash
# На сервере (VPS с Ubuntu + Docker)

# 1. Клонировать с submodule
git clone --recursive https://github.com/gs-bitrix-doc/docflow-web
cd docflow-web

# 2. Настроить переменные
cp .env.example .env
nano .env
# Обязательно обновить:
#   APP_BASE_URL=https://your-domain.com
#   SESSION_SECRET=<новый случайный ключ>
#   API_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

# 3. Собрать образы
docker compose build

# 4. Применить миграции
docker compose run --rm backend alembic upgrade head

# 5. Запустить
docker compose up -d
```

### Обновление в проде

```bash
# 1. Получить изменения
git pull
git submodule update   # если обновился pipeline

# 2. Пересобрать образы
docker compose build

# 3. Применить новые миграции
docker compose run --rm backend alembic upgrade head

# 4. Перезапустить с новыми образами
docker compose up -d
```

> `docker compose up -d` с уже поднятыми контейнерами заменяет только те, у которых изменился образ. База данных не трогается.

### Откат при проблемах

```bash
# Откатить последнюю миграцию
docker compose run --rm backend alembic downgrade -1

# Вернуться на предыдущий коммит
git checkout <предыдущий-commit>
docker compose build backend
docker compose up -d backend
```

### Секреты на сервере

`.env` не хранится в git. На сервере создаётся вручную один раз. При обновлении кода `.env` не трогается — только `git pull` + `docker compose build`.

Если несколько разработчиков деплоят: передавать `.env` через защищённый канал (1Password, Bitwarden, SSH-копирование) один раз при настройке сервера.

---

## Pipeline в production

### Как pipeline попадает в контейнер

Pipeline — git submodule, копируется в образ при сборке:

```
docker compose build
  → COPY pipeline/ ./pipeline/   # весь submodule запекается в образ
  → PYTHONPATH=/app/pipeline     # from src.pipeline import run ✓
```

Конкретный коммит pipeline фиксируется в `.gitmodules`. На всех серверах и у всех разработчиков работает **одна и та же версия** пайплайна — та, что зафиксирована в репо.

```bash
# Посмотреть какой коммит pipeline сейчас зафиксирован
git submodule status
# a3f2c1d pipeline (heads/main)
```

### Переменные окружения для pipeline

Pipeline читает конфигурацию через `os.getenv()`. Переменные передаются из `.env` через `env_file: .env` в docker-compose:

```
.env → backend-контейнер → os.environ → pipeline.run()
```

| Переменная | Для чего |
|------------|----------|
| `API_KEY` | Ключ Bitrix GPT |
| `BASE_URL` | Endpoint LLM |
| `MODEL` | Название модели |

### Временные файлы при переводе

Для каждой задачи pipeline создаёт временную директорию:

```
/tmp/docflow/{task_id}/
├── input/
│   └── crm-deal-get.md    ← original_content из БД
└── output/
    └── crm-deal-get.md    ← результат перевода
```

После завершения runner читает `output/`, сохраняет в `task.translated_content` и **удаляет директорию**. В prod никакие файлы перевода не хранятся на диске — только в PostgreSQL.

### Параллельные задачи

FastAPI `BackgroundTasks` запускает каждый перевод как отдельную фоновую корутину. Несколько задач выполняются одновременно — каждая в своей `/tmp/docflow/{task_id}/` директории, конфликтов нет.

Ограничение: при одном uvicorn-воркере (`--workers 1`, дефолт) параллелизм ограничен числом async-задач. Для MVP этого достаточно — pipeline вызывается синхронно внутри `asyncio.to_thread()`, что не блокирует event loop.

### Критичный edge case: рестарт контейнера во время перевода

Если backend-контейнер перезапустится пока задача в статусе `running`:
- Фоновая задача убивается вместе с процессом
- В БД задача навсегда остаётся в статусе `running`
- Пользователь видит зависший прогресс-бар

**Решение — startup cleanup в `main.py`:**

```python
@app.on_event("startup")
async def reset_stuck_tasks():
    # При старте: все задачи в статусе running → queued
    # (процесс был убит, результата нет, нужно перезапустить)
    async with SessionLocal() as session:
        await session.execute(
            update(Task)
            .where(Task.status == "running")
            .values(status="queued", error="Прервано перезапуском сервера")
        )
        await session.commit()
```

Это реализуется в **Этапе 8** при написании `pipeline_runner.py`.

### Обновление версии pipeline

```bash
# Обновить pipeline до последней версии main
cd pipeline && git pull origin main && cd ..
git add pipeline
git commit -m "chore: update pipeline to latest"

# Пересобрать образ и задеплоить
docker compose build backend
docker compose up -d backend
```

Откат pipeline так же прост — зафиксировать предыдущий коммит submodule и пересобрать.
