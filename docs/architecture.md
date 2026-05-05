# DocFlow Web — Архитектура системы

## Назначение

DocFlow Web — веб-сервис вокруг существующего переводческого пайплайна DocFlow AI.

Закрывает сценарий:
1. В GitHub-репозитории изменились `.md`-файлы документации
2. Система автоматически ставит их в очередь на перевод
3. Пайплайн переводит каждый файл в фоне
4. Пользователь открывает задачу, сравнивает оригинал и перевод, при необходимости редактирует
5. Утверждённый перевод публикуется в целевой репозиторий

---

## Компоненты

### GitHub
Пользователь регистрируется по email + паролю. После входа он может привязать GitHub-аккаунт в профиле через OAuth App. После привязки backend получает `access_token` и может:
- читать файлы из source-репозитория
- записывать файлы в target-репозиторий
- получать список доступных репозиториев пользователя

Создавать проекты и запускать публикацию можно только с привязанным GitHub-аккаунтом.

Типовая пара репозиториев:

| Роль | Репозиторий | Назначение |
|------|------------|------------|
| Источник | `bitrix-tools/b24-rest-docs` | Исходная документация на русском |
| Цель | `bitrix24/b24restdocs` | Переведённая документация на английском |

GitHub отправляет `push`-события на `POST /webhook/{project_id}` при изменении файлов в source-репо.

### Backend (FastAPI)
Ядро сервиса. Обязанности:

- Регистрация и вход по email + паролю (JWT)
- Привязка GitHub-аккаунта через OAuth в профиле пользователя
- Управление проектами — создание/редактирование пар source/target репозиториев
- Приём webhook от GitHub и создание задач в БД
- Скачивание содержимого изменённых файлов через GitHub API
- Запуск перевода в фоновом процессе через Pipeline
- REST API для фронтенда
- Публикация утверждённого перевода в целевой репо с проверкой конфликтов

### Pipeline (DocFlow AI)
Существующий переводческий движок.
Подключается как **git submodule** в директорию `pipeline/`.
Backend импортирует `from src.pipeline import run`.
Логика перевода не дублируется и не изменяется.

### Frontend (React + Vite)
Интерфейс для ревью переводов. Навигация разделена на две группы:

**РАБОТА**
- **Задачи** — список задач с фильтрами, поиском, быстрыми действиями; загрузка и скачивание файлов
- **История** — лента публикаций: кто, что и в какой репозиторий опубликовал, ссылки на коммиты
- **Аналитика** — графики объёма, скорости, успешности переводов

**КОНФИГУРАЦИЯ**
- **Репозитории** — управление парами source→target репо, webhook URL и статус
- **Словари** — редактирование данных пайплайна: dictionary, glossary, prompt, pre_translator термины
- **Настройки** — профиль, привязка GitHub, уведомления через Bitrix24

**Экраны задач:**

**TaskDetail** — детальный вид задачи с тремя вкладками:

- **Diff** — CodeMirror MergeView: оригинал RU (read-only) слева, перевод EN (редактируемый) справа. При конфликте вкладка переключается в 3-way merge editor (base / наша версия / их версия) с кнопками принять/отклонить на каждый hunk — аналогично VS Code merge editor
- **Логи** — терминальный вывод пайплайна по всем этапам (Parser → PreTranslator → CodeTranslator → Translator → Fixers → Validator) + строки лога в реальном времени через SSE пока задача выполняется
- **Конфликт** — вкладка появляется только при конфликте публикации, содержит сводку расхождений

Sticky action bar сверху страницы, кнопки зависят от статуса:

| Статус | Доступные действия |
|--------|-------------------|
| `queued` / `running` | Отмена |
| `done` | Опубликовать, Скачать |
| `failed` | Повторить |
| `conflict` | Разрешить конфликт (Diff в режиме 3-way merge) |
| `published` | Скачать |

### Bitrix24 Bot (уведомления)
Гибкая система каналов уведомлений — не привязана к одной команде или чату.

Каждый канал настраивается независимо: метод доставки, адресат, набор событий:

| Метод | Как работает | Адресат |
|-------|-------------|---------|
| `incoming_webhook` | POST на URL, созданный в Bitrix24 | Задаётся в Bitrix24 при создании вебхука |
| `rest_api` | `im.message.add` с токеном приложения | Пользователь / групповой чат / открытый канал — выбирается в DocFlow |

Примеры конфигурации:
- «Ошибки → чат #docflow-errors» (incoming_webhook, events: failure, conflict)
- «Готово к проверке → личка Анне» (rest_api, destination: user 42, events: done)
- «Публикации → канал #документация» (rest_api, destination: channel, events: published)

Каналы управляются через `GET/POST/PATCH/DELETE /notifications/channels`.
Сервис `bitrix_notify.py` итерирует активные каналы и отправляет нужное событие.

