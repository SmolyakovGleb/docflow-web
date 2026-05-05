# DocFlow Web — Схема базы данных

## Таблицы

> **Навигация по таблицам:** `users` → `projects` → `tasks` → `publications`, `dictionary_entries`, `notification_channels`



### `users`

Зарегистрированные пользователи. GitHub-поля заполняются после привязки аккаунта в профиле.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Идентификатор пользователя |
| `email` | `TEXT` | NOT NULL, UNIQUE | Email для входа |
| `password_hash` | `TEXT` | NOT NULL | bcrypt-хэш пароля |
| `display_name` | `TEXT` | | Отображаемое имя |
| `github_id` | `BIGINT` | UNIQUE, NULLABLE | ID на GitHub (заполняется после привязки) |
| `github_login` | `TEXT` | NULLABLE | Логин на GitHub (e.g. `gs-bitrix-doc`) |
| `github_access_token` | `TEXT` | NULLABLE | OAuth access token для GitHub API |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время регистрации |
| `last_login_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время последнего входа |

#### Индексы

```sql
CREATE UNIQUE INDEX idx_users_email     ON users (email);
CREATE UNIQUE INDEX idx_users_github_id ON users (github_id) WHERE github_id IS NOT NULL;
```

---

### `projects`

Конфигурация пары репозиториев source → target. Один пользователь может иметь несколько проектов.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Идентификатор проекта |
| `user_id` | `UUID` | NOT NULL, FK → users.id | Владелец проекта |
| `name` | `TEXT` | NOT NULL | Название проекта (e.g. `b24-rest-docs RU→EN`) |
| `source_repo` | `TEXT` | NOT NULL | Репозиторий-источник: `owner/repo` |
| `source_branch` | `TEXT` | NOT NULL, DEFAULT 'main' | Ветка источника |
| `target_repo` | `TEXT` | NOT NULL | Репозиторий-цель: `owner/repo` |
| `target_branch` | `TEXT` | NOT NULL, DEFAULT 'main' | Ветка цели |
| `webhook_secret` | `TEXT` | NOT NULL | HMAC-секрет для верификации GitHub webhook |
| `exclude_patterns` | `TEXT[]` | NOT NULL, DEFAULT `'{}'` | Паттерны исключений (gitignore-синтаксис): совпадающие файлы игнорируются при обработке webhook |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время создания |

#### Webhook URL

Для каждого проекта GitHub webhook настраивается на:
```
POST https://<host>/webhook/{project.id}
```

#### Индексы

```sql
CREATE INDEX idx_projects_user_id ON projects (user_id);
```

---

### `tasks`

Основная таблица. Каждая запись — один `.md`-файл, поставленный на перевод.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Идентификатор задачи |
| `project_id` | `UUID` | NOT NULL, FK → projects.id | Проект, в рамках которого создана задача |
| `file_path` | `TEXT` | NOT NULL | Путь к файлу в репо: `api-reference/crm/deals/crm-deal-get.md` |
| `github_ref` | `TEXT` | NOT NULL | Ветка/тег: `refs/heads/main` |
| `github_sha` | `TEXT` | | SHA коммита, который инициировал задачу |
| `commit_message` | `TEXT` | | Сообщение коммита из webhook payload; `"manual"` для ручного запуска |
| `source_file_sha` | `TEXT` | | SHA blob-объекта исходного файла (GitHub) |
| `target_file_sha` | `TEXT` | | SHA blob-объекта EN-файла на момент создания задачи; NULL если файл не существовал |
| `original_content` | `TEXT` | NOT NULL | Содержимое оригинального файла (RU) |
| `translated_content` | `TEXT` | | Результат пайплайна (EN); NULL до завершения |
| `status` | `TEXT` | NOT NULL, DEFAULT 'queued' | Статус задачи (см. ниже) |
| `log` | `TEXT` | | Вывод пайплайна (stdout + логи) |
| `error` | `TEXT` | | Traceback при `status=failed` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время создания |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время последнего обновления |

#### Статусы задачи

```
queued   →   running   →   done   →   published
                  ↓
               failed
