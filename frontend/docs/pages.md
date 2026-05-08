# Страницы продукта

Список всех экранов с указанием статуса дизайна и требований.
Только две страницы покрыты HTML-макетами на текущий момент.

---

## Структура роутинга

```
/login                    — публичный
/register                 — публичный
/*                        — ProtectedRoute (auth-bootstrap)
  /tasks                  — TaskList (default)
  /tasks/:id              — TaskDetail (?tab=diff|logs|conflict)
  /history                — History
  /analytics              — Analytics
  /repositories           — список проектов
  /repositories/new       — создание проекта
  /repositories/:id       — детали проекта
  /dictionaries           — список словарей
  /dictionaries/:type     — конкретный словарь (read-only в MVP)
  /settings               — Settings
  /settings/profile       — профиль и пароль
  /settings/github        — привязка GitHub
  /settings/notifications — каналы уведомлений (заглушки в MVP)
  /404                    — fallback
```

---

## ✅ Страницы с макетами

### `/tasks` — TaskList (Главная)

**Макет:** `docs/designs/dashboard_v4.html`

**Состояния (4):**

- list — обычный список задач с группировкой по коммитам
- emptyA — GitHub не подключён → CTA «Привязать GitHub» + ссылка на upload без репо
- emptyB — GitHub подключён, нет задач → CTA «Запустить перевод»
- batch — режим выбора нескольких задач (floating bar внизу)

**Ключевые элементы:**

- Sidebar с навигацией (sticky, 220px)
- Stat-chips сверху: «в работе», «ждут проверки», «ошибки», «опубликовано сегодня»
- Search с `⌘K` shortcut (cmdk)
- Кнопка «Запустить перевод» → модалка
- Tabs по статусам с count-чипами
- Toolbar: «Выбрать», webhook-индикатор, popover-фильтр по проекту (фильтр направления перевода удалён — см. design-feedback.md)
- Commit groups: иконка коммита / "ручной запуск", автор, кол-во файлов, время
- Task row inline: путь файла, проект, статус (с pipeline-progress если running), conflict-icon, время, action button
- Floating bar в batch-режиме
- Footer: «Пайплайн `a3f2c1d` · Последняя синхронизация `2 мин назад` · Показано 12 из 247 задач» (SHA в JetBrains Mono)

### `/tasks/:id` — TaskDetail

**Макет:** `docs/designs/taskdetail_v1.html`

**Состояния (3 таба):**

- diff — двух-колоночный CodeMirror MergeView (RU read-only / EN editable) + save-bar
- logs — pipeline stages, real-time SSE стрим во время `running`
- conflict — три read-only колонки (base/ours/theirs) + редактируемый низ + bar «N/M разрешено» → publish button

**Ключевые элементы:**

- Sticky header: project, file_path, статус-pill, action-buttons по статусу
- Tabs (Radix Tabs) с активной вкладкой в URL
- Save-bar появляется только при dirty в diff-табе

---

## 🔲 Страницы без макетов (нужно проектировать)

### `/login` и `/register` — Auth

**Макета нет. Требования:**

- Минималистично: логотип, форма email + password, кнопка submit, ссылка на регистрацию/логин
- Поле `display_name` только в register
- Validation через `react-hook-form` + `zod` (min/max length, email format)
- Toast при rate limit (429), 401
- После успеха redirect на `/tasks`
- Тёмная тема, согласованная по типографике с TaskList

### `/repositories` — список проектов

**Макета нет. Требования:**

- Card-grid или table-список проектов пользователя
- Кнопка «Новый проект» → `/repositories/new`
- На каждой карточке: имя, source_repo → target_repo, ветки, кол-во задач, дата создания
- Quick action: «Открыть» → `/repositories/:id`, «Удалить» (с confirm-диалогом)
- Empty state когда нет проектов

### `/repositories/new` — создание проекта

**Макета нет. Требования:**

- Форма: name, source_repo (autocomplete из `GET /user/repos`), source_branch, target_repo (autocomplete), target_branch, exclude_patterns (multi-input)
- После создания: модалка-onceshow с `webhook_secret` + инструкцией настройки GitHub Webhook + кнопка «Скопировать»
- Кнопка «Сгенерировать новый секрет» (вызов нового эндпоинта)

### `/repositories/:id` — детали проекта

**Макета нет. Требования:**

- Header: имя проекта, edit-режим
- Section: source/target репо и ветки (read-only)
- Section: exclude_patterns (textarea, save → PATCH)
- Section: webhook URL (read-only) + статус последней доставки (нужен бэкенд)
- Кнопка «Сгенерировать новый секрет» → confirm-диалог → модалка с новым secret
- Section: связанные задачи (link на `/tasks?project_id=...`)
- Кнопка «Удалить проект» (внизу, с двойным подтверждением)