### PostgreSQL
Хранилище состояния. Таблицы: `users`, `projects`, `tasks`, `publications`.
Подробнее — [database.md](database.md).

---

## Диаграмма

```
┌──────────────────────────────────────────────────────────────────┐
│                             GitHub                               │
│                                                                  │
│   ┌──────────────────────────┐    ┌──────────────────────────┐   │
│   │  bitrix-tools/b24-rest-  │    │   bitrix24/b24restdocs   │   │
│   │  docs (docs RU, .md)     │    │   (docs EN, .md)         │   │
│   └──────────┬───────────────┘    └──────────────────────────┘   │
│              │ push event                      ▲                  │
│              │                                 │ publish          │
└──────────────┼─────────────────────────────────┼──────────────────┘
               │ POST /webhook/{project_id}       │
               ▼                                  │
┌──────────────────────────────────────────────────────────────────┐
│                      DocFlow Web Backend                         │
│                                                                  │
│   ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────┐  │
│   │  Auth    │  │ Projects │  │   Webhook    │  │  Publisher │  │
│   │  OAuth   │  │ Manager  │  │   Receiver   │  │  + Conflict│  │
│   └──────────┘  └──────────┘  └──────┬───────┘  │  Detection │  │
│                                      │           └────────────┘  │
│                               ┌──────▼───────┐                   │
│                               │ Task Manager │                   │
│                               │ (create/upd) │                   │
│                               └──────┬───────┘                   │
│                                      │                           │
│                          ┌───────────▼──────────────────────┐    │
│                          │     DocFlow AI Pipeline           │    │
│                          │  (git submodule: pipeline/src/)   │    │
│                          └───────────────────────────────────┘    │
│                                                                  │
│   REST API: /auth, /projects, /tasks, /webhook/{id}, /health    │
└──────────────┬───────────────────────────────────────────────────┘
               │
   ┌───────────┴────────────┐
   │                        │
   ▼                        ▼
┌──────────┐     ┌────────────────────────────────────┐
│PostgreSQL│     │   Frontend (React + Vite)           │
│          │     │                                     │
│ users    │     │  Login → Projects → TaskList        │
│ projects │     │            ↓                        │
│ tasks    │     │         TaskDetail                  │
│ publications   │    (diff + 3-way conflict + edit)   │
└──────────┘     └────────────────────────────────────┘
```

**Локальная разработка — добавляется Cloudpub tunnel:**

```
GitHub Webhook ──▶ cloudpub tunnel ──▶ localhost:8000/webhook/{project_id}
```

---

## Поток данных

### Регистрация, вход и привязка GitHub

1. Пользователь регистрируется: `POST /auth/register` (email + пароль) → получает JWT-cookie
2. Или входит: `POST /auth/login` → JWT-cookie
3. В профиле нажимает "Connect GitHub" → редирект на `GET /auth/github/connect`
4. GitHub OAuth: пользователь подтверждает доступ → редирект на `/auth/github/callback?code=...`
5. Backend обменивает `code` на `access_token`, сохраняет `github_id`, `github_login`, `github_access_token` в запись `users`
6. Теперь пользователь может создавать проекты

### Настройка проекта

1. Пользователь создаёт проект: выбирает source-репо, source-ветку, target-репо, target-ветку
2. Backend сохраняет в `projects`, возвращает `project_id`
3. Пользователь настраивает webhook в GitHub: URL = `https://<host>/webhook/{project_id}`, secret = `webhook_secret` из проекта

### Основной сценарий (перевод)

1. Разработчик делает `git push` с изменёнными `.md`-файлами в source repo
2. GitHub отправляет `push` webhook на `POST /webhook/{project_id}`
3. Backend верифицирует HMAC-подпись (`X-Hub-Signature-256`)
4. Backend разбирает payload: извлекает список изменённых `.md` из `commits[*].added` + `commits[*].modified`
5. Для каждого файла: скачивает содержимое через GitHub API, запоминает `source_file_sha`
6. Создаёт запись `Task` в БД: `status=queued`, `original_content=<содержимое>`, `project_id`
7. Запускает фоновую задачу `pipeline_runner.run_task(task_id)`
8. Runner: пишет оригинал во временный файл → вызывает `pipeline.run()` → читает результат → обновляет `Task`: `status=done`, `translated_content=<перевод>`, `log=<лог>`
9. Если ошибка: `status=failed`, `error=<traceback>`

### Сценарий ревью и публикации