```

| Статус | Описание |
|--------|----------|
| `queued` | Задача создана, ожидает запуска пайплайна |
| `running` | Пайплайн выполняется прямо сейчас |
| `done` | Перевод готов, ожидает ревью |
| `failed` | Пайплайн завершился с ошибкой |
| `published` | Перевод опубликован в целевой репозиторий |

#### Индексы

```sql
CREATE INDEX idx_tasks_project_id  ON tasks (project_id);
CREATE INDEX idx_tasks_status      ON tasks (status);
CREATE INDEX idx_tasks_created_at  ON tasks (created_at DESC);
CREATE INDEX idx_tasks_repo_path   ON tasks (project_id, file_path);
```

---

### `publications`

История публикаций. Одна задача может публиковаться несколько раз (повторная правка и публикация).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Идентификатор записи |
| `task_id` | `UUID` | NOT NULL, FK → tasks.id | Ссылка на задачу |
| `published_by` | `UUID` | NOT NULL, FK → users.id | Пользователь, нажавший «Опубликовать» |
| `target_repo` | `TEXT` | NOT NULL | Целевой репозиторий: `owner/repo` |
| `target_path` | `TEXT` | NOT NULL | Путь к файлу в целевом репо |
| `commit_sha` | `TEXT` | NOT NULL | SHA коммита в target repo, созданного нами |
| `target_file_sha_before` | `TEXT` | | SHA blob EN-файла до нашего коммита (для аудита) |
| `published_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время публикации |

#### Индексы

```sql
CREATE INDEX idx_publications_task_id   ON publications (task_id);
CREATE INDEX idx_publications_published_by ON publications (published_by);
```

---

### `dictionary_entries`

Пользовательские правки словарей пайплайна. Хранятся в БД и мёржатся с базовыми файлами из `pipeline/data/` при запуске перевода. Позволяет редактировать словари через UI без изменения файлов в git submodule.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Идентификатор записи |
| `dict_type` | `TEXT` | NOT NULL | Тип словаря: `dictionary`, `glossary`, `static_terms`, `section_headings`, `note_titles`, `include_labels`, `prompt` |
| `key` | `TEXT` | NOT NULL | Исходный термин (RU) или идентификатор (для `prompt` — всегда `"main"`) |
| `value` | `TEXT` | NOT NULL | Перевод (EN) или текст промпта |
| `is_deleted` | `BOOLEAN` | NOT NULL, DEFAULT false | Soft delete — позволяет скрыть базовую запись из submodule |
| `created_by` | `UUID` | NOT NULL, FK → users.id | Кто добавил запись |
| `updated_by` | `UUID` | FK → users.id | Кто последний редактировал |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время создания |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время изменения |

#### Логика мёржа при запуске пайплайна

```
1. Загрузить базовый словарь из pipeline/data/{file}.json
2. Загрузить все записи из dictionary_entries WHERE dict_type = '{type}'
3. Применить: пользовательские записи перекрывают базовые по ключу
4. Записи с is_deleted=true исключаются даже если есть в базовом файле
5. Передать результирующий словарь в pipeline.run()
```

#### Индексы

```sql
CREATE INDEX idx_dict_entries_type ON dictionary_entries (dict_type);
CREATE UNIQUE INDEX idx_dict_entries_type_key ON dictionary_entries (dict_type, key);
```

---

### `notification_channels`

Настраиваемые каналы уведомлений. Не привязаны к одной команде — можно создать несколько каналов с разными методами доставки, адресатами и наборами событий.

Примеры конфигурации:
- «Ошибки → чат #docflow-errors» (incoming webhook)
- «Готово к проверке → личка Анне» (REST API, user_id)
- «Конфликты → канал #публикации» (REST API, channel_id)

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | Идентификатор канала |
| `name` | `TEXT` | NOT NULL | Название канала: «Ошибки в чат разработки» |
| `method` | `TEXT` | NOT NULL | Метод доставки: `incoming_webhook` или `rest_api` |
| `webhook_url` | `TEXT` | NULLABLE | URL входящего вебхука Bitrix24 (для `incoming_webhook`) |
| `bitrix_token` | `TEXT` | NULLABLE | OAuth-токен или токен приложения Bitrix24 (для `rest_api`) |
| `destination_type` | `TEXT` | NULLABLE | Тип адресата: `user`, `chat`, `channel` (для `rest_api`) |
| `destination_id` | `TEXT` | NULLABLE | ID пользователя, чата или канала в Bitrix24 (для `rest_api`) |
| `events` | `TEXT[]` | NOT NULL, DEFAULT `{}` | События: `failure`, `conflict`, `done`, `published` |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Включён/выключен |
| `created_by` | `UUID` | NOT NULL, FK → users.id | Кто создал |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Время создания |