### `/history` — лента публикаций

**Макета нет. Требования:**

- Header: фильтры (project, published_by, диапазон дат — react-day-picker)
- Лента карточек: file_path, source/target repo, commit_url (link), published_by avatar+name, published_at relative
- Bulk actions нет
- Pagination (limit 50, offset)

### `/analytics` — графики

**Макета нет. Требования:**

- Header: фильтры (project, date range)
- 4 stat-card: total_tasks, success_rate %, avg_duration, опубликовано в диапазоне
- Chart 1: tasks_per_day stacked bar (по статусам)
- Chart 2: success_rate линия по дням
- Chart 3: top_errors таблица (top 5)
- Кнопка «Экспорт CSV» (papaparse)

### `/dictionaries` — список словарей

**Макета нет. Требования:**

- Sidebar/list типов: dictionary, glossary, static_terms, section_headings, note_titles, include_labels, prompt
- Counter по каждому
- Click → `/dictionaries/:type`

### `/dictionaries/:type` — словарь

**Макета нет. Требования (MVP read-only):**

- Заголовок типа + краткое описание
- Search bar по `key`
- Table: key | value | source (`base` chip / `user` chip) | updated_by | updated_at
- Для prompt — один большой read-only textarea
- Banner: «Редактирование словарей будет доступно в следующей версии»

### `/settings/profile` — профиль

**Макета нет. Требования:**

- Header: avatar (initials), display_name, email
- Form: change display_name (PATCH), change password (current + new)
- Section: timezone selector
- «Удалить аккаунт» — пока нет API, опустить

### `/settings/github` — привязка GitHub

**Макета нет. Требования:**

- Status: подключён/не подключён
- Если подключён: github_login, кнопка «Отвязать» (с confirm)
- Если не подключён: кнопка «Привязать GitHub» → `/auth/github/connect` (window.location)
- Banner если в URL `?github_error=...` (отказ OAuth)

### `/settings/notifications` — каналы уведомлений

**Макета нет. Требования (MVP):**

- Banner: «Уведомления Bitrix24 будут доступны в следующей версии»
- Пустой list (т.к. `GET /channels` возвращает `[]`)
- Кнопка «Добавить канал» — disabled с tooltip

### Onboarding modal — глобальная

**Макета нет. Требования:**

- Появляется поверх любой страницы (`<Dialog>`) при условии: `user.github_linked === false || projects.length === 0`
- 3 шага в виде прогресса: Привязать GitHub → Создать проект → Настроить webhook
- Кнопка «Skip» → флаг в localStorage `onboarding_skipped`
- Не блокирует UI, но затемняет

### `/404` — Not Found

**Макета нет. Требования:**

- Минимально: «404 — страница не найдена», кнопка «На главную»

---

## Глобальные компоненты (не страницы)

| Компонент         | Где используется      | Замечания                             |
| ----------------- | --------------------- | ------------------------------------- |
| `<Sidebar>`       | ProtectedRoute layout | sticky, badges с count из RTK Query   |
| `<Layout>`        | ProtectedRoute        | оборачивает `<Sidebar>` + `<main>`    |
| `<TopBar>`        | внутри `<Layout>`     | global search (`Cmd+K` cmdk)          |
| `<Toaster>`       | в `<App>` root        | sonner                                |
| `<ErrorBoundary>` | в `<App>` root        | Sentry catch + fallback UI            |
| `<ConfirmDialog>` | shared/ui             | универсальный confirm с typed body    |
| `<EmptyState>`    | shared/ui             | icon + title + desc + actions         |
| `<StatusPill>`    | shared/ui             | для всех task statuses, Radix Tooltip |
| `<RepoLink>`      | shared/ui             | `owner/repo` с GitHub-иконкой         |

---

## Что нужно от дизайна

При появлении лимитов на дизайн-модель — приоритет работ:

1. `/login` + `/register` — простой шаблон, можно делать самим без макета
2. `/repositories` — критично, блок onboarding
3. `/repositories/new` — критично, без него нельзя создать проект
4. Onboarding modal — UX-критично для первого входа
5. `/settings/github` — простой, можно без макета
6. `/history` — после MVP-флоу translate→publish
7. `/analytics` — после `/history`
8. `/dictionaries` — низкий приоритет в MVP (read-only)
9. `/settings/notifications` — наименьший приоритет (заглушка)
