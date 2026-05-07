# DocFlow Web — API Specification

Base URL: `http://localhost:8000` (dev) / `https://your-domain.com` (prod)

Все эндпоинты, кроме `/health`, `/auth/register`, `/auth/login` и `POST /webhook/{project_id}`, требуют авторизации через JWT-cookie (`session`).

---

## GET /health

Проверка работоспособности сервиса.

**Response 200:**
```json
{ "status": "ok" }
```

---

## Auth

### POST /auth/register

Регистрация нового пользователя.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "strongpassword",
  "display_name": "Bitrix Doc Team"
}
```

**Логика:**
1. Проверить, что email не занят
2. Сохранить `bcrypt(password)` в `password_hash`
3. Выдать JWT, установить `session` cookie (httponly, secure)

**Response 201:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "display_name": "Bitrix Doc Team",
  "github_linked": false
}
```

**Response 400** — email уже занят:
```json
{ "detail": "Email already registered" }
```

---

### POST /auth/login

Вход по email и паролю.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "strongpassword"
}
```

**Response 200:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "display_name": "Bitrix Doc Team",
  "github_linked": true,
  "github_login": "gs-bitrix-doc"
}
```

**Response 401** — неверный email или пароль:
```json
{ "detail": "Invalid credentials" }
```

---

### GET /auth/me

Информация о текущем авторизованном пользователе.

**Response 200:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "display_name": "Bitrix Doc Team",
  "github_linked": true,
  "github_login": "gs-bitrix-doc"
}
```

**Response 401** — не авторизован.

---

### POST /auth/change-password

Смена пароля текущего пользователя.

**Request body:**
```json
{
  "current_password": "oldpassword",
  "new_password": "newstrongpassword"
}
```

**Response 200:**
```json
{ "ok": true }
```

**Response 400** — текущий пароль неверный:
```json
{ "detail": "Current password is incorrect" }
```

---

### POST /auth/logout

Завершить сессию.

**Response 200:**
```json
{ "ok": true }
```

---

### GET /auth/github/connect

Редирект на GitHub OAuth для привязки аккаунта. Требует активной сессии.

**Response 302** — редирект на:
```
https://github.com/login/oauth/authorize?client_id=...&scope=repo&state=...
```

---

### GET /auth/github/callback

Обработка callback от GitHub после подтверждения OAuth. Требует активной сессии и корректного `state` из cookie.

**Query params:**
- `code` — код авторизации от GitHub
- `state` — CSRF-токен (проверяется бекендом)

**Логика:**
1. Обменять `code` на `access_token`
2. Получить профиль: `GET https://api.github.com/user`
3. Обновить текущего пользователя: сохранить `github_id`, `github_login`, `github_access_token`
4. Редирект на страницу настроек

**Response 302** — редирект на `${FRONTEND_BASE_URL}/settings`

**Response 409** — этот GitHub-аккаунт уже привязан к другому пользователю:
```json
{ "detail": "GitHub account already linked to another user" }
```

**Response 401** — нет валидной `session` cookie.

---

### DELETE /auth/github/connect

Отвязать GitHub-аккаунт. Проекты сохраняются, но создавать задачи и публиковать будет нельзя до повторной привязки.

**Response 200:**
```json
{ "ok": true }
```

---

## Projects

### GET /projects

Список проектов текущего пользователя.

**Response 200:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "b24-rest-docs RU→EN",
    "source_repo": "bitrix-tools/b24-rest-docs",
    "source_branch": "main",
    "target_repo": "bitrix24/b24restdocs",
    "target_branch": "main",
    "exclude_patterns": ["**/CHANGELOG.md", "**/README.md"],
    "webhook_url": "https://your-host/webhook/550e8400-e29b-41d4-a716-446655440001",
    "created_at": "2026-05-05T10:00:00Z"
  }
]
```

---

### POST /projects

Создать новый проект.

**Request body:**
```json
{
  "name": "b24-rest-docs RU→EN",
  "source_repo": "bitrix-tools/b24-rest-docs",
  "source_branch": "main",
  "target_repo": "bitrix24/b24restdocs",
  "target_branch": "main",
  "exclude_patterns": ["**/CHANGELOG.md", "**/README.md"]
}
```

> `exclude_patterns` — опциональный массив паттернов в gitignore-синтаксисе. Файлы, совпадающие с паттернами, игнорируются при обработке webhook.

**Логика:**
- Требует привязанный GitHub-аккаунт у текущего пользователя
- Валидирует `source_repo` и `target_repo` в формате `owner/repo`
- Генерирует `webhook_secret` (случайная строка)
- Сохраняет проект в БД

**Response 201:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "b24-rest-docs RU→EN",
  "source_repo": "bitrix-tools/b24-rest-docs",
  "source_branch": "main",
  "target_repo": "bitrix24/b24restdocs",
  "target_branch": "main",
  "exclude_patterns": ["**/CHANGELOG.md", "**/README.md"],
  "webhook_url": "https://your-host/webhook/550e8400-e29b-41d4-a716-446655440001",
  "webhook_secret": "whsec_abc123...",
  "created_at": "2026-05-05T10:00:00Z"
}
```

> `webhook_secret` возвращается только при создании. Для настройки GitHub webhook: Settings → Webhooks → Add webhook.

---

### GET /projects/{id}

Детали проекта.

**Response 200** — та же схема, что и элемент в `GET /projects`, без `webhook_secret`.

**Response 404** — проект не найден или не принадлежит текущему пользователю.

---

### PATCH /projects/{id}

Обновить конфигурацию проекта.

**Request body** (все поля опциональны):
```json
{
  "name": "b24 RU→EN (prod)",
  "target_branch": "docs-en",
  "exclude_patterns": ["**/drafts/**"]
}
```

**Response 200** — обновлённый проект.

---

### DELETE /projects/{id}

Удалить проект. Связанные задачи сохраняются.

**Response 204** — удалено.

---

## Webhook

### POST /webhook/{project_id}

Приём `push`-события от GitHub. Запрос отправляется автоматически при пуше в source repo.
`ping`-событие от GitHub используется для проверки webhook и возвращает `200 { "ok": true }`.

**Headers:**
```
X-GitHub-Event: push
X-Hub-Signature-256: sha256=<hmac>
Content-Type: application/json
```

**Логика обработки:**
1. Найти проект по `project_id`
2. Верифицировать HMAC-подпись с использованием `project.webhook_secret`
3. Проверить, что `ref` совпадает с `project.source_branch`
4. Собрать все `.md`-файлы из `commits[*].added` + `commits[*].modified`
5. Убедиться, что у владельца проекта есть действующая GitHub-привязка
6. Для каждого файла:
   - Скачать содержимое через GitHub API с токеном владельца проекта
   - Получить `source_file_sha` (SHA blob RU-файла)
   - Получить `target_file_sha` (SHA blob EN-файла в target repo; `null` если не существует)
   - Создать `Task` со статусом `queued`, `github_ref = payload.ref`, `github_sha = payload.after`, `commit_message = payload.head_commit.message`
7. Запустить фоновый перевод каждой задачи

> Если хотя бы один файл не удалось скачать из GitHub, webhook обрабатывается атомарно: новые задачи не создаются вообще.

**Response 202:**
```json
{
  "created": 2,
  "task_ids": [
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003"
  ],
  "skipped": [
    {
      "file_path": "api-reference/crm/leads/crm-lead-get.md",
      "reason": "already_queued",
      "existing_task_id": "550e8400-e29b-41d4-a716-446655440007"
    }
  ]
}
```

> `skipped` — файлы, пропущенные из-за дедупликации. Возможные `reason`: `"already_queued"` (задача ждёт в очереди), `"pipeline_running"` (пайплайн уже выполняется), `"excluded_by_pattern"` (файл совпадает с `exclude_patterns` проекта).

**Response 400** — `ref` не совпадает с source_branch или нет `.md`-файлов:
```json
{ "detail": "No translatable files in this push" }
```

**Response 400** — у владельца проекта нет GitHub-привязки:
```json
{ "detail": "GitHub account is not linked" }
```

**Response 403** — неверная HMAC-подпись:
```json
{ "detail": "Invalid webhook signature" }
```

**Response 404** — проект не найден.

**Response 502** — GitHub API не дал скачать хотя бы один нужный файл.

---

## Tasks

### GET /tasks

Список задач с фильтрацией.

По умолчанию возвращает задачи пользователя по всем его проектам. `project_id` — опциональный фильтр, а не обязательный параметр. Задачи с `project_id = null` в список не попадают.

**Query params:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `project_id` | UUID | — | Опциональный фильтр по одному из проектов текущего пользователя |
| `status` | string | — | Фильтр: `queued`, `running`, `done`, `failed`, `published` |
| `limit` | int | 50 | Максимум записей |
| `offset` | int | 0 | Смещение для пагинации |

**Response 200:**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "project_id": "550e8400-e29b-41d4-a716-446655440001",
      "file_path": "api-reference/crm/deals/crm-deal-get.md",
      "status": "done",
      "created_at": "2026-05-05T10:00:00Z",
      "updated_at": "2026-05-05T10:02:30Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

### GET /tasks/{id}

Детали задачи, включая содержимое оригинала и перевода.

**Response 200:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "project_id": "550e8400-e29b-41d4-a716-446655440001",
  "file_path": "api-reference/crm/deals/crm-deal-get.md",
  "github_ref": "refs/heads/main",
  "github_sha": "abc123def456",
  "source_file_sha": "blobsha111",
  "target_file_sha": "blobsha222",
  "original_content": "# Метод crm.deal.get\n...",
  "translated_content": "# Method crm.deal.get\n...",
  "status": "done",
  "error": null,
  "created_at": "2026-05-05T10:00:00Z",
  "updated_at": "2026-05-05T10:02:30Z",
  "publications": []
}
```

**Response 404** — задача не найдена или не принадлежит текущему пользователю.

---

### GET /tasks/{id}/log

Сырой лог пайплайна.

**Response 200** (`Content-Type: text/plain`):
```
[INFO] crm-deal-get.md
  Размер: 5820 символов
  Плейсхолдеров: 61
  Документ разбит на 3 части
  Перевод получен
  ...
  Сохранено: output/crm-deal-get.md
```

**Response 204** — задача существует, лог ещё пуст (статус `queued`).  
**Response 404** — задача не найдена.

---

### GET /tasks/{id}/events

Поток событий о прогрессе выполнения задачи (Server-Sent Events). Используется фронтендом пока задача в статусе `running`.

**Response** (`Content-Type: text/event-stream`):
```
event: stage_update
data: {"stage": "prepare", "index": 1, "total": 3}

event: log_line
data: {"line": "  Размер: 5820 символов"}

event: log_line
data: {"line": "  Плейсхолдеров: 61"}

event: stage_update
data: {"stage": "pipeline", "index": 2, "total": 3}

event: status_change
data: {"status": "done"}
```

После получения `status_change` фронтенд закрывает SSE и запрашивает полную задачу через `GET /tasks/{id}`.

Если клиент подключился, когда задача ещё `queued` или уже завершена, сервер сразу возвращает одно событие `status_change` с текущим статусом и закрывает поток.

**Response 404** — задача не найдена.

---

### PATCH /tasks/{id}

Обновление перевода после ручной правки в UI. Допускается для статусов `done` и `failed`.

**Request body:**
```json
{
  "translated_content": "# Method crm.deal.get\n...(edited)..."
}
```

**Response 200** — обновлённая задача (та же схема, что и `GET /tasks/{id}`).

**Response 400:**
```json
{ "detail": "Cannot edit task with status 'running'" }
```

---

### POST /tasks/manual

Ручной запуск перевода без webhook.

**Вариант A — файлы из репозитория:**
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440001",
  "file_paths": [
    "api-reference/crm/deals/crm-deal-get.md",
    "api-reference/crm/deals/crm-deal-list.md"
  ]
}
```

**Вариант B — загрузка файла с компьютера:**
```
Content-Type: multipart/form-data

project_id: 550e8400-e29b-41d4-a716-446655440001
target_path: api-reference/crm/deals/crm-deal-get.md
file: <binary .md file>
```

**Логика:**
- Для файлов из репо:
  - требует привязанный GitHub-аккаунт
  - скачивает содержимое через GitHub API, фиксирует `source_file_sha`
- Для загружаемых файлов:
  - не требует GitHub-link
  - использует `target_path` как итоговый путь задачи
  - принимает только `.md`, максимум 1 MB, только UTF-8
  - создаёт задачу с `source_file_sha = null`
- Для обоих вариантов:
  - применяется `exclude_patterns` проекта
  - дедупликация проверяет активные задачи со статусами `queued` и `running`
  - ручные задачи сохраняются с `github_ref = "manual"`, `github_sha = null`, `commit_message = "manual"`
  - API поддерживает частичный успех: валидные задачи создаются, пропуски возвращаются в `skipped`

**Response 201:**
```json
{
  "created": 2,
  "task_ids": [
    "550e8400-e29b-41d4-a716-446655440010",
    "550e8400-e29b-41d4-a716-446655440011"
  ],
  "skipped": [
    {
      "file_path": "docs/private/secret.md",
      "reason": "excluded_by_pattern",
      "existing_task_id": null
    },
    {
      "file_path": "docs/already-running.md",
      "reason": "pipeline_running",
      "existing_task_id": "550e8400-e29b-41d4-a716-446655440099"
    }
  ]
}
```

**Response 400** — запуск из репозитория без GitHub-link:
```json
{ "detail": "GitHub account is not linked" }
```

---

### POST /tasks/{id}/retry

Повторный запуск пайплайна. Применимо для `failed` и `done`. Сбрасывает `translated_content`, `log`, `error`, устанавливает `status=queued`.

**Request body** (опционально):
```json
{ "force": true }
```

> `force: true` — перевести сохранённую версию файла даже если source изменился.

> Для upload-задач (`github_ref = "manual"` и `source_file_sha = null`) GitHub-проверка source SHA не выполняется.

**Response 202:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "status": "queued"
}
```

**Response 400:**
```json
{ "detail": "Cannot retry task with status 'running'" }
```

**Response 409** — source-файл изменился с момента создания задачи:
```json
{
  "detail": "Source file has changed since task was created",
  "source_diff": {
    "old_sha": "blobsha111",
    "new_sha": "blobsha999"
  }
}
```

> При `409` передайте `force: true` чтобы продолжить со старым содержимым, или создайте новую задачу через `POST /tasks/manual`.

---

### POST /tasks/{id}/publish

Публикация перевода в target репозиторий. Доступно только для `status=done`.

**Логика:**
1. Получить текущий SHA EN-файла в target repo через GitHub API
2. Сравнить с `task.target_file_sha` (зафиксирован при создании задачи):
   - `current_sha == task.target_file_sha` (или оба `null`) → нет конфликта, публикуем
   - Иначе → файл изменился вручную, вернуть `409` с данными для 3-way diff
3. При публикации: создать/обновить файл в target repo (GitHub API), передав `current_sha` для атомарности
4. Записать в `publications`: `commit_sha`, `target_file_sha_before = current_sha`
5. Обновить `task.status = published`

**Response 200** (успешная публикация):
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440002",
  "status": "published",
  "commit_sha": "def456abc789",
  "target_repo": "bitrix24/b24restdocs",
  "target_path": "api-reference/crm/deals/crm-deal-get.md"
}
```

**Response 400:**
```json
{ "detail": "Task must be in 'done' status to publish" }
```

**Response 409** (конфликт — EN-файл изменился вручную):
```json
{
  "detail": "Conflict: target file was modified since this task was created",
  "conflict": {
    "base": "# Метод crm.deal.get\n... (оригинал RU)",
    "ours": "# Method crm.deal.get\n... (наш перевод)",
    "theirs": "# Method crm.deal.get\n... (текущий EN с ручными правками)"
  }
}
```

Фронтенд показывает 3-way diff. Пользователь разрешает конфликт вручную → `PATCH /tasks/{id}` с итоговым содержимым → повторный `POST /tasks/{id}/publish`.

**Response 502** — ошибка GitHub API:
```json
{ "detail": "GitHub API error: 404 Not Found" }
```

---

## Analytics

### GET /analytics

Агрегированная статистика по задачам.

**Query params:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `project_id` | UUID | — | Фильтр по проекту |
| `from` | datetime (ISO 8601) | -30 дней | Начало диапазона |
| `to` | datetime (ISO 8601) | сейчас | Конец диапазона |

**Response 200:**
```json
{
  "total_tasks": 247,
  "success_rate": 0.94,
  "avg_duration_seconds": 142,
  "tasks_by_status": {
    "done": 198,
    "failed": 15,
    "published": 30,
    "queued": 3,
    "running": 1
  },
  "tasks_per_day": [
    { "date": "2026-05-01", "count": 12 },
    { "date": "2026-05-02", "count": 8 }
  ],
  "top_errors": [
    { "error_type": "ValidationError", "count": 9 },
    { "error_type": "TranslationTimeout", "count": 6 }
  ]
}
```

---

## History

### GET /history

Лента публикаций — кто, что и в какой репозиторий опубликовал. Показывает все публикации пользователей, у которых есть доступ к тем же проектам.

**Query params:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `project_id` | UUID | — | Фильтр по проекту |
| `published_by` | UUID | — | Фильтр по пользователю |
| `from` | datetime (ISO 8601) | — | Начало диапазона |
| `to` | datetime (ISO 8601) | — | Конец диапазона |
| `limit` | int | 50 | Максимум записей |
| `offset` | int | 0 | Смещение |

**Response 200:**
```json
{
  "items": [
    {
      "id": "...",
      "task_id": "...",
      "file_path": "api-reference/crm/deals/crm-deal-get.md",
      "source_repo": "bitrix-tools/b24-rest-docs",
      "target_repo": "bitrix24/b24restdocs",
      "target_path": "api-reference/crm/deals/crm-deal-get.md",
      "commit_sha": "def456abc789",
      "commit_url": "https://github.com/bitrix24/b24restdocs/commit/def456abc789",
      "published_by": {
        "id": "...",
        "display_name": "Anna Kuznetsova",
        "github_login": "gs-bitrix-doc"
      },
      "published_at": "2026-05-05T10:02:30Z"
    }
  ],
  "total": 211,
  "limit": 50,
  "offset": 0
}
```

---

## Dictionaries

Просмотр словарей пайплайна в read-only режиме для MVP.

> Реальное редактирование словарей отложено до post-MVP, потому что целевая модель должна быть per-user.  
> В текущем MVP `POST`, `PATCH` и `DELETE` существуют как заглушки и возвращают `501 Not Implemented`.

Поддерживаемые типы (`dict_type`):

| Значение | Файл в pipeline/data/ | Описание |
|----------|----------------------|----------|
| `dictionary` | `dictionary.json` | Основной RU→EN словарь |
| `glossary` | `glossary.json` | Расширенный глоссарий (валидатор) |
| `static_terms` | `pre_translator/static_terms.json` | Статичные термины |
| `section_headings` | `pre_translator/section_headings.json` | Заголовки разделов |
| `note_titles` | `pre_translator/note_titles.json` | Заголовки примечаний |
| `include_labels` | `pre_translator/include_labels.json` | Метки включений |
| `prompt` | `prompt.txt` | Системный промпт LLM (key всегда `"main"`) |

---

### GET /dictionaries/{dict_type}

Получить merged-снимок словаря: базовые записи из `pipeline/data/` + текущие записи из БД.

**Response 200:**
```json
{
  "dict_type": "dictionary",
  "entries": [
    {
      "key": "сделка",
      "value": "deal",
      "source": "base",
      "entry_id": null
    },
    {
      "key": "контрагент",
      "value": "counterparty",
      "source": "user",
      "entry_id": "550e8400-...",
      "updated_by": "Anna Kuznetsova",
      "updated_at": "2026-05-05T09:00:00Z"
    }
  ]
}
```

`source`: `"base"` — из файла submodule, `"user"` — пользовательская запись в БД.

Для `prompt` response содержит один entry с `key="main"`.

---

### POST /dictionaries/{dict_type}

В MVP редактирование словарей не реализовано.

**Response 501:**
```json
{ "detail": "Per-user dictionary editing is deferred until post-MVP" }
```

---

### PATCH /dictionaries/{dict_type}/{entry_id}

В MVP редактирование словарей не реализовано.

**Response 501:**
```json
{ "detail": "Per-user dictionary editing is deferred until post-MVP" }
```

---

### DELETE /dictionaries/{dict_type}/{entry_id}

В MVP редактирование словарей не реализовано.

**Response 501:**
```json
{ "detail": "Per-user dictionary editing is deferred until post-MVP" }
```

---

## Notification Channels

Каналы уведомлений не привязаны к конкретной команде. Можно создать несколько каналов с разными методами доставки, адресатами и наборами событий.

**Поддерживаемые события (`events`):**

| Событие | Когда |
|---------|-------|
| `failure` | Задача упала (`status=failed`) |
| `conflict` | Конфликт при публикации (`409`) |
| `done` | Задача готова к проверке (`status=done`) |
| `published` | Перевод успешно опубликован |

---

### GET /notifications/channels

Список всех каналов уведомлений.

**Response 200:**
```json
[
  {
    "id": "...",
    "name": "Ошибки в чат разработки",
    "method": "incoming_webhook",
    "destination_label": "incoming webhook",
    "events": ["failure", "conflict"],
    "is_active": true,
    "created_at": "2026-05-05T10:00:00Z"
  },
  {
    "id": "...",
    "name": "Готово к проверке → Анна",
    "method": "rest_api",
    "destination_label": "user · 42",
    "events": ["done"],
    "is_active": true,
    "created_at": "2026-05-05T11:00:00Z"
  }
]
```

> `destination_label` — читаемое описание адресата, `webhook_url` и `bitrix_token` в списке не возвращаются.

---

### POST /notifications/channels

Создать канал уведомлений.

**Вариант A — Incoming Webhook (проще):**
```json
{
  "name": "Ошибки в чат разработки",
  "method": "incoming_webhook",
  "webhook_url": "https://your-domain.bitrix24.ru/rest/1/abc123/imbot.message.add/",
  "events": ["failure", "conflict"]
}
```

> Получить URL: Bitrix24 → Marketplace → Входящие вебхуки → Создать. Адресат задаётся в Bitrix24 при создании вебхука.

**Вариант B — REST API (гибче):**
```json
{
  "name": "Готово к проверке → Анна",
  "method": "rest_api",
  "bitrix_token": "abc123...",
  "destination_type": "user",
  "destination_id": "42",
  "events": ["done"]
}
```

| `destination_type` | `destination_id` | Куда отправляет |
|--------------------|-----------------|-----------------|
| `user` | ID пользователя в Bitrix24 | Личное сообщение |
| `chat` | ID чата | Групповой чат |
| `channel` | ID канала | Открытый канал |

**Response 201:**
```json
{
  "id": "550e8400-...",
  "name": "Ошибки в чат разработки",
  "method": "incoming_webhook",
  "events": ["failure", "conflict"],
  "is_active": true
}
```

---

### PATCH /notifications/channels/{id}

Обновить канал: включить/выключить, изменить события, адресат.

**Request body** (все поля опциональны):
```json
{
  "name": "Ошибки (обновлено)",
  "events": ["failure", "conflict", "done"],
  "is_active": false
}
```

**Response 200** — обновлённый канал.

---

### DELETE /notifications/channels/{id}

Удалить канал.

**Response 204**

---

### POST /notifications/channels/{id}/test

Отправить тестовое сообщение для проверки настроек.

**Response 200:**
```json
{ "ok": true, "message": "Тестовое сообщение отправлено" }
```

**Response 502** — ошибка Bitrix24 API:
```json
{ "detail": "Bitrix24 error: webhook_url is invalid" }
```

---

## Коды ответов

| Код | Когда |
|-----|-------|
| 200 | Успешный запрос с данными |
| 201 | Ресурс создан |
| 202 | Принято в обработку (webhook, retry) |
| 204 | Успешно, без тела |
| 302 | Редирект (OAuth) |
| 400 | Некорректный запрос / бизнес-ошибка |
| 401 | Не авторизован |
| 403 | Неверная подпись webhook |
| 404 | Ресурс не найден |
| 409 | Конфликт при публикации |
| 502 | Ошибка внешнего сервиса (GitHub API) |
| 500 | Внутренняя ошибка сервера |

---

## Pydantic-схемы (ориентир)

```python
class UserRegister(BaseModel):
    email: str
    password: str
    display_name: str | None = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserRead(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    github_linked: bool
    github_login: str | None

class ProjectCreate(BaseModel):
    name: str
    source_repo: str
    source_branch: str = "main"
    target_repo: str
    target_branch: str = "main"
    exclude_patterns: list[str] = []

class ProjectRead(BaseModel):
    id: UUID
    name: str
    source_repo: str
    source_branch: str
    target_repo: str
    target_branch: str
    webhook_url: str
    created_at: datetime

class TaskSummary(BaseModel):
    id: UUID
    project_id: UUID
    file_path: str
    status: str
    created_at: datetime
    updated_at: datetime

class TaskDetail(TaskSummary):
    github_ref: str
    github_sha: str | None
    source_file_sha: str | None
    target_file_sha: str | None
    original_content: str
    translated_content: str | None
    error: str | None
    publications: list[PublicationRead]

class TaskUpdate(BaseModel):
    translated_content: str

class TaskListResponse(BaseModel):
    items: list[TaskSummary]
    total: int
    limit: int
    offset: int

class PublicationRead(BaseModel):
    id: UUID
    target_repo: str
    target_path: str
    commit_sha: str
    published_at: datetime

class ConflictDetail(BaseModel):
    base: str
    ours: str
    theirs: str

class WebhookResponse(BaseModel):
    created: int
    task_ids: list[UUID]

class PublicationRead(BaseModel):
    id: UUID
    task_id: UUID
    file_path: str
    source_repo: str
    target_repo: str
    target_path: str
    commit_sha: str
    commit_url: str
    published_by: UserRead
    published_at: datetime

class HistoryResponse(BaseModel):
    items: list[PublicationRead]
    total: int
    limit: int
    offset: int

class DictionaryEntryRead(BaseModel):
    key: str
    value: str
    source: Literal["base", "user"]
    entry_id: UUID | None
    updated_by: str | None
    updated_at: datetime | None

class DictionaryResponse(BaseModel):
    dict_type: str
    entries: list[DictionaryEntryRead]

class DictionaryEntryCreate(BaseModel):
    key: str
    value: str

class DictionaryEntryUpdate(BaseModel):
    value: str

class NotificationChannelCreate(BaseModel):
    name: str
    method: Literal["incoming_webhook", "rest_api"]
    webhook_url: str | None = None        # для incoming_webhook
    bitrix_token: str | None = None       # для rest_api
    destination_type: Literal["user", "chat", "channel"] | None = None
    destination_id: str | None = None
    events: list[Literal["failure", "conflict", "done", "published"]]

class NotificationChannelRead(BaseModel):
    id: UUID
    name: str
    method: str
    destination_label: str
    events: list[str]
    is_active: bool
    created_at: datetime

class NotificationChannelUpdate(BaseModel):
    name: str | None = None
    events: list[str] | None = None
    is_active: bool | None = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ManualTaskFromRepo(BaseModel):
    project_id: UUID
    file_paths: list[str]

class RetryRequest(BaseModel):
    force: bool = False

class SkippedFile(BaseModel):
    file_path: str
    reason: Literal["already_queued", "pipeline_running", "excluded_by_pattern"]
    existing_task_id: UUID | None

class TaskCreateResponse(BaseModel):
    created: int
    task_ids: list[UUID]
    skipped: list[SkippedFile] = []

class AnalyticsResponse(BaseModel):
    total_tasks: int
    success_rate: float
    avg_duration_seconds: float
    tasks_by_status: dict[str, int]
    tasks_per_day: list[dict]
    top_errors: list[dict]
```