#### Метод `incoming_webhook`

Пользователь создаёт в Bitrix24:
```
Marketplace → Входящие вебхуки → Создать → скопировать URL
```
URL уже содержит адресата — чат задаётся при создании вебхука на стороне Bitrix24.
Поля `bitrix_token`, `destination_type`, `destination_id` — `null`.

#### Метод `rest_api`

Гибкий вариант: токен + адресат задаются в DocFlow.

| `destination_type` | `destination_id` | Bitrix24 API |
|--------------------|-----------------|--------------|
| `user` | user_id в Bitrix24 | `im.message.add` с `DIALOG_ID=user_id` |
| `chat` | chat_id | `im.message.add` с `DIALOG_ID=chatXX` |
| `channel` | channel_id | `im.message.add` с `DIALOG_ID=channelXX` |

Поле `webhook_url` — `null`.

#### Индексы

```sql
CREATE INDEX idx_notification_channels_active ON notification_channels (is_active) WHERE is_active = true;
```

---

## ERD

```
users
┌──────────────────────────────────────────────────────┐
│ id                  UUID  PK                         │
│ github_id           BIGINT UNIQUE                    │
│ github_login        TEXT                             │
│ github_name         TEXT                             │
│ github_access_token TEXT                             │
│ created_at          TIMESTAMPTZ                      │
│ last_login_at       TIMESTAMPTZ                      │
└──────────────────────┬───────────────────────────────┘
                       │ 1:N
                       ▼
projects
┌──────────────────────────────────────────────────────┐
│ id              UUID  PK                             │
│ user_id         UUID  FK → users.id                 │
│ name            TEXT                                 │
│ source_repo      TEXT                                │
│ source_branch    TEXT                                │
│ target_repo      TEXT                                │
│ target_branch    TEXT                                │
│ webhook_secret   TEXT                                │
│ exclude_patterns TEXT[]  DEFAULT '{}'               │
│ created_at       TIMESTAMPTZ                         │
└──────────────────────┬───────────────────────────────┘
                       │ 1:N
                       ▼
tasks
┌──────────────────────────────────────────────────────┐
│ id                  UUID  PK                         │
│ project_id          UUID  FK → projects.id           │
│ file_path           TEXT                             │
│ github_ref          TEXT                             │
│ github_sha          TEXT                             │
│ commit_message      TEXT                             │
│ source_file_sha     TEXT                             │
│ target_file_sha     TEXT                             │
│ original_content    TEXT                             │
│ translated_content  TEXT                             │
│ status              TEXT  (queued|running|done|      │
│                            failed|published)         │
│ log                 TEXT                             │
│ error               TEXT                             │
│ created_at          TIMESTAMPTZ                      │
│ updated_at          TIMESTAMPTZ                      │
└──────────────────────┬───────────────────────────────┘
                       │ 1:N
                       ▼
publications
┌──────────────────────────────────────────────────────┐
│ id                      UUID  PK                     │
│ task_id                 UUID  FK → tasks.id          │
│ published_by            UUID  FK → users.id          │
│ target_repo             TEXT                         │
│ target_path             TEXT                         │
│ commit_sha              TEXT                         │
│ target_file_sha_before  TEXT                         │
│ published_at            TIMESTAMPTZ                  │
└──────────────────────────────────────────────────────┘

dictionary_entries
┌──────────────────────────────────────────────────────┐
│ id           UUID  PK                                │
│ dict_type    TEXT  (dictionary|glossary|             │
│                     static_terms|section_headings|   │
│                     note_titles|include_labels|      │
│                     prompt)                          │
│ key          TEXT                                    │
│ value        TEXT                                    │
│ is_deleted   BOOLEAN  DEFAULT false                  │
│ created_by   UUID  FK → users.id                    │
│ updated_by   UUID  FK → users.id                    │
│ created_at   TIMESTAMPTZ                             │
│ updated_at   TIMESTAMPTZ                             │
└──────────────────────────────────────────────────────┘

notification_channels  (независимо от users/projects)
┌──────────────────────────────────────────────────────┐
│ id               UUID  PK                            │
│ name             TEXT                                │
│ method           TEXT  (incoming_webhook|rest_api)   │
│ webhook_url      TEXT  NULLABLE                      │
│ bitrix_token     TEXT  NULLABLE                      │
│ destination_type TEXT  NULLABLE  (user|chat|channel) │
│ destination_id   TEXT  NULLABLE                      │
│ events           TEXT[]                              │
│ is_active        BOOLEAN  DEFAULT true               │
│ created_by       UUID  FK → users.id                │
│ created_at       TIMESTAMPTZ                         │
└──────────────────────────────────────────────────────┘
```

---

## Миграции (Alembic)

Файлы миграций живут в `backend/migrations/versions/`.

| Версия | Файл | Содержание |
|--------|------|------------|
| 001 | `001_users.py` | Создание таблицы `users` (email + пароль + nullable GitHub-поля) |
| 002 | `002_projects.py` | Создание таблицы `projects` |
| 003 | `003_tasks.py` | Создание таблицы `tasks` |
| 004 | `004_publications.py` | Создание таблицы `publications` с полем `published_by` |
| 005 | `005_dictionary_entries.py` | Создание таблицы `dictionary_entries` |
| 006 | `006_notification_channels.py` | Создание таблицы `notification_channels` |
| 007 | `007_add_exclude_patterns_commit_message.py` | `projects.exclude_patterns TEXT[]`, `tasks.commit_message TEXT` |

Применение:
```bash
# из backend/
alembic upgrade head

# откат
alembic downgrade -1
```

---

## SQLAlchemy-модели (ориентир)

### User

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    display_name: Mapped[str | None]
    github_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    github_login: Mapped[str | None]
    github_access_token: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    last_login_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    projects: Mapped[list["Project"]] = relationship(back_populates="user")
```

### Project

```python
class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str]
    source_repo: Mapped[str]
    source_branch: Mapped[str] = mapped_column(default="main")
    target_repo: Mapped[str]
    target_branch: Mapped[str] = mapped_column(default="main")
    webhook_secret: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    user: Mapped["User"] = relationship(back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")
```

### Task

```python
class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"))
    file_path: Mapped[str]
    github_ref: Mapped[str]
    github_sha: Mapped[str | None]
    source_file_sha: Mapped[str | None]
    target_file_sha: Mapped[str | None]
    original_content: Mapped[str]
    translated_content: Mapped[str | None]
    status: Mapped[str] = mapped_column(default="queued")
    log: Mapped[str | None]
    error: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="tasks")
    publications: Mapped[list["Publication"]] = relationship(back_populates="task")
```

### Publication

```python
class Publication(Base):
    __tablename__ = "publications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"))
    published_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    target_repo: Mapped[str]
    target_path: Mapped[str]
    commit_sha: Mapped[str]
    target_file_sha_before: Mapped[str | None]
    published_at: Mapped[datetime] = mapped_column(default=func.now())

    task: Mapped["Task"] = relationship(back_populates="publications")
    publisher: Mapped["User"] = relationship()
```

### DictionaryEntry

```python
class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]
    method: Mapped[str]  # incoming_webhook | rest_api
    webhook_url: Mapped[str | None]
    bitrix_token: Mapped[str | None]
    destination_type: Mapped[str | None]  # user | chat | channel
    destination_id: Mapped[str | None]
    events: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    creator: Mapped["User"] = relationship(foreign_keys=[created_by])


class DictionaryEntry(Base):
    __tablename__ = "dictionary_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    dict_type: Mapped[str]  # dictionary|glossary|static_terms|section_headings|note_titles|include_labels|prompt
    key: Mapped[str]
    value: Mapped[str]
    is_deleted: Mapped[bool] = mapped_column(default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    updater: Mapped["User | None"] = relationship(foreign_keys=[updated_by])
```