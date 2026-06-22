# План решения проблем доступа к GitHub-репозиториям

## Контекст и корень проблемы

DocFlow интегрирован с GitHub как **OAuth App** с широким scope `repo`:

- `backend/app/services/auth.py` → `GITHUB_OAUTH_SCOPE = "repo"`, авторизация через
  `https://github.com/login/oauth/authorize` по `client_id`/`client_secret`.
- Доступ к репам идёт под **пользовательским** OAuth-токеном
  (`User.github_access_token`, зашифрован).
- Листинг: `GitHubClient.get_user_repos()` → `GET /user/repos`, без фильтра по орг
  (`backend/app/services/github.py:326`, отдаётся в `backend/app/api/routes/me.py:35`).

Все три симптома — следствия именно этой архитектуры.

| # | Симптом | Причина |
|---|---------|---------|
| 1 | Просит доступ ко **всем** репам орг; админ видит только запрос на одобрение, без прав по конкретной репе | OAuth App + scope `repo` — доступ «всё-или-ничего». Гранулярности «одна репа» у OAuth App нет в принципе. Доступ к орг-ресурсам гейтит org third-party application access policy → одобрение приложения целиком |
| 2 | Доступ к орг выдали, но видны ненужные репы, а нужного `en`-репо нет | `repo` тянет все репы, к которым у пользователя есть доступ. `en`-репо не появляется, т.к. у самого аккаунта пока нет к нему доступа (ждём выдачу) |
| 3 | Видны репы орг, но не личные | `/user/repos` по умолчанию должен включать `owner`; раз личные пропадают — вопрос affiliation/видимости токена, не нашего фильтра |

---

## Решение

Два трека: **(A) стратегический** — миграция OAuth App → **GitHub App** (закрывает #1 и #2
по-настоящему и делает #3 неактуальным); **(B) немедленный разблок** — действия на стороне
GitHub без кода. Трек B можно сделать уже сегодня, трек A — основной фикс.

---

## Статус реализации (на 2026-06-22)

**Код трека A полностью реализован, dual-mode, 284 backend-теста зелёные, ruff/tsc/eslint чисты.**
Всё в рабочем дереве — **не закоммичено и не задеплоено** (деплой — в последнюю очередь).

| Раздел | Статус |
|---|---|
| A0 Регистрация GitHub App | ✅ App создан: **App ID `4114772`**, slug **`docflow-bitrix24`**, webhook secret настроен, приватный ключ в локальном `.env` |
| A1 Конфиг + `.env`/`.env.example` | ✅ |
| A2 Модель + миграция | ✅ (+ `created_by_user_id`/`team_id` для скоупинга видимости; `target_type` не делали — избыточен) |
| A3 Сервис `github_app` (JWT, токены, sync) | ✅ |
| A4 `GitHubClient.list_installation_repos` | ✅ (`get_user_repos` оставлен как OAuth-fallback) |
| A5 Роуты install/setup + `me.py` | ✅ (install — JSON-эндпоинт с подписанным `state`; setup биндит установку к юзеру/команде) |
| A5-UI Фронтенд | ✅ Кнопка «Установить / настроить доступ» в `Settings → GitHub`, обработка `?github_app_installed`/`?github_error` |
| A6 App-вебхук | ✅ (`/webhook/github/app`: подпись, installation/installation_repositories/push) |
| A7 Потребители токена | ✅ (вебхук, pipeline_runner, publish/manual/retry/batch, commit_groups, projects — per-repo) |
| A8 Тесты | ✅ (JWT, кэш токена, листинг, скоупинг, переезд репы, no-wipe при сбое) |
| **A9.1 Миграция на проде** (`alembic upgrade head`) | ❌ деплой |
| **A9.3 Установка App на репы** (`ru`/`en`) | ❌ требует деплоя кода на прод + внешнего действия |
| **A9.4 Выпил OAuth-ветки** | ❌ финал, после полного перехода |
| **Трек B** (en-репо доступ, org approval, чистка старого запроса) | ❌ внешнее, отложено |

**Осталось (всё — деплой/внешнее):** доставить код трека A на прод (`/opt/docflow`),
прописать `GITHUB_APP_*` в `/opt/docflow/.env`, применить миграцию, пересоздать backend,
затем установить App на `ru`/`en` репозитории и получить org approval. Детали — в A9 и треке B.

---

## Трек A — Миграция на GitHub App (фикс #1, #2; #3 становится неактуальным)

GitHub App ставится на **выбранные репозитории** с **точечными правами**. Админ орг
сам отмечает, какие репы и какие разрешения выдать. Доступ к репам идёт не под
пользовательским токеном, а под **installation-токеном** (TTL ~1 час, минтится из JWT,
подписанного приватным ключом App).

### A0. Регистрация GitHub App (на стороне GitHub, без кода)

1. Settings организации (или личный аккаунт-владелец) → Developer settings → GitHub Apps → New GitHub App.
2. **Permissions (Repository):**
   - `Contents`: **Read and write** (чтение исходников + публикация перевода коммитом).
   - `Metadata`: **Read-only** (обязательно).
   - При необходимости PR-флоу: `Pull requests`: Read and write.
3. **Subscribe to events:** `Push` (вебхук о коммитах), `Installation`, `Installation repositories`.
4. **Webhook:** URL = `${APP_BASE_URL}/webhook/github/app`, задать **Webhook secret**.
5. **Callback URL** (для user identity, если оставляем GitHub-логин): `${FRONTEND_BASE_URL}/auth/github/callback`.
6. Сгенерировать и скачать **private key (PEM)**, записать **App ID**, **App slug**, **Client ID/Secret**.
7. «Where can this app be installed» — Any account (или Only this org).

### A1. Конфиг и секреты

`backend/app/core/config.py` — добавить:

```python
github_app_id: str | None = Field(default=None, alias="GITHUB_APP_ID")
github_app_private_key: str | None = Field(default=None, alias="GITHUB_APP_PRIVATE_KEY")  # PEM (\n или base64)
github_app_slug: str | None = Field(default=None, alias="GITHUB_APP_SLUG")
github_app_webhook_secret: str | None = Field(default=None, alias="GITHUB_APP_WEBHOOK_SECRET")
```

`.env` / `.env.example` — те же ключи. Приватный ключ хранить как есть в секрете окружения
(на VibeCode — в `/opt/docflow/.env`), в БД не класть.

### A2. Модель данных

Новая таблица `github_installations` (alembic-миграция):

- `id` (PK), `installation_id` (BIGINT, уникально), `account_login`, `account_type`
  (`Organization`/`User`), `target_type`, `suspended_at` (nullable), `created_at`, `updated_at`.
- Кэш выбранных репозиториев: либо отдельная `installation_repositories(installation_id, full_name)`,
  либо обновлять по событию `installation_repositories`.

Связь: проект/пользователь → `installation_id`. На время миграции — поля OAuth у `User`
оставить (dual-mode), не удалять.

### A3. Сервисный слой — installation-токены

`backend/app/services/github_app.py` (новый):

- `generate_app_jwt() -> str` — RS256-JWT, `iss = App ID`, `iat/exp` (≤10 мин), подпись
  приватным ключом. Библиотека уже есть: `python-jose[cryptography]`
  (`jose.jwt.encode(claims, private_key_pem, algorithm="RS256")`) — новых зависимостей не нужно.
- `async get_installation_token(installation_id) -> str` — `POST /app/installations/{id}/access_tokens`
  с `Authorization: Bearer <app_jwt>`; кэшировать токен ~55 мин (in-memory с TTL).
- `async find_installation_for_repo(full_name) -> int | None` — по кэшу/таблице.

### A4. GitHubClient — источник токена

`backend/app/services/github.py`:

- Сейчас `GitHubClient(access_token)` хранит статический токен. Сами REST-вызовы
  (`get_file_content`, `get_repo_tree`, `commit_files_batch`, …) **не меняются** — у GitHub App
  те же эндпоинты `/repos/...`.
- Изменить только источник заголовка `Authorization`: конструктор принимает уже готовый
  installation-токен (минтится вызывающим через `github_app.get_installation_token`).
- `get_user_repos()` заменить на `list_installation_repos()` → `GET /installation/repositories`
  с installation-токеном: возвращает **только выбранные при установке репы**. Это и есть фикс
  #1/#2/#3 — список ровно тех реп, что выдал админ.

### A5. Роуты установки и идентификации

`backend/app/api/routes/auth.py`:

- `GET /auth/github/install` — редирект на `https://github.com/apps/{slug}/installations/new`
  (там админ орг выбирает репы). Опционально передать `state`.
- `GET /auth/github/setup` — callback после установки: GitHub вернёт
  `?installation_id=...&setup_action=install`. Сохранить/обновить запись `github_installations`,
  подтянуть список реп через `/installation/repositories`.
- GitHub-логин (identity) можно оставить на user-OAuth как есть — он нужен только для
  «кто ты», а доступ к репам теперь через installation.

`backend/app/api/routes/me.py:35` — отдавать `list_installation_repos()` вместо `get_user_repos()`.

### A6. Вебхуки

`backend/app/api/routes/webhook.py`:

- Новый обработчик `POST /webhook/github/app`: проверка подписи `X-Hub-Signature-256`
  по `GITHUB_APP_WEBHOOK_SECRET` (HMAC-SHA256).
- События `installation` / `installation_repositories` → синхронизировать таблицу
  (добавили/убрали репы, suspend/unsuspend, удаление установки).
- `push` → как сейчас, но токен для работы с репой минтить через
  `find_installation_for_repo(repo) → get_installation_token(id)`.

### A7. Потребители токена

`backend/app/services/pipeline_runner.py` (`_build_github_client`) и публикация:
строить `GitHubClient` из installation-токена (по `installation_id` проекта/репы),
а не из `decrypt_github_access_token(owner.github_access_token)`.

### A8. Тесты

- `github_app`: генерация JWT (структура claims, RS256), мок `/app/installations/{id}/access_tokens`,
  кэш/протухание токена.
- `list_installation_repos`: пагинация `/installation/repositories`, только выбранные репы.
- Webhook: валидная/невалидная подпись, события installation/installation_repositories, push.
- Существующие `test_github_client.py` методы (`get_file_content`, `commit_files_batch`, …)
  — без изменений по сути, обновить только конструирование клиента.

### A9. Раскатка

1. Миграция БД (alembic) — аддитивная, без удаления OAuth-полей.
2. Dual-mode: если у репы есть installation — идём через App; иначе fallback на старый OAuth
   (чтобы `ru`-репа не отвалилась во время перехода).
3. Пользователи/админы переустанавливают доступ через `/auth/github/install` на нужные репы.
4. После перевода всех проектов на installation — удалить OAuth-ветку и поля (отдельной PR).

---

## Трек B — Немедленный разблок (на стороне GitHub, без кода)

Делается параллельно с треком A, разблокирует работу уже сейчас в рамках текущего OAuth App:

1. **`en`-репо:** Сергей Востриков добавляет аккаунт как collaborator / в команду с доступом
   к `en`-репозиторию. Пока GitHub-аккаунт не видит репу — её не покажет никакой токен.
2. **Org approval:** владелец организации одобряет «висящий» запрос OAuth App для организации
   (Settings орг → Third-party Access → Pending requests). Без этого орг-репы недоступны.
3. **Чистка лишнего запроса:** отозвать ранее запрошенный org-wide доступ, если запрашиваем
   заново точечно (после миграции — через установку GitHub App на выбранные репы).

---

## Трек C — Точечный фикс #3 (если миграцию откладываем)

Пока живём на OAuth App, поправить листинг, чтобы личные репы не пропадали:

`backend/app/services/github.py:326 get_user_repos()` — явно задать параметры и
временно залогировать ответ GitHub для диагностики:

```python
params={"per_page": "100", "page": str(page),
        "affiliation": "owner,collaborator,organization_member",
        "visibility": "all", "sort": "full_name"}
```

Плюс лог количества/владельцев вернувшихся реп (без токенов), чтобы понять, что именно
отдаёт GitHub под текущим токеном. После миграции на GitHub App этот метод заменяется на
`/installation/repositories` и фикс становится не нужен.

---

## Рекомендуемый порядок

Принятое решение: **сначала полностью реализуем код, и только потом запрашиваем доступы.**

1. ✅ **Реализация (трек A):** GitHub App целиком в коде — конфиг, модель, миграция, сервис
   installation-токенов, `GitHubClient`, роуты install/setup, вебхуки, листинг реп, фронт, тесты.
2. ✅ **Регистрация GitHub App:** App создан (ID `4114772`, slug `docflow-bitrix24`).
3. ⏳ **Деплой (в последнюю очередь):** доставить код на прод `/opt/docflow`, прописать
   `GITHUB_APP_*` в `/opt/docflow/.env`, `alembic upgrade head`, пересоздать backend.
4. ⏳ **Установка + доступы (трек B):** поставить App на `ru`/`en` репы через
   `Settings → GitHub → Установить`, получить org approval, отозвать старый org-wide OAuth-запрос.
5. ⏳ **Финал:** выпилить OAuth-ветку доступа к репам (dual-mode → only-App).

Трек C (точечный фикс `get_user_repos`) не нужен — листинг сразу делаем через
`/installation/repositories` в рамках трека A.