1. Пользователь открывает список задач в UI
2. Открывает задачу со статусом `done`
3. Видит diff: слева оригинал (read-only), справа перевод (редактируемый)
4. Вносит правки → нажимает "Save" → `PATCH /tasks/{id}` обновляет `translated_content`
5. Нажимает "Publish" → `POST /tasks/{id}/publish`
6. Backend: через GitHub API получает текущий SHA файла в target repo
   - **Нет конфликта** (SHA совпадает с ожидаемым или файл новый): создаёт/обновляет файл → commit → записывает в `publications` → `status=published`
   - **Конфликт** (кто-то изменил EN-файл вручную): возвращает `409` с тремя версиями для 3-way diff
7. При конфликте пользователь видит 3-way diff, разрешает вручную → повторная публикация

### Определение конфликта при публикации

```
При создании задачи:
  запомнить target_file_sha = GET /repos/{target}/contents/{path} → sha
  (если файл не существует: target_file_sha = null)

При публикации:
  current_sha = GET /repos/{target}/contents/{path} → sha
  
  если current_sha == target_file_sha (или оба null):
      → безопасно публиковать
  иначе:
      → конфликт: вернуть 409 с {base, ours, theirs}
        base  = original_content (оригинал RU из задачи)
        ours  = translated_content (наш перевод)
        theirs = текущее содержимое EN-файла
```

---

### Real-time обновления (SSE)

Пока задача выполняется (`status=running`), фронтенд подключается к потоку событий:

```
GET /tasks/{id}/events
Accept: text/event-stream
```

Сервер стримит три типа событий:

| Событие | Данные | Когда |
|---------|--------|-------|
| `stage_update` | `{"stage": "Translator", "index": 3, "total": 7}` | При переходе между этапами пайплайна |
| `log_line` | `{"line": "  Плейсхолдеров: 61"}` | Каждая строка лога |
| `status_change` | `{"status": "done"}` | При смене статуса задачи |

Браузер автоматически переподключается при разрыве. После `status_change` фронтенд закрывает SSE и запрашивает итоговую задачу через `GET /tasks/{id}`.

---

### Multi-file push

Один `git push` может затрагивать несколько `.md`-файлов. Backend создаёт по одной задаче на каждый файл. Задачи одного коммита объединяются через `github_sha` и хранят `commit_message` из webhook payload.

На дашборде задачи из одного коммита визуально группируются под заголовком коммита — чтобы не было путаницы при большом объёме задач.

Пример: push с 3 файлами → 3 задачи с одинаковым `github_sha` и `commit_message = "docs: add CRM deal methods"`.

---

### Дедупликация задач

Если при обработке webhook файл уже находится в активной задаче:

| Статус существующей задачи | Поведение |
|---------------------------|-----------|
| `queued` | Файл добавляется в поле `skipped` ответа webhook с `reason: "already_queued"` и `existing_task_id`. Пользователь решает через UI: заменить задачу или оставить |
| `running` | Файл добавляется в `skipped` с `reason: "pipeline_running"` — дождаться завершения |
| `done` / `failed` / `published` | Новая задача создаётся без ограничений, предыдущая версия сохраняется |

---

### Ручной запуск перевода

Пользователь может запустить перевод вручную через кнопку «Запустить перевод» без webhook.

Два источника файла:
1. **Из репозитория** — файловый браузер по source-репо выбранного проекта (GitHub API). Поддерживает выбор нескольких файлов одновременно
2. **Загрузка с компьютера** — upload локального `.md`-файла. Project_id обязателен (нужен target-репо для последующей публикации)

Эндпоинт: `POST /tasks/manual`.

---

### Исключения файлов

Каждый проект поддерживает список паттернов исключений (gitignore-синтаксис), хранящихся в `projects.exclude_patterns`. Файлы, совпадающие с паттернами, игнорируются при обработке webhook.

Примеры паттернов:
```
**/CHANGELOG.md
**/README.md
docs/internal/**
```

Паттерны настраиваются в UI раздела «Репозитории» при создании / редактировании проекта.

---

### Онбординг

При первом входе пользователя (нет проектов, GitHub не привязан) отображается онбординг-модалка с шагами:

1. **Привязать GitHub** — OAuth редирект
2. **Создать проект** — выбор source / target репозиториев
3. **Настроить webhook** — инструкция: URL и секрет из карточки проекта

Можно пропустить: загрузить `.md`-файл с компьютера и получить перевод без привязки репозиториев. Публикация в target repo в этом случае недоступна.

---

### Настройки

| Раздел | Содержание |
|--------|-----------|
| Профиль | Отображаемое имя, email, смена пароля |
| GitHub | Статус привязки, кнопки Connect / Disconnect |
| Версия пайплайна | Текущий commit hash submodule (read-only), пример: `a3f2c1d` |
| Timezone | Часовой пояс для отображения дат в UI |

---

### Retry с изменившимся источником

При повторном запуске (`POST /tasks/{id}/retry`) backend сравнивает текущий SHA source-файла с `task.source_file_sha`:

- **SHA не изменился** → пайплайн запускается с исходным `original_content`
- **SHA изменился** → backend возвращает `409` с предупреждением

При `409` пользователь выбирает:
- **Продолжить** — перевести сохранённую версию файла (`force: true` в теле запроса)
- **Обновить** — скачать актуальный файл и создать новую задачу через `POST /tasks/manual`

---

## Структура репозитория

```
docflow-web/
├── .agents/
│   └── skills/                  # AI workflow skills
├── pipeline/                    # DocFlow AI pipeline (git submodule)
│   ├── src/                     # переводческий движок
│   ├── data/                    # промпт, словари
│   ├── config.py
│   └── ...
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, роуты
│   │   ├── config.py            # pydantic-settings
│   │   ├── database.py          # SQLAlchemy engine + session
│   │   ├── models/
│   │   │   ├── user.py          # User ORM model
│   │   │   ├── project.py       # Project ORM model
│   │   │   ├── task.py          # Task ORM model
│   │   │   └── publication.py   # Publication ORM model
│   │   ├── schemas/
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── task.py
│   │   │   └── publication.py
│   │   ├── routers/
│   │   │   ├── auth.py          # register, login, logout, /auth/github/connect, /auth/me
│   │   │   ├── projects.py      # CRUD /projects (UI: «Репозитории»)
│   │   │   ├── tasks.py         # GET/PATCH /tasks, POST /retry, /publish
│   │   │   ├── history.py       # GET /history — лента публикаций
│   │   │   ├── dictionaries.py  # GET/POST/PATCH/DELETE /dictionaries/{type}
│   │   │   └── webhook.py       # POST /webhook/{project_id}
│   │   └── services/
│   │       ├── pipeline_runner.py  # запуск пайплайна в фоне
│   │       ├── dictionary_merger.py # мёрж БД-правок с базовыми файлами pipeline/data/
│   │       ├── github.py           # GitHub API клиент
│   │       ├── bitrix_notify.py    # отправка уведомлений в Bitrix24
│   │       └── auth.py             # OAuth flow, JWT
│   ├── migrations/              # Alembic
│   │   └── versions/
│   ├── alembic.ini
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── client.js        # axios клиент
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── TaskList.jsx        # главный экран
│   │   │   ├── TaskDetail.jsx      # diff + лог + публикация
│   │   │   ├── History.jsx         # лента публикаций
│   │   │   ├── Analytics.jsx       # графики
│   │   │   ├── Repositories.jsx    # управление парами репо (UI для /projects)
│   │   │   ├── Dictionaries.jsx    # редактор словарей пайплайна
│   │   │   └── Settings.jsx        # профиль, GitHub, Bitrix24
│   │   └── components/
│   │       ├── DiffEditor.jsx      # CodeMirror MergeView (2-way)
│   │       ├── ConflictEditor.jsx  # 3-way diff при конфликте
│   │       └── DictionaryTable.jsx # таблица-редактор для словарей
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitmodules
└── .gitignore
```

---

## Технологические решения

| Решение | Выбор | Причина |
|---------|-------|---------|
| Auth | Email + пароль (bcrypt) | Независимая от GitHub аутентификация; GitHub привязывается отдельно |
| GitHub linking | OAuth App в профиле | Разделяет "кто ты" и "доступ к репо"; можно перепривязать без потери данных |
| Sessions | JWT (httponly cookie) | Stateless, не требует Redis для MVP |
| Pipeline integration | git submodule в `pipeline/` | Деплоится одной командой, не дублирует код |
| Dictionary overrides | БД-таблица `dictionary_entries` + мёрж при запуске | Правки через UI не теряются при деплое; базовые файлы submodule остаются нетронутыми |
| Background tasks | FastAPI `BackgroundTasks` | Достаточно для MVP, не требует брокера |
| DB | PostgreSQL 15 | Поддержка UUID, JSONB на перспективу |
| Migrations | Alembic | Стандарт для SQLAlchemy |
| Conflict detection | SHA-сравнение через GitHub API | Нативный механизм GitHub, не требует хранить полный контент |
| GitHub publish | REST API v3 с user token (из OAuth) | Коммиты от имени реального пользователя |
| Notifications | Bitrix24 bot (REST API) | Не нужен отдельный email-сервис; команда уже в Bitrix24 |
| Diff viewer | CodeMirror 6 MergeView | Встроенный diff, поддерживает Markdown |
| Real-time updates | SSE (Server-Sent Events) | Однонаправленный поток server→client; автореконнект браузером; не требует WebSocket |
| File exclusions | gitignore-style в `projects.exclude_patterns` | Фильтрация файлов при обработке webhook без изменения кода |
| Tunnel (dev) | Cloudpub | Публичный URL для локального webhook |