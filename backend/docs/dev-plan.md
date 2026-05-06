# DocFlow Web Backend — План разработки

Разработка ведётся итерационно: каждый этап даёт рабочий вертикальный срез. Следующий этап начинается только после того, как текущий работает end-to-end.

---

## Этап 1 — Модели и миграции

Создать SQLAlchemy-модели и Alembic-миграции для всех таблиц.

**Файлы:**
- `app/models/user.py` — `User`
- `app/models/project.py` — `Project`
- `app/models/task.py` — `Task`
- `app/models/publication.py` — `Publication`
- `app/models/dictionary_entry.py` — `DictionaryEntry`
- `app/models/notification_channel.py` — `NotificationChannel`
- `app/models/__init__.py` — реэкспорт всех моделей
- `migrations/versions/001_users.py`
- `migrations/versions/002_projects.py`
- `migrations/versions/003_tasks.py`
- `migrations/versions/004_publications.py`
- `migrations/versions/005_dictionary_entries.py`
- `migrations/versions/006_notification_channels.py`

**Детали:**
- Все `id` — UUID, `default=uuid.uuid4`
- `tasks.status` — CHECK constraint: `queued | running | done | failed | published`
- `projects.exclude_patterns` — `ARRAY(Text)`, default `[]`
- `dictionary_entries` — уникальный индекс `(dict_type, key)`
- Каждая модель импортируется в `app/db/base.py`, чтобы Alembic видел метаданные

**Проверка:** `alembic upgrade head` проходит без ошибок, `alembic check` показывает "No new upgrade operations detected".

---

## Этап 2 — Pydantic-схемы

Создать схемы запросов и ответов. Схемы — контракт API, их форма берётся из `docs/api.md`.

**Файлы:**
- `app/schemas/user.py` — `UserRegister`, `UserLogin`, `UserRead`, `ChangePasswordRequest`
- `app/schemas/project.py` — `ProjectCreate`, `ProjectRead`, `ProjectUpdate`
- `app/schemas/task.py` — `TaskSummary`, `TaskDetail`, `TaskUpdate`, `TaskListResponse`, `TaskCreateResponse`, `SkippedFile`, `RetryRequest`, `ManualTaskFromRepo`, `ConflictDetail`
- `app/schemas/publication.py` — `PublicationRead`, `HistoryResponse`
- `app/schemas/dictionary.py` — `DictionaryEntryRead`, `DictionaryEntryCreate`, `DictionaryEntryUpdate`, `DictionaryResponse`
- `app/schemas/notification.py` — `NotificationChannelCreate`, `NotificationChannelRead`, `NotificationChannelUpdate`
- `app/schemas/analytics.py` — `AnalyticsResponse`
- `app/schemas/__init__.py`

**Детали:**
- Все схемы используют `model_config = ConfigDict(from_attributes=True)` для совместимости с ORM
- UUID-поля — `uuid.UUID`, даты — `datetime`
- `TaskDetail` наследует `TaskSummary` и добавляет content-поля

---

## Этап 3 — Auth

Регистрация, вход, выход, смена пароля. Без GitHub OAuth на этом этапе.

**Файлы:**
- `app/services/auth.py` — `hash_password`, `verify_password`, `create_jwt`, `decode_jwt`, `get_current_user` (dependency)
- `app/api/routes/auth.py` — роутеры
- Подключить в `app/api/router.py`

**Эндпоинты:**
- `POST /auth/register`
- `POST /auth/login` — устанавливает `session` cookie (httponly, samesite=lax)
- `POST /auth/logout` — удаляет cookie
- `GET /auth/me`
- `POST /auth/change-password`

**Детали JWT:**
- Алгоритм HS256, payload: `{"sub": str(user.id), "exp": ...}`
- Срок жизни: 30 дней
- Cookie: `httponly=True`, `samesite="lax"`, `secure=False` в dev / `True` в prod

**Безопасность:**
- `UserRead` схема никогда не содержит `password_hash` — проверить что поле отсутствует в response
- Rate limiting на `POST /auth/login` и `POST /auth/register`: максимум 10 запросов/минуту с одного IP. Использовать `slowapi` (обёртка над `limits` для FastAPI). Добавить в `pyproject.toml`
- При неверном пароле всегда возвращать одинаковое время ответа — bcrypt это обеспечивает автоматически (не добавлять досрочный return)
- Логаут удаляет cookie через `response.delete_cookie("session")`

**Проверка:** регистрация → логин → `GET /auth/me` возвращает пользователя → логаут → `GET /auth/me` возвращает 401.

**Тесты (TDD — писать до реализации):**

Unit (`tests/services/test_auth_service.py`):
- `test_hash_password_not_plaintext` — хэш не равен паролю
- `test_verify_password_correct` — правильный пароль проходит
- `test_verify_password_wrong` — неправильный пароль отклоняется
- `test_create_and_decode_jwt` — раундтрип без потерь
- `test_decode_expired_jwt` — `freezegun` сдвигает время на 31 день, ожидаем ошибку

Integration (`tests/test_auth.py`):
- `test_register_success` — 201, `session` cookie в ответе
- `test_register_duplicate_email` — 400
- `test_login_success` — 200, cookie установлен
- `test_login_wrong_password` — 401
- `test_me_authenticated` — 200, email в теле
- `test_me_unauthenticated` — 401
- `test_logout_clears_cookie` — 200, cookie удалён
- `test_rate_limit_login` — 11-й запрос подряд → 429

---

## Этап 4 — GitHub OAuth

Привязка GitHub-аккаунта к пользователю.

**Файлы:**
- Дополнить `app/services/auth.py` — `get_github_oauth_url`, `exchange_code_for_token`, `get_github_user`
- Дополнить `app/api/routes/auth.py`

**Эндпоинты:**
- `GET /auth/github/connect` — редирект на GitHub OAuth с `state` (CSRF)
- `GET /auth/github/callback` — обмен code → token, сохранение `github_id / login / access_token` в users
- `DELETE /auth/github/connect` — отвязка (обнуляет GitHub-поля)

**Детали:**
- `state` генерируется через `secrets.token_urlsafe(16)`, хранится в cookie на время OAuth-флоу
- При callback проверить `state` из cookie
- Если `github_id` уже привязан к другому пользователю — 409
- После callback редиректить на `http://localhost:3000/settings`

**Безопасность:**
- `github_access_token` хранить в БД **зашифрованным**, не plaintext. Шифрование симметричное: AES-256-GCM через библиотеку `cryptography` (`Fernet`), ключ — `SESSION_SECRET`. Расшифровывать только в момент обращения к GitHub API
- `state`-cookie ставить с `httponly=True`, `max_age=300` (5 минут), удалять после проверки
- Scope OAuth App: запрашивать минимально необходимый — `repo` (нужен для чтения/записи файлов)

**Тесты (TDD — `pytest-mock` мокает httpx):**

`tests/test_github_oauth.py`:
- `test_connect_redirects_to_github` — 302, URL содержит `client_id` и `state`
- `test_callback_saves_token` — мокаем GitHub API, проверяем что `github_access_token` сохранён (зашифрован)
- `test_callback_wrong_state` — 400/403
- `test_callback_account_already_linked` — 409
- `test_disconnect_clears_fields` — 200, `github_linked=false` в `/auth/me`

---

## Этап 5 — Projects (Репозитории)

CRUD для проектов.

**Файлы:**
- `app/api/routes/projects.py`
- Подключить в `app/api/router.py`

**Эндпоинты:**
- `GET /projects`
- `POST /projects` — генерирует `webhook_secret = secrets.token_hex(32)`
- `GET /projects/{id}`
- `PATCH /projects/{id}`
- `DELETE /projects/{id}`

**Детали:**
- Все операции только с проектами текущего пользователя (`project.user_id == current_user.id`)
- `webhook_url` формируется как `{settings.base_url}/webhook/{project.id}` (или захардкодить паттерн)
- `webhook_secret` возвращается только в `POST /projects` (при создании)
- Для `DELETE`: каскад не удаляет задачи (ON DELETE SET NULL или просто оставить project_id)

**Безопасность:**
- Resource ownership — вспомогательная функция `get_project_or_404(project_id, current_user)`: получает проект, проверяет `user_id`, иначе 404 (не 403 — не раскрывать что объект существует). Использовать во всех роутерах где нужна проверка владельца
- `webhook_secret` не включать в `ProjectRead` и `GET /projects` / `GET /projects/{id}` — только в ответ на `POST /projects`

**Тесты (`tests/test_projects.py`):**
- `test_create_project` — 201, `webhook_secret` в ответе, URL содержит project id
- `test_get_projects_own_only` — два пользователя, каждый видит только свои проекты
- `test_get_project_not_found` — чужой project_id → 404 (не 403)
- `test_webhook_secret_not_in_get` — GET /projects/{id} не содержит `webhook_secret`
- `test_delete_project` — 204, повторный GET → 404

---

## Этап 6 — GitHub API клиент

Обёртка над GitHub REST API v3. Используется в webhook, manual tasks и publish.

**Файлы:**
- `app/services/github.py` — класс `GitHubClient`

**Методы:**
- `get_file_content(repo, path, ref) → (content: str, sha: str)` — скачать файл и его blob SHA
- `get_file_sha(repo, path, ref) → str | None` — только SHA (для проверки конфликтов)
- `get_repo_tree(repo, ref, path) → list[str]` — список `.md`-файлов (для file browser)
- `create_or_update_file(repo, path, message, content, sha | None, branch) → commit_sha` — публикация
- `get_user_repos() → list[str]` — список репозиториев для выбора при создании проекта

**Детали:**
- `httpx.AsyncClient` с `Authorization: token {access_token}` header
- `base_url = "https://api.github.com"`
- Обернуть HTTP ошибки в кастомный `GitHubAPIError(status_code, detail)`
- Контент файлов приходит base64-encoded — декодировать

**Безопасность:**
- Всегда использовать `base_url = "https://api.github.com"` — не принимать URL от пользователя (защита от SSRF)
- Не логировать `access_token` — в логах может появиться в traceback при ошибке. Перехватывать исключения до логирования и вырезать заголовок `Authorization`
- `get_user_repos()` — возвращать только репозитории текущего пользователя, не принимать произвольный `owner` от клиента

**Тесты (TDD — `pytest-mock` мокает httpx, `respx` или `mocker.patch`):**

`tests/services/test_github_client.py`:
- `test_get_file_content_decodes_base64` — мокаем ответ GitHub, проверяем декодирование
- `test_get_file_sha_returns_none_if_404` — 404 от GitHub → None (файл не существует)
- `test_create_or_update_file_sends_correct_payload` — проверяем тело запроса
- `test_github_api_error_raised_on_500` — GitHub вернул 500 → `GitHubAPIError`

---

## Этап 7 — Webhook

Приём push-события от GitHub, создание задач.

**Файлы:**
- `app/api/routes/webhook.py`
- Подключить в `app/api/router.py`

**Эндпоинт:** `POST /webhook/{project_id}`

**Детали:**
- Верификация HMAC: `hmac.compare_digest(expected, received)` по телу запроса и `project.webhook_secret`
- Фильтр: только `X-GitHub-Event: push` и только коммиты в `project.source_branch`
- Собрать все `.md` из `commits[*].added` + `commits[*].modified`, дедуплицировать
- Применить `exclude_patterns` (использовать `pathspec` или ручной fnmatch)
- Дедупликация: если файл уже в `queued` или `running` задаче — добавить в `skipped`
- Для каждого нового файла: скачать через `GitHubClient`, создать `Task(status="queued")`
- Запустить `pipeline_runner.run_task(task_id)` как FastAPI `BackgroundTask`
- Ответ 202 с `{created, task_ids, skipped}`

**Безопасность:**
- HMAC считать от **сырого тела запроса** (bytes) до парсинга JSON — получить через `Request.body()`
- При неверной подписи всегда возвращать 403, не раскрывать детали (`"Invalid webhook signature"`)
- `project_id` в URL — UUID, но проверять что проект существует до верификации HMAC нельзя (timing oracle). Порядок: сначала найти проект, получить secret, затем проверить HMAC

**Тесты (TDD — мокаем `GitHubClient` и `pipeline_runner`):**

`tests/services/test_webhook_security.py` (unit, без БД):
- `test_hmac_valid` — правильная подпись проходит
- `test_hmac_invalid` — неправильная подпись отклоняется
- `test_hmac_timing_safe` — разные длины подписей не дают утечки по времени

`tests/test_webhook.py` (integration):
- `test_webhook_creates_tasks` — валидный push → 202, задачи созданы в БД
- `test_webhook_invalid_signature` — 403
- `test_webhook_wrong_branch` — push в не-source ветку → 400
- `test_webhook_non_md_files` — нет .md файлов → 400
- `test_webhook_deduplication_queued` — файл уже в `queued` → в `skipped`
- `test_webhook_exclude_patterns` — файл совпадает с паттерном → пропущен
- `test_webhook_multiple_files` — 3 файла → 3 задачи

---

## Этап 8 — Pipeline Runner

Запуск пайплайна в фоне, запись лога, SSE.

**Файлы:**
- `app/services/pipeline_runner.py`
- `app/services/dictionary_merger.py`
- `app/api/routes/tasks.py` (SSE эндпоинт)

**Детали pipeline_runner:**
- Обновить `task.status = "running"`, `task.updated_at`
- Вызвать `dictionary_merger.merge()` — загрузить базовые словари из `pipeline/data/`, смёржить с `dictionary_entries` из БД
- Записать `task.original_content` во временный файл (`tempfile.NamedTemporaryFile`)
- Вызвать `pipeline.run(input_path, output_path, **merged_dicts)` — импорт из `pipeline/src/`
- Перехватить stdout/stderr → записывать построчно в очередь для SSE
- При успехе: прочитать output файл → `task.translated_content`, `task.status = "done"`, `task.log = лог`
- При исключении: `task.status = "failed"`, `task.error = traceback.format_exc()`
- Очистить временные файлы

**SSE (`GET /tasks/{id}/events`):**
- `StreamingResponse` с `media_type="text/event-stream"`
- Связь runner ↔ SSE через глобальный `dict[UUID, asyncio.Queue]` в `pipeline_runner.py`:
  - при старте runner создаёт `Queue` и кладёт в словарь по `task_id`
  - SSE-эндпоинт достаёт очередь из словаря и читает из неё
  - runner кладёт в очередь события `{"event": "log_line", "data": {...}}` построчно
  - по завершении кладёт `{"event": "status_change", "data": {"status": "done"}}` и `None` как sentinel
  - SSE читает до `None`, затем закрывает поток и удаляет очередь из словаря
- Формат каждого события: `event: log_line\ndata: {"line": "..."}\n\n`
- Если клиент подключился когда задача уже завершена (нет очереди) — сразу отправить `status_change` с текущим статусом

---

## Этап 9 — Tasks CRUD и ручной запуск

**Файлы:**
- Дополнить `app/api/routes/tasks.py`

**Эндпоинты:**
- `GET /tasks` — список с фильтрами `project_id`, `status`, пагинация
- `GET /tasks/{id}` — полные данные включая `original_content`, `translated_content`, `publications`
- `GET /tasks/{id}/log` — сырой лог (text/plain)
- `PATCH /tasks/{id}` — обновить `translated_content` (только `done` / `failed`)
- `POST /tasks/manual` — ручной запуск (вариант A: файл из репо, вариант B: upload)
  - `github_ref` для ручных задач: хранить строку `"manual"` (поле NOT NULL, реального ref нет)
  - `github_sha = null`, `source_file_sha = null` для загружаемых файлов
- `POST /tasks/{id}/retry` — повторный запуск; если SHA source изменился — 409, иначе сброс и старт

**Безопасность:**
- Все операции с задачами — проверять что `task.project.user_id == current_user.id` (через `get_project_or_404`)
- Upload файла: ограничение `Content-Length` максимум **1 MB** (`if len(content) > 1_048_576: raise 413`)
- Upload файла: проверять расширение — принимать только `.md` (`if not filename.endswith(".md"): raise 400`)
- `original_content` и `translated_content` не фильтруются — это доверенный контент из GitHub/пайплайна, но не рендерить как HTML на бэке

**Тесты (`tests/test_tasks.py`):**
- `test_get_tasks_own_only` — пользователь видит только задачи своих проектов
- `test_get_task_not_found` — чужая задача → 404
- `test_patch_task_updates_content` — 200, `translated_content` обновлён
- `test_patch_task_running_rejected` — статус `running` → 400
- `test_upload_non_md_rejected` — файл `.txt` → 400
- `test_upload_too_large_rejected` — файл > 1MB → 413
- `test_manual_task_from_repo` — мокаем GitHub, задача создана

---

## Этап 10 — Публикация

**Файлы:**
- Дополнить `app/api/routes/tasks.py`

**Эндпоинт:** `POST /tasks/{id}/publish`

**Алгоритм:**
1. Проверить `task.status == "done"`
2. `current_sha = await github.get_file_sha(target_repo, task.file_path, target_branch)`
3. Если `current_sha != task.target_file_sha` (и не оба null) → 409 с `{base, ours, theirs}`
4. `commit_sha = await github.create_or_update_file(...)` передать `current_sha` для атомарности
5. Создать `Publication` в БД
6. `task.status = "published"`
7. Отправить уведомление через `bitrix_notify`

**Тесты (`tests/test_publish.py`, мокаем `GitHubClient`):**
- `test_publish_success` — 200, `Publication` создана в БД, `task.status = published`
- `test_publish_not_done_status` — статус не `done` → 400
- `test_publish_conflict_detected` — SHA изменился → 409 с `{base, ours, theirs}`
- `test_publish_new_file` — файла нет в target → публикуется без SHA
- `test_publish_other_user_task` — 404

---

## Этап 11 — History и Analytics

**Файлы:**
- `app/api/routes/history.py` — `GET /history`
- `app/api/routes/analytics.py` — `GET /analytics`

**Модель доступа к History:**

Пользователь видит публикации по всем проектам, у которых совпадает `source_repo` с его собственными проектами. Это позволяет команде, работающей над одним репозиторием, видеть общую историю — без явного шаринга проектов и без дополнительных таблиц.

```
Видимые публикации = publications
  JOIN tasks ON tasks.id = publications.task_id
  JOIN projects ON projects.id = tasks.project_id
  WHERE projects.source_repo IN (
    SELECT source_repo FROM projects WHERE user_id = current_user.id
  )
```

Фильтр `project_id` в query params работает по той же логике — только если этот `project_id` относится к одному из видимых репозиториев.

**Детали:**
- History: JOIN `publications → tasks → projects`, фильтры по `project_id`, `published_by`, диапазону дат; сортировка по `published_at DESC`
- Analytics: агрегирующие SQL-запросы через SQLAlchemy — `count()`, `avg()`, `group by date`; видимость по той же логике `source_repo IN (...)`

**Тесты (`tests/test_history.py`):**
- `test_history_shared_by_source_repo` — два пользователя с одним `source_repo` видят общую историю
- `test_history_isolated_by_source_repo` — разные `source_repo` → разные истории
- `test_history_filter_by_project` — фильтр по `project_id` работает
- `test_analytics_success_rate` — правильно считает процент успешных задач

---

## Этап 12 — Словари

**Файлы:**
- `app/api/routes/dictionaries.py`
- `app/services/dictionary_merger.py` (уже создан в этапе 8)

**Эндпоинты:**
- `GET /dictionaries/{dict_type}` — мёрж базовых файлов + БД записей
- `POST /dictionaries/{dict_type}`
- `PATCH /dictionaries/{dict_type}/{entry_id}`
- `DELETE /dictionaries/{dict_type}/{entry_id}` — soft delete (`is_deleted=True`) для базовых

**Поддерживаемые типы:** `dictionary`, `glossary`, `static_terms`, `section_headings`, `note_titles`, `include_labels`, `prompt`

---

## Этап 13 — Уведомления Bitrix24

**Файлы:**
- `app/services/bitrix_notify.py`
- `app/api/routes/notifications.py`

**Сервис `bitrix_notify.py`:**
- `async def notify(event: str, payload: dict)` — загружает активные каналы с нужным event, итерирует
- Для `incoming_webhook`: `POST {webhook_url}` с JSON телом
- Для `rest_api`: `POST {bitrix_url}/im.message.add` с токеном, `DIALOG_ID` из `destination_type + destination_id`

**Эндпоинты:**
- `GET /notifications/channels`
- `POST /notifications/channels`
- `PATCH /notifications/channels/{id}`
- `DELETE /notifications/channels/{id}`
- `POST /notifications/channels/{id}/test` — отправить тестовое сообщение

---

## Этап 14 — Финальная сборка

- Подключить все роутеры в `app/api/router.py` с правильными prefix и tags
- Глобальный exception handler для `GitHubAPIError` → 502
- Проверить все 401/403/404 кейсы
- Пройтись по `docs/api.md` и убедиться, что все коды ответов совпадают
- Smoke-тест: запустить `docker compose up`, пройти полный флоу через Swagger UI

**Безопасность — финальный чеклист:**
- CORS: `allow_origins=["http://localhost:3000"]` в dev, `["https://your-domain.com"]` в prod — никогда не `["*"]` (иначе любой сайт может делать запросы от имени пользователя через cookie)
- Убедиться что в Swagger UI (`/docs`) не торчат секретные поля (`password_hash`, `github_access_token`, `webhook_secret`)
- Все роутеры кроме `/health`, `/auth/register`, `/auth/login`, `/auth/github/callback`, `POST /webhook/{id}` — требуют валидный JWT (`Depends(get_current_user)`)
- Заголовки безопасности через middleware: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- `slowapi` rate limiter подключён глобально в `main.py`
- Добавить `cryptography` в `pyproject.toml` для шифрования GitHub токенов

---

## Порядок этапов

```
1 Модели + миграции
2 Схемы
3 Auth (email/password)
4 GitHub OAuth
5 Projects CRUD
6 GitHub API клиент
7 Webhook
8 Pipeline Runner + SSE
9 Tasks CRUD + ручной запуск
10 Публикация
11 History + Analytics
12 Словари
13 Уведомления Bitrix24
14 Финальная сборка
```

Этапы 1–5 не зависят от внешних сервисов и могут быть проверены локально без реального GitHub и пайплайна.
Этапы 6–10 требуют настроенного GitHub OAuth App и подключённого pipeline submodule.