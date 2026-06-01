# DocFlow Web Frontend — План разработки

Разработка ведётся итерационно: каждый этап даёт рабочий вертикальный срез. Следующий этап начинается только после того, как текущий работает end-to-end и тесты зелёные.

Все решения, на которые опирается план, зафиксированы в [decisions.md](decisions.md).
Спецификации экранов — в [pages.md](pages.md), правки макетов — в [design-feedback.md](design-feedback.md), HTML-референсы — в `frontend/docs/designs/`.

---

## Этап 1 — Базовая инфраструктура

Дизайн-токены, layout, shared UI-примитивы. После этапа все последующие экраны строятся быстро.

### Зависимости

- Бэкенд: нет изменений
- Зависимости установлены ранее (Radix, lucide-react, sonner, framer-motion)

### Файлы

- `src/app/styles/vars.css` — расширить (+ animations: pulse-dot, shimmer, spin, skeleton). **Все цветовые переменные обернуть в `:root[data-theme="dark"]`** — готовность к light theme post-MVP
- `src/app/styles/globals.css` — общие стили (резет, ссылки, scrollbar)
- `index.html` — Google Fonts (Inter, JetBrains Mono), `lang="ru"`, `viewport=1280`. На `<html>` ставить `data-theme="dark"`
- `src/shared/ui/Button/Button.tsx` + `.module.css` — primary / secondary / ghost / danger
- `src/shared/ui/Input/Input.tsx` + `.module.css` — text / password (с toggle visibility)
- `src/shared/ui/Field/Field.tsx` — label + input + hint + error
- `src/shared/ui/StatusPill/StatusPill.tsx` — все 6 статусов из палитры + lucide-иконки
- `src/shared/ui/Avatar/Avatar.tsx` — инициалы из display_name на `--surface-hover`
- `src/shared/ui/EmptyState/EmptyState.tsx` — icon + title + desc + actions
- `src/shared/ui/Skeleton/Skeleton.tsx` — пульсирующие прямоугольники
- `src/shared/ui/Spinner/Spinner.tsx` — `lucide:loader-2` с rotate animation
- `src/shared/ui/Toast/setup.tsx` — обёртка над `sonner` с нашей стилизацией
- `src/shared/ui/RepoLink/RepoLink.tsx` — `owner/repo` с GitHub-иконкой и target=\_blank
- `src/shared/ui/ConfirmDialog/ConfirmDialog.tsx` + `.module.css` — Radix Dialog 480px, заголовок + body + 2 кнопки. Вариант `danger` для destructive (delete project, regenerate secret, disconnect github)
- `src/shared/ui/MinViewportGuard/MinViewportGuard.tsx` — оборачивает `<App>`, при `window.innerWidth < 1280` показывает full-screen заглушку «DocFlow оптимизирован для desktop»
- `src/shared/lib/cn.ts` — re-export `clsx` (`cn(...args)`)
- `src/shared/lib/getInitials.ts` — «Anna Kuznetsova» → «AK»

### Детали реализации

- Все компоненты — TypeScript, props через интерфейсы
- CSS Modules для каждого компонента, классы через `clsx`
- Отступы и цвета только из CSS-переменных, не хардкодить
- `Button` принимает `variant`, `size`, `iconLeft`, `iconRight`, `loading`, `as` (для `Link`)
- `StatusPill` принимает `status: TaskStatus`, генерирует цвет/текст из i18n
- `Avatar` принимает `name`, `size` (default 26, mini 22, tiny 18)
- `Skeleton` — варианты `line`, `circle`, `rect`, ширина/высота через props

### Локализация

**Структура — namespaces по фичам с самого начала** (см. `i18n.md`). Создать:

- `src/locales/ru/common.json`, `nav.json`, `auth.json`, `tasks.json`, `errors.json` (минимум на этап 1; остальные namespaces создаются по мере появления фич)
- `src/shared/lib/i18n.ts` — конфиг с `ns`, `defaultNS: 'common'`, импортом всех файлов

Контент на этапе 1:

- `tasks.status.*` — для StatusPill (6 статусов)
- `errors.network`, `errors.generic` — для общих error-states

### Тесты

**Unit (`tests/unit/`):**

- `Avatar.test.tsx` — генерация инициалов из имени, fallback на `?`
- `getInitials.test.ts` — кейсы: «Anna», «Anna Kuznetsova», «anna kuznetsova», «AK», пустая строка
- `cn.test.ts` — smoke

**Integration:**

- `ConfirmDialog.test.tsx` — клик на cancel закрывает, клик на primary вызывает onConfirm
- `MinViewportGuard.test.tsx` — при ширине 1100px показывается заглушка

### Проверка

- Открыть `vite dev`, временно отрендерить все примитивы на одной странице (`/dev` route)
- Сверить визуально с `frontend/docs/designs/DocFlow Auth.html` (кнопки, инпуты, шрифты)
- `npm run test` — зелёный
- `npm run build` — успех, размер бандла < +50KB

---

## Этап 2 — RTK Query + Auth bootstrap + Protected routes

Сетевой слой и роутинг. Ничего не рендерится в UI — но после этапа все API-запросы типизированы и обработка 401 централизована.

### Зависимости

- Этап 1
- Бэкенд: уже есть `GET /auth/me`

### Файлы

- `src/shared/lib/axios.ts` — axios instance с `baseURL: '/api'`, `withCredentials: true`
- `src/shared/api/baseApi.ts` — `createApi` с `axiosBaseQuery`, теги (`Task`, `Project`, `History`, `Dictionary`, `NotificationChannel`, `User`, `Health`)
- `src/shared/api/axiosBaseQuery.ts` — кастомный baseQuery, обработка 401 → `clearUser()` + redirect
- `src/shared/lib/errorMessages.ts` — map `{ "Email already registered": "auth.errors.email_taken", ... }` + `translateBackendError(detail)`
- `src/features/auth/api/authApi.ts` — `getMe`, `login`, `register`, `logout`, `changePassword`, `disconnectGithub`
- `src/features/auth/model/authSlice.ts` — расширить (selectors)
- `src/app/router.tsx` — `<RouterProvider>` с роутами
- `src/app/AuthBootstrap.tsx` — диспатчит `getMe.initiate()` при mount, показывает Splash до завершения
- `src/app/ProtectedRoute.tsx` — проверяет `isAuthenticated`, иначе `<Navigate to="/login">`
- `src/app/PublicRoute.tsx` — для login/register: если уже авторизован → `<Navigate to="/tasks">`
- `src/app/Splash.tsx` — full-screen wordmark + spinner, на тёмном фоне
- `src/shared/store/index.ts` — добавить `baseApi.middleware`, `setupListeners`

### Детали реализации

- `axiosBaseQuery` — преобразует axios-ошибки в RTK-формат `{ status, data }`
- Глобальная обработка: на 401 в response interceptor → `store.dispatch(clearUser())` + `window.location.href = '/login'` (router тут недоступен)
- **Bootstrap-исключение:** `getMe` определён с `extraOptions: { skipAuthRedirect: true }`. Когда `axiosBaseQuery` получает 401 — он смотрит на этот флаг: если true → возвращает ошибку без диспатча `clearUser` и без редиректа. AuthBootstrap читает результат и сам решает (на 401 — `isAuthenticated=false`, `<PublicRoute>` обрабатывает дальше)
- Splash показывается ровно до того момента, пока не разрешится первый `getMe` (success или error)

### Используемые API

- `GET /auth/me` (на bootstrap)

### Тесты

**Unit:**

- `errorMessages.test.ts` — known message → ru, unknown → fallback
- `axiosBaseQuery.test.ts` — мок axios, проверить трансформацию success/error

**Integration (MSW):**

- `AuthBootstrap.test.tsx` — на 200 от `/auth/me` → setUser, на 401 → стейт `isAuthenticated=false`
- `ProtectedRoute.test.tsx` — без user → redirect на `/login`
- `PublicRoute.test.tsx` — с user → redirect на `/tasks`

### Проверка

- Открыть приложение незалогиненным → редирект `/login` (страница пока пустая, главное — не висит)
- Через DevTools поставить cookie session → reload → редирект `/tasks` (страница пустая)
- 401 на любой запрос → редирект `/login`

---

## Этап 3 — Auth pages (Login + Register)

Полнофункциональные экраны входа и регистрации.

### Зависимости

- Этапы 1, 2
- Бэкенд: уже есть `POST /auth/register`, `POST /auth/login`

### Файлы

- `src/features/auth/ui/AuthLayout.tsx` + `.module.css` — общая центрированная карточка 380px на dark-фоне
- `src/features/auth/ui/AuthLogo.tsx` — wordmark «DocFlow» с glyph (3 линии разной длины из дизайна)
- `src/features/auth/ui/LoginForm.tsx` — react-hook-form + zod
- `src/features/auth/ui/RegisterForm.tsx`
- `src/features/auth/ui/PasswordInput.tsx` — `Input` + toggle visibility (`lucide:eye` / `eye-off`)
- `src/features/auth/ui/AuthError.tsx` — error-banner над формой
- `src/features/auth/lib/schemas.ts` — `loginSchema`, `registerSchema` (zod)
- `src/pages/LoginPage/index.tsx` — оборачивает `<AuthLayout><LoginForm /></AuthLayout>`
- `src/pages/RegisterPage/index.tsx` — то же с `<RegisterForm />`

### Детали реализации

- Форма Login: `email` (EmailStr на бэке), `password` (min 1)
- Форма Register: `email`, `password` (min 8, минимум одна цифра), `display_name` (опционально)
- Submit → `useLoginMutation()` / `useRegisterMutation()`
- На 200 → `dispatch(setUser(res))` + `navigate('/tasks')`
- На 201 от `POST /auth/register` → считать пользователя уже авторизованным, делать `dispatch(setUser(res))` + `navigate('/tasks')`
- На 400 (email taken) / 401 (invalid creds) / 429 (rate limit) → `<AuthError>` с переведённым сообщением
- Кнопка submit с `loading` спиннером, отключение во время mutation
- Ссылка переключения: на `/register` показывается «Нет аккаунта? Зарегистрироваться»; на `/login` — «Уже есть аккаунт? Войти»
- Под карточкой показывать ссылки на `/terms` и `/privacy`; до готовности реального контента эти маршруты ведут на общую заглушку «страница ещё в разработке»
- Стилистика по `frontend/docs/designs/DocFlow Auth.html`

### Локализация

- `auth.login_title`, `auth.register_title`
- `auth.email`, `auth.password`, `auth.display_name`
- `auth.submit_login`, `auth.submit_register`
- `auth.have_account`, `auth.no_account`
- `auth.errors.invalid_credentials`, `auth.errors.email_taken`, `auth.errors.rate_limited`
- `auth.password_hint`, `auth.errors.password_digit_required`

### Состояния UI

- idle (начальное)
- loading (submit в процессе)
- error (баннер с описанием 400/401/429)

### Тесты

**Unit:**

- `schemas.test.ts` — валидация email формата, min length password

**Integration (MSW):**

- `LoginForm.test.tsx`:
  - submit с валидными данными → mock `POST /auth/login` 200 → `setUser` диспатчен, переход на `/tasks`
  - submit с неверным паролем → mock 401 → error-banner
  - rate limit → mock 429 → error-banner с другим текстом
- `RegisterForm.test.tsx`:
  - submit → mock 201 → переход
  - email taken → mock 400 → error-banner

**E2E (`e2e/auth.spec.ts`):**

- `login_redirect_to_tasks` — заполнение формы login → URL `/tasks`

### Проверка

1. `/login` отображается, форма валидируется (zod-сообщения под полями)
2. Неверный пароль → красный баннер «Неверный email или пароль»
3. Успешный логин → перенаправление на `/tasks`
4. `/register` работает аналогично
5. На уже авторизованном → попытка зайти на `/login` → автоматически на `/tasks`

---

## Этап 4 — Layout + Sidebar

Основной layout для всех authenticated-страниц.

### Зависимости

- Этапы 1, 2, 3

### Файлы

- `src/app/layouts/AppLayout.tsx` + `.module.css` — `[Sidebar 220px][main flexible]` grid + регистрация `Cmd+K` глобального хоткея через `react-hotkeys-hook`
- `src/shared/ui/Sidebar/Sidebar.tsx` + `.module.css` — sticky 220px sidebar по дизайну
- `src/shared/ui/Sidebar/NavItem.tsx` — пункт меню с иконкой, active-state по NavLink
- `src/shared/ui/Sidebar/UserBlock.tsx` — внизу: avatar + display_name + GitHub status + dropdown menu (logout)
- `src/shared/ui/Sidebar/Wordmark.tsx` — DocFlow logo (glyph + текст)
- `src/features/cmdk/model/cmdkSlice.ts` — `{ open: boolean }` слайс для cmdk-диалога

### Детали реализации

- Sidebar разделён на 2 секции: «РАБОТА» (Задачи / История / Аналитика), «КОНФИГУРАЦИЯ» (Репозитории / Словари / Настройки)
- **Без счётчиков** на пунктах (см. decisions.md)
- Active-link определяется через react-router `<NavLink>`
- UserBlock: клик → Radix DropdownMenu с пунктами «Настройки», «Выйти»
- Logout вызывает `useLogoutMutation`, после успеха → `clearUser()` + redirect `/login`
- **Cmd+K shortcut** регистрируется в `AppLayout` через `useHotkeys('mod+k', () => dispatch(cmdkSlice.actions.open()))` — работает с любой authenticated-страницы. Сам диалог cmdk создаётся в Этапе 12, но слайс и шорткат уже работают с этапа 4 (диалог пока не открывается, т.к. компонента нет)
- **Visible search-input — только в TaskList (Этап 6)**, не в общем Layout. На остальных страницах поиска нет (по макетам Repositories/TaskDetail подтверждено)

### Локализация

- `nav.work_section`, `nav.config_section`
- `nav.tasks`, `nav.history`, `nav.analytics`, `nav.repositories`, `nav.dictionaries`, `nav.settings`
- `nav.github_connected`, `nav.github_disconnected`
- `common.logout`

### Тесты

**Integration:**

- `Sidebar.test.tsx` — рендер с моком user, active-state корректный
- `UserBlock.test.tsx` — клик «Выйти» → mutation вызывается, диспатч `clearUser`

### Проверка

- После логина видно sidebar с правильным пользователем
- Клик по пунктам меню меняет URL и подсвечивает активный
- «Выйти» работает корректно

---

## Этап 5 — Repositories (список + создание + WebhookSecretModal)

Полная функциональность управления проектами.

### Зависимости

- Этап 4
- Бэкенд:
  - Уже: `GET/POST/PATCH/DELETE /projects`
  - Добавить: `POST /projects/{id}/regenerate-webhook-secret`
  - Добавить: `GET /projects/{id}/files?path=<dir>` (для модалки запуска перевода — будет на этапе 6)

### Файлы

- `src/features/projects/api/projectsApi.ts` — `getProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`, `regenerateSecret`
- `src/features/projects/model/types.ts` — типы `Project`, `ProjectCreate`, `ProjectCreateResponse`
- `src/features/projects/lib/schemas.ts` — zod-схемы создания/редактирования
- `src/features/projects/ui/RepositoriesPage.tsx` — таблица + header
- `src/features/projects/ui/RepositoryRow.tsx` — строка таблицы
- `src/features/projects/ui/NewRepositoryPage.tsx` — форма создания
- `src/features/projects/ui/RepositoryDetailPage.tsx` — детали проекта
- `src/features/projects/ui/RepoCombobox.tsx` — autocomplete owner/repo (`GET /user/repos`)
- `src/features/projects/ui/ExcludePatternsInput.tsx` — chip-input для паттернов
- `src/features/projects/ui/WebhookSecretModal.tsx` — модалка с секретом (Radix Dialog)
- `src/features/projects/ui/DeleteProjectDialog.tsx` — confirm с вводом имени проекта
- `src/features/projects/ui/EditBranchesDialog.tsx` — edit ветки (без source/target_repo)
- `src/pages/RepositoriesPage.tsx`, `NewRepositoryPage.tsx`, `RepositoryDetailPage.tsx`

### Детали реализации

- Таблица в `/repositories` со всеми колонками из дизайна
- Empty-state когда нет проектов (по дизайну `DocFlow Repositories.html`)
- `NewRepository`: combobox для source/target из `GET /user/repos`, ветки рядом, exclude patterns как chip-input
- После `createProject` → `WebhookSecretModal` (нельзя закрыть на overlay-click)
- `RepositoryDetailPage`: секции (source/target read-only, ветки edit, webhook URL + regenerate, exclude patterns edit, связанные задачи 5 последних, опасная зона)
- `regenerateSecret` → confirm dialog → mutation → WebhookSecretModal с новым секретом
- Удаление проекта — двойной confirm: первый «Точно?», второй с вводом имени проекта в input

### Используемые API

- `GET /projects`
- `GET /projects/{id}`
- `POST /projects`
- `PATCH /projects/{id}`
- `DELETE /projects/{id}`
- `POST /projects/{id}/regenerate-webhook-secret` (новый)
- `GET /me/github-repos` (новый эндпоинт на бэке — обёртка над `GitHubClient.get_user_repos()` с использованием OAuth-токена текущего пользователя; имя выбрано консистентно с `GET /auth/me`)

### Состояния UI

- list (заполненный)
- empty (нет проектов)
- loading (skeleton-таблица)
- error (retry)
- detail
- new (форма)
- creating (loading-overlay)
- WebhookSecretModal

### Локализация

- `repositories.*` — все строки страниц + модалок

### Тесты

**Unit:**

- `schemas.test.ts` — валидация формы создания

**Integration (MSW):**

- `RepositoriesPage.test.tsx` — таблица рендерится из моков, кнопка «Новый проект» работает
- `NewRepositoryPage.test.tsx` — submit → 201 → WebhookSecretModal появляется
- `WebhookSecretModal.test.tsx` — клик «Скопировать» → toast, нельзя закрыть на overlay
- `DeleteProjectDialog.test.tsx` — кнопка «Удалить» disabled пока не введено имя

**E2E:**

- `repositories_create_flow.spec.ts` — login → /repositories → New → fill form → submit → see WebhookSecretModal → copy secret → close → see new project in list

### Проверка

1. `/repositories` пусто → empty state с CTA
2. Создание проекта работает, модалка с секретом появляется и не закрывается случайно
3. Detail-страница показывает все секции, edit ветки работает
4. Удаление с двойным confirm работает

---

## Этап 5а — Туннель для webhook-тестирования

Настройка публичного URL для локального бэкенда. Нужна чтобы GitHub мог слать реальные push-события на localhost во время разработки этапов 6–7.

### Когда нужно

Без туннеля можно обойтись на этапах 1–5: весь CRUD проверяется через `localhost:8000` напрямую. Туннель нужен в момент, когда хочется проверить полный флоу: **реальный push в GitHub → webhook → задача появилась в TaskList**.

Можно отложить до начала этапа 6, если webhook-флоу планируется тестировать через `curl`-эмуляцию. Но лучше настроить заранее — вместе с созданием первого проекта на этапе 5.

### Инструмент

**Cloudpub** (`cloudpub.ru`) — российский аналог ngrok, поддерживает постоянный поддомен без токена на бесплатном плане.

Альтернативы: `ngrok` (требует auth), `localtunnel` (нестабилен), `bore` (Go, open-source, self-hosted).

### Настройка

```bash
# Установка (Windows)
winget install Cloudpub.Cloudpub
# или скачать exe с cloudpub.ru

# Привязка CLI к аккаунту
clo set token <ваш_cloudpub_token>

# Запуск туннеля на backend-порт
clo publish http 8000 --name docflow-webhook
# → выдаёт URL вида: https://abc123.cloudpub.ru
```

Важно: tunnel пробрасывается напрямую в FastAPI на `:8000`, без Vite proxy. Поэтому внешний URL должен использовать **backend-маршруты без `/api`**.

После запуска:

1. Скопировать выданный URL.
2. Обновить `APP_BASE_URL` в root `.env`:

```env
APP_BASE_URL=https://abc123.cloudpub.ru
```

3. Перезапустить backend, чтобы `project.webhook_url` начал строиться с tunnel-доменом.
4. При желании зафиксировать URL во `frontend/.env.development.local`:

```env
VITE_TUNNEL_URL=https://abc123.cloudpub.ru
```

5. Использовать webhook URL и secret в GitHub:

```
Payload URL: https://abc123.cloudpub.ru/webhook/{project_id}
Content type: application/json
Secret: <webhook_secret из модалки>
Events: Just the push event
```

### Локальный docker-compose

Когда туннель активен, бэкенд всё равно запускается через `docker compose up`:

```bash
# В корне проекта
docker compose up backend db
# В отдельном терминале
clo publish http 8000 --name docflow-webhook
```

Nginx в docker-compose не нужен для разработки — туннель пробрасывает прямо на FastAPI-порт.

### Переменная окружения

Для локальной настройки удобно использовать два файла:

- root `.env.local` — хранит `CLOUDPUB_TOKEN` (не читается приложением, только helper-скриптами)
- `frontend/.env.development.local` — хранит `VITE_TUNNEL_URL` для dev-подсказок и README

```env
# .env.local
CLOUDPUB_TOKEN=your_cloudpub_token
```

```env
# frontend/.env.development.local
VITE_TUNNEL_URL=https://abc123.cloudpub.ru
```

`APP_BASE_URL` остаётся в root `.env`, потому что именно его читает backend-конфиг для генерации `project.webhook_url`.
`VITE_TUNNEL_URL` используется только в devtools / readme, не в коде приложения. Tunnel URL может меняться при перезапуске на бесплатном плане — обновлять вручную.

### Эмуляция без туннеля (альтернатива)

Если туннель не нужен прямо сейчас, webhook можно отправить вручную:

```bash
# Сгенерировать подпись
python -c "
import hmac, hashlib, json
secret = 'your_webhook_secret'
payload = json.dumps({'ref': 'refs/heads/main', 'commits': [{'id': 'abc1234', 'message': 'test', 'author': {'name': 'Test', 'login': 'test'}, 'added': [], 'removed': [], 'modified': ['docs/test.md']}], 'repository': {'full_name': 'owner/repo'}})
sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
print(f'sha256={sig}')
print(payload)
"

# Отправить
curl -X POST http://localhost:8000/webhook/{project_id} \
  -H 'Content-Type: application/json' \
  -H 'X-Hub-Signature-256: sha256=<sig>' \
  -d '<payload>'
```

### Проверка

1. Туннель запущен, URL открывается в браузере
2. `GET https://abc123.cloudpub.ru/health` → `{"status": "ok"}`
3. Создать проект → вставить туннельный URL в GitHub Webhook Settings → push любой файл → задача появилась в `/tasks`

---

## Этап 6 — Dashboard (TaskList)

Главный экран продукта. Самый большой по объёму.

### Зависимости

- Этап 4
- Бэкенд:
  - **Расширение `TaskSummary`:** `github_sha`, `commit_message`, `commit_author_name`, `commit_author_login`, `project_name`, `current_stage` (см. decisions.md п.1, 2)
  - Расширение `Task` модели: `commit_author_name`, `commit_author_login`, `current_stage` (string nullable) + миграция + заполнение в webhook (`commit_author_*`) и в `pipeline_runner` (`current_stage` обновляется на каждом stage_update)
  - Добавить query-param `?search=` к `GET /tasks` (ILIKE по `file_path` и `commit_message`)
  - Расширить `GET /health` до `{status, pipeline_version, last_webhook_at}` (decisions.md п.4)

### Файлы

- `src/features/tasks/api/tasksApi.ts` — `getTasks`, `getTask`, `getTaskLog`, `updateTask`, `createManualTasks`, `retryTask`, `publishTask`
- `src/features/tasks/model/types.ts` — `TaskSummary`, `TaskDetail`, `TaskStatus` (включая `conflict`)
- `src/features/tasks/model/uiSlice.ts` — `selectedTaskIds`, `batchMode`
- `src/features/tasks/ui/TaskListPage.tsx` — главный экран
- `src/features/tasks/ui/TaskListHeader.tsx` — h1 + stat-chips + search + кнопка
- `src/features/tasks/ui/StatChips.tsx` — 4 чипа из `/analytics`
- `src/features/tasks/ui/StatusTabs.tsx` — табы (без «Готово»)
- `src/features/tasks/ui/TaskListToolbar.tsx` — Выбрать / webhook-индикатор / project-filter popover
- `src/features/tasks/ui/ProjectFilterPopover.tsx` — Radix Popover со списком + поиск
- `src/features/tasks/ui/CommitGroup.tsx` — header коммита + строки задач
- `src/features/tasks/ui/TaskRow.tsx` — строка с типом, путём, проектом, статусом, action
- `src/features/tasks/ui/PipelineProgress.tsx` — pulse-dot + «Pipeline · 12s» (без bar)
- `src/features/tasks/ui/TaskTypeIcon.tsx` — git-commit / upload / terminal в зависимости от github_ref
- `src/features/tasks/ui/QuickAction.tsx` — кнопка справа в строке (Скачать/Повторить/Опубликовать)
- `src/features/tasks/ui/BatchFloatingBar.tsx` — sticky bottom при batchMode
- `src/features/tasks/ui/NewTasksBanner.tsx` — баннер «появилось N новых задач»
- `src/features/tasks/ui/TaskListFooter.tsx` — «Пайплайн SHA · sync · count»
- `src/features/tasks/ui/TaskListSkeleton.tsx`
- `src/features/tasks/ui/TaskListError.tsx`
- `src/features/tasks/ui/TaskListEmpty.tsx` — emptyA / emptyB / emptyFiltered
- `src/features/tasks/ui/TriggerTranslationDialog.tsx` — модалка ручного запуска
- `src/features/tasks/hooks/useTaskFilters.ts` — URL-state через `useSearchParams`
- `src/features/tasks/hooks/usePollNewTasks.ts` — polling + детект новых ID
- `src/features/tasks/lib/groupByCommit.ts` — группировка списка по `github_sha`
- `src/shared/api/healthApi.ts` — `getHealth` с pipeline_version и last_webhook_at

### Детали реализации

- URL state: `?status=...&project_id=...&search=...` через `useSearchParams`
- TaskList использует `getTasks` с фильтрами из URL + `pollingInterval: 15_000`
- `usePollNewTasks` — сравнивает текущий список IDs с предыдущим, если есть новые → показывать `<NewTasksBanner>`
- StatChips — отдельный запрос `/analytics?from=today_00:00`
- Группировка: `groupByCommit(tasks)` — массив `{sha, message, author, tasks[]}`. Manual задачи (github_ref='manual') в отдельной группе с label «Ручной запуск»
- BatchMode: чекбокс слева в строке, Ctrl+click для shift-select, floating bar внизу
- **TriggerTranslationDialog** (модалка ручного запуска): два таба внутри
  - Tab A «Из репозитория» — selectproject + path-input → `GET /projects/{id}/files?path=` показывает список .md под путём (badge «найдено N файлов»). Multi-select. Submit → `POST /tasks/manual` JSON-вариант
  - Tab B «Загрузить файл» — selectproject + target_path + file-upload (drag-and-drop). Submit → `POST /tasks/manual` multipart-вариант
  - **После submit:** показать ответ `{created, task_ids, skipped}`. Если `created > 0` и `skipped` пустой — toast «Создано N задач» + закрыть. Если `skipped` не пустой — раскрыть в модалке секцию «Не созданы» с reason для каждого файла (already_queued / pipeline_running / excluded_by_pattern), кнопка «Закрыть»
- **PipelineProgress (status row на running-задачах)** — показывать имя текущей стадии и elapsed time (например, «Translator · 12 с»). Stage name берётся из нового поля `Task.current_stage` (см. ниже). Elapsed time вычисляется на клиенте через `setInterval(1s)` от `task.updated_at`

### Используемые API

- `GET /tasks?status=&project_id=&search=&limit=&offset=` (расширенный TaskSummary)
- `GET /analytics?from=today_00:00` (для stat-chips, polling 60s)
- `GET /health` (для footer, polling 30s)
- `GET /projects` (для project-filter)
- `GET /projects/{id}/files?path=...` (для file browser в TriggerTranslationDialog)
- `POST /tasks/manual` (создание ручных задач — поддерживает оба варианта: A=files из репо, B=upload)

### Состояния UI

- list (заполненный)
- emptyA — GitHub не подключён
- emptyB — GitHub есть, нет задач
- emptyFiltered — есть задачи, но фильтр не дал результата
- batch (выбраны задачи, floating bar)
- loading — skeleton
- error — retry
- newTasksBanner — overlay над списком

### Локализация

- `tasks.title`, `tasks.trigger_translation`
- `tasks.tabs.*` (5 вкладок без «Готово»)
- `tasks.status.*` (6 статусов)
- `tasks.empty.no_github_title`, `tasks.empty.no_tasks_title`, `tasks.empty.filtered_title`
- `tasks.commit_group.manual_label`
- `tasks.batch.selected`, `tasks.batch.download`, `tasks.batch.publish_ready`
- `tasks.new_tasks_banner`

### Тесты

**Unit:**

- `groupByCommit.test.ts` — webhook задачи группируются, manual в отдельную группу
- `useTaskFilters.test.ts` — URL params читаются и пишутся
- `useBatchSelect.test.ts` — toggle, selectAll, clear

**Integration (MSW):**

- `TaskListPage.test.tsx` — рендер с моком 12 задач, группировка по 4 коммитам видна
- `StatusTabs.test.tsx` — клик меняет URL
- `BatchFloatingBar.test.tsx` — выбор задач → bar появляется, клик «Опубликовать готовые» → mutation

**E2E:**

- `tasks_filter_flow.spec.ts` — login → /tasks → click «Ошибки» tab → URL изменился, в списке только failed → click «Сбросить» → все задачи

### Проверка

1. `/tasks` показывает группы по коммитам
2. Поиск работает (debounced)
3. Фильтр по проекту работает через popover
4. Batch-режим включает чекбоксы и floating bar
5. Появление новых задач (через 15s polling) показывает баннер
6. Manual-запуск через модалку создаёт задачу

---

## Этап 7 — TaskDetail (Diff + Logs + Conflict + 6 состояний)

Сердце продукта — детальная страница задачи.

### Зависимости

- Этап 6
- Бэкенд:
  - Добавить статус `conflict` + поля `conflict_base/ours/theirs` в Task (см. decisions.md п.5)
  - SSE уже есть

### Файлы

- `src/features/tasks/ui/TaskDetailPage.tsx`
- `src/features/tasks/ui/TaskDetailHeader.tsx` — sticky header с pill, action-bar
- `src/features/tasks/ui/TaskDetailTabs.tsx` — Radix Tabs (Diff/Logs/Conflict)
- `src/features/tasks/ui/DiffEditor.tsx` — CodeMirror MergeView (RU read-only / EN editable)
- `src/features/tasks/ui/DiffSaveBar.tsx` — sticky bottom при dirty
- `src/features/tasks/ui/LogsView.tsx` — список этапов, парсит log по префиксам
- `src/features/tasks/ui/LogsStage.tsx` — раскрываемый этап с timing
- `src/features/tasks/ui/ConflictView.tsx` — 3 read-only колонки сверху + editor снизу
- `src/features/tasks/ui/QueuedView.tsx` — RU + countdown «начнётся через ~Ns»
- `src/features/tasks/ui/PublishedHeader.tsx` — pill с link на commit
- `src/features/tasks/ui/RetryConflictDialog.tsx` — диалог при 409 на retry
- `src/features/tasks/ui/PublishConflictDialog.tsx` — диалог при 409 на publish (если уйти со страницы)
- `src/features/tasks/hooks/useSSE.ts` — EventSource wrapper, читает события до status_change
- `src/features/tasks/hooks/useDirty.ts` — beforeunload warning при dirty
- `src/features/tasks/lib/parseLogs.ts` — парсинг log по префиксам стадий
- `src/features/tasks/lib/downloadMd.ts` — экспорт `translated_content` как `.md`-файл

### Детали реализации

- Активная вкладка в URL: `/tasks/:id?tab=diff|logs|conflict`
- Дефолт по статусу: `failed → logs`, `conflict → conflict`, `running → logs`, иначе `diff`
- `useSSE`: подключается только при `status === 'running'`, читает `log_line` и `stage_update`, на `status_change` → закрывает соединение и invalidate cache
- `DiffEditor`: CodeMirror 6 MergeView, левая RU read-only, правая EN editable. Save через явную кнопку → `updateTask` mutation (`PATCH /tasks/{id}`). **CodeMirror виртуализирует видимую область сам** — внешняя `react-virtual`-обёртка не нужна
- `LogsView`: парсит `task.log` (split по строкам) + live строки из useSSE. Группирует по префиксам стадий (regex)
- `ConflictView`: 3 колонки сверху (base/ours/theirs read-only), editor снизу. Radio-toggle «Использовать наш перевод / Текущий EN» → перезаписывает editor. Bottom bar с кнопкой «Опубликовать»
- `QueuedView` справа от RU: countdown timer от среднего avg_duration_seconds из /analytics
- `PublishedHeader`: link на commit_url из `Publication`, отображает `published_at` relative
- `RetryConflictDialog`: при 409 на retry — title, body с SHA, 3 кнопки

### Используемые API

- `GET /tasks/{id}`
- `GET /tasks/{id}/log`
- `GET /tasks/{id}/events` (SSE)
- `PATCH /tasks/{id}` (update translated_content)
- `POST /tasks/{id}/retry` (force=true)
- `POST /tasks/{id}/publish`
- `POST /tasks/manual` (для «создать новую с актуальным файлом»)

### Состояния UI

- queued — RU left + countdown right
- running — Logs auto-active + SSE
- done — Diff auto-active
- failed — Logs auto-active + retry button
- conflict — Conflict auto-active
- published — Diff (read-only EN) + published-link header

### Локализация

- `task.tabs.*`
- `task.diff.save`, `task.diff.discard`
- `task.logs.runtime`, `task.logs.copy`
- `task.conflict.use_ours`, `task.conflict.use_theirs`
- `task.queued.starts_in`
- `task.published.label`
- `task.retry.conflict_title`, `task.retry.conflict_body`, `task.retry.create_new`, `task.retry.use_old`

### Тесты

**Unit:**

- `parseLogs.test.ts` — group by stage prefix
- `useDirty.test.ts` — beforeunload event с dirty
- `downloadMd.test.ts` — корректное содержимое + filename

**Integration (MSW):**

- `TaskDetailPage.test.tsx` — каждое из 6 состояний рендерится корректно
- `DiffEditor.test.tsx` — изменение текста → save → `PATCH /tasks/{id}`
- `ConflictView.test.tsx` — radio toggle перезаписывает editor

**E2E (`e2e/task_publish_flow.spec.ts`):**

- Open running task → see logs streaming → wait status_change → tab switches to Diff → edit → save → publish → status published

### Проверка

1. Все 6 состояний работают
2. SSE обновляет логи в real-time
3. Save в Diff таб работает + beforeunload warning
4. Conflict resolution через editor → publish
5. Retry с force=true работает

---

## Этап 8 — History

Лента публикаций.

### Зависимости

- Этап 4

### Файлы

- `src/features/history/api/historyApi.ts` — `getHistory`
- `src/features/history/model/types.ts`
- `src/features/history/ui/HistoryPage.tsx`
- `src/features/history/ui/HistoryToolbar.tsx` — фильтры (project, user, date range)
- `src/features/history/ui/HistoryItem.tsx` — карточка
- `src/features/history/ui/DateRangePicker.tsx` — react-day-picker в Radix Popover
- `src/features/history/hooks/useHistoryFilters.ts` — URL state
- `src/pages/HistoryPage.tsx`

### Детали реализации

- URL filters: `?project_id=&published_by=&from=&to=`
- Infinite scroll через `useInfiniteQuery`-подобный паттерн на RTK Query (или ручная пагинация с «Загрузить ещё»)
- Карточка: avatar + имя + date + commit-sha mono, file_path mono, source→target, link на commit

### Используемые API

- `GET /history?project_id=&published_by=&from=&to=&limit=&offset=`

### Состояния UI

- list, empty, loading, error

### Локализация

- `history.*`

### Тесты

**Integration:**

- `HistoryPage.test.tsx` — 5 публикаций рендерятся, фильтр по project работает

### Проверка

- `/history` показывает публикации, фильтры работают
- Клик на commit-link открывает GitHub в новой вкладке

---

## Этап 9 — Analytics

Графики и статистика.

### Зависимости

- Этап 4
- Этап 8 (переиспользуем паттерн фильтров, layout и состояний из `HistoryPage`)
- Backend prerequisite: сначала расширить контракт `GET /analytics`, только потом собирать UI

### Файлы

- `src/features/analytics/api/analyticsApi.ts` — единая точка для analytics query + stats query
- `src/shared/api/analyticsApi.ts` — временный re-export на feature api, чтобы не дублировать endpoints
- `src/features/analytics/model/types.ts`
- `src/features/analytics/hooks/useAnalyticsFilters.ts`
- `src/features/analytics/lib/buildTasksPerDaySeries.ts`
- `src/features/analytics/lib/buildSuccessRateSeries.ts`
- `src/features/analytics/lib/buildAnalyticsCsvRows.ts`
- `src/features/analytics/ui/AnalyticsPage.tsx`
- `src/features/analytics/ui/AnalyticsToolbar.tsx`
- `src/features/analytics/ui/StatCard.tsx` — 4 карточки сверху
- `src/features/analytics/ui/TasksPerDayChart.tsx` — recharts stacked bar
- `src/features/analytics/ui/SuccessRateChart.tsx` — recharts line
- `src/features/analytics/ui/TopErrorsTable.tsx`
- `src/features/analytics/ui/ExportCsvButton.tsx` — papaparse blob download
- `src/pages/AnalyticsPage/index.tsx`
- `src/locales/ru/analytics.json`
- `src/shared/lib/i18n.ts`

### Детали реализации

- Не создавать второй analytics api рядом с существующим shared-запросом. Текущий `shared/api/analyticsApi.ts`, который уже используют `StatChips` и `TaskDetailPage`, переводим в feature-слой и оставляем совместимый re-export на время миграции.
- `useGetAnalyticsQuery({ project_id, from, to })` — основной запрос страницы аналитики, query params собираются без пустых значений.
- `useGetAnalyticsStatsQuery()` сохраняется для dashboard stat-chips и queued countdown, но живёт в том же analytics api module.
- Фильтры страницы хранятся в URL через `useSearchParams` по образцу `useHistoryFilters`: `project_id`, `from`, `to`.
- Визуальный стиль страницы — только через существующие shared-компоненты и соседние паттерны:
  - toolbar как в `HistoryPage`
  - `Select`, `DateRangePicker`, `Button`
  - контейнеры графиков и таблицы через `SectionCard`
  - состояния через `EmptyState` и `Skeleton`
- StatCards: total tasks, success rate, avg duration, published count в выбранном диапазоне.
- Stacked bar: `tasks_per_day` по статусам с цветами из палитры `StatusPill`.
- Line chart: success rate per day считается на фронте из тех же per-day status buckets, отдельный backend field не нужен.
- TopErrorsTable: строки `error_type | count | visual proportion bar`.
- CSV экспорт строится не из raw response, а из нормализованной per-day серии. Формат: `date,total,done,failed,published,success_rate`.
- Пустое состояние: если в диапазоне нет данных, графики не рендерим, показываем `EmptyState` с кнопкой сброса фильтров.
- Ошибки запроса — отдельный error state, без silent fail.

### Используемые API

- `GET /analytics?project_id=&from=&to=`

Минимальный backend contract для этапа:

- `total_tasks`
- `success_rate`
- `avg_duration_seconds`
- `published_count`
- `tasks_by_status`
- `tasks_per_day: [{ date, queued, running, done, failed, published, conflict }]`
- `top_errors`

### Локализация

- `analytics.*`

### Тесты

**Unit:**

- `buildSuccessRateSeries.test.ts` — расчёт процента успеха по дневным bucket-данным
- `csvExport.test.ts` — генерация CSV корректная

**Integration:**

- `AnalyticsPage.test.tsx` — графики получают данные из мока, фильтры меняют query args, empty/error states отображаются корректно

### Проверка

- Графики отображаются, фильтры работают
- Фильтры живут в URL и переживают reload
- CSV экспортируется с правильным содержимым

---

## Этап 10 — Dictionaries

Read-only просмотр словарей.

### Зависимости

- Этап 4

### Файлы

- `src/features/dictionaries/api/dictionariesApi.ts`
- `src/features/dictionaries/ui/DictionariesPage.tsx`
- `src/features/dictionaries/ui/DictionarySidebar.tsx` — список 7 типов
- `src/features/dictionaries/ui/DictionaryView.tsx` — таблица или textarea для prompt
- `src/features/dictionaries/ui/MvpBanner.tsx` — «редактирование будет в следующей версии»
- `src/pages/DictionariesPage.tsx`

### Детали реализации

- Routes: `/dictionaries` (default) и `/dictionaries/:type`
- Search bar по `key` (клиентский фильтр)
- Source-chip: `base` серый, `user` синий
- Для prompt — большая read-only textarea

### Используемые API

- `GET /dictionaries/{type}`

### Локализация

- `dictionaries.*`

### Тесты

**Integration:**

- `DictionariesPage.test.tsx` — переключение типов, фильтр по key работает

### Проверка

- Все 7 типов открываются, banner виден

---

## Этап 11 — Settings

Профиль, GitHub, уведомления (заглушка).

### Зависимости

- Этапы 2, 4

### Файлы

- `src/features/settings/ui/SettingsLayout.tsx` — sub-nav слева + content справа
- `src/features/settings/ui/ProfilePage.tsx`
- `src/features/settings/ui/ChangePasswordForm.tsx`
- `src/features/settings/ui/PipelineVersionCard.tsx` — карточка с SHA из `/health`
- `src/features/settings/ui/GithubPage.tsx`
- `src/features/settings/ui/GithubErrorBanner.tsx` — читает `?github_error=...` из URL, показывает переведённое сообщение
- `src/features/settings/ui/NotificationsPage.tsx`
- `src/pages/SettingsPage.tsx`

### Детали реализации

- Routes: `/settings/profile`, `/settings/github`, `/settings/notifications`
- Profile:
  - avatar + display_name + email (read-only) + change_password form
  - Секция «Версия пайплайна» — карточка с SHA из `getHealth.pipeline_version` (mono-шрифт), линк «Открыть на GitHub» если SHA есть
  - **Без timezone-селектора в MVP** — поле в `User` отсутствует, добавлять не будем; зафиксировать в задачах post-MVP
- GitHub:
  - status banner: подключён (зелёная иконка + github_login + кнопка «Отвязать» с `<ConfirmDialog danger>`) или не подключён (CTA «Привязать»)
  - При не подключённом: кнопка «Привязать GitHub» через `window.location.href = '/api/auth/github/connect'`
  - **GithubErrorBanner** — если в URL `?github_error=access_denied` или другой код, показывает красный баннер «Не удалось привязать GitHub: пользователь отказал в доступе» (или generic). Параметр чистится из URL при mount через `navigate(pathname, { replace: true })`
- Notifications: banner «в следующей версии», disabled empty state

### Используемые API

- `POST /auth/change-password`
- `DELETE /auth/github/connect`
- `GET /notifications/channels` (returns [])

### Локализация

- `settings.*`
- `settings.github.errors.access_denied`, `settings.github.errors.generic`

### Тесты

**Integration:**

- `ChangePasswordForm.test.tsx` — submit с правильными данными, ошибка при rate limit

### Проверка

- Профиль показывает данные пользователя
- Смена пароля работает
- Disconnect GitHub работает

---

## Этап 12 — Cross-cutting features

Большой финальный блок разбиваем на небольшие независимые подэтапы, чтобы их можно было брать в работу и выкатывать по одному.

### Разбивка

- **12a** — служебные заглушки для неготовых страниц
- **12b** — onboarding для первого входа
- **12c** — command palette (`Cmd+K`)
- **12d** — `404` и глобальный `ErrorBoundary`
- **12e** — UX-polish: `beforeunload` для dirty-состояния и promise-toasts

---

## Этап 12a — Служебные заглушки для неготовых страниц

Маршруты уже могут быть нужны в UI, но сам контент ещё не готов. Для них вводим единый безопасный шаблон-заглушку.

### Файлы

- `src/pages/PageInDevelopmentPage/index.tsx`
- `src/pages/PageInDevelopmentPage/PageInDevelopmentPage.module.css`
- `src/app/router/index.tsx`

### Детали реализации

- Общая заглушка с заголовком, кратким пояснением и кнопкой возврата
- Первые маршруты: `/terms`, `/privacy`
- Паттерн должен переиспользоваться и для других служебных страниц MVP, если на них уже ссылается интерфейс

### Локализация

- `common.page_in_development_title`
- `common.page_in_development_description`
- `common.terms_title`
- `common.privacy_title`

### Проверка

1. Переход на `/terms` и `/privacy` не приводит на пустой экран или 404
2. Пользователь понимает, что страница ещё не готова, и может вернуться назад

---

## Этап 12b — Onboarding для первого входа

Показываем новый пользовательский сценарий пошагово, не смешивая его с остальными cross-cutting задачами.

### Зависимости

- Этапы 5, 11

### Файлы

- `src/app/OnboardingDialog.tsx` — модалка с 3 шагами
- `src/app/OnboardingDialog.module.css`
- `src/app/App.tsx` или точка подключения onboarding в app-shell

### Детали реализации

- `OnboardingDialog` показывается при условии `user.github_linked === false || projects.length === 0`
- Skip ставит `localStorage`-флаг `onboarding_skipped=true`; при следующем входе диалог не открывается
- Внутри — state machine `currentStep: 1 | 2 | 3`
- **Шаг 1 «Привязать GitHub»**: иконка `lucide:github`, CTA ведёт на `/api/auth/github/connect`; после успешного возврата пользователь автоматически попадает на шаг 2
- **Шаг 2 «Создать проект»**: иконка `lucide:folder-git`, CTA закрывает диалог и ведёт на `/repositories/new`; если проект уже появился, автоматически открывается шаг 3
- **Шаг 3 «Настроить webhook»**: иконка `lucide:webhook`, текст с инструкцией про URL и secret, ссылка на GitHub Webhook docs, кнопка «Готово» завершает onboarding
- Сверху stepper на 3 шага, снизу — `Пропустить онбординг` и primary-action текущего шага

### Локализация

- `onboarding.*`

### Тесты

**Integration:**

- `OnboardingDialog.test.tsx` — показывается при нужных условиях, Skip сохраняет флаг

**E2E (`e2e/onboarding_flow.spec.ts`):**

- Newly registered user → onboarding modal появляется → Skip → modal закрыт + localStorage флаг

### Проверка

1. Новый пользователь видит onboarding после регистрации
2. Skip скрывает диалог и не даёт ему открываться повторно на следующем reload
3. При уже привязанном GitHub и существующем проекте onboarding не показывается

---

## Этап 12c — Command Palette (`Cmd+K`)

Быстрый доступ к задачам, проектам и системным действиям отдельным этапом, без смешения с onboarding и обработкой ошибок.

### Зависимости

- Этапы 4, 5, 6

### Файлы

- `src/features/cmdk/ui/CommandPalette.tsx` — `cmdk` Dialog
- `src/features/cmdk/hooks/useCmdkData.ts` — поиск по tasks / projects / actions

### Детали реализации

- Палитра открывается через `useSelector(cmdkSlice.selectors.isOpen)`; хоткей `Cmd+K` уже зарегистрирован в layout
- Основа — `Radix Dialog` шириной около 640px с полем поиска и секциями результатов
- Поиск группированный: задачи, проекты, действия
- Для задач достаточно последних 50 элементов с ограничением до 5 совпадений в выдаче
- Действия — статический список быстрых переходов (`создать проект`, `перейти к задачам`, `открыть настройки` и т.д.)
- Навигация по Enter ведёт сразу на выбранный маршрут и закрывает палитру

### Используемые API

- `GET /tasks`
- `GET /projects`

### Локализация

- `cmdk.*`

### Тесты

**Unit:**

- `useCmdkData.test.ts` — фильтрация по поисковому запросу

**Integration:**

- `CommandPalette.test.tsx` — поиск работает, навигация по результатам корректна

### Проверка

1. `Cmd+K` открывает палитру из любой основной страницы
2. Поиск находит задачи и проекты
3. Выбор результата переводит на нужный экран и закрывает диалог

---

## Этап 12d — `404` и глобальный `ErrorBoundary`

Изолируем обработку несуществующих маршрутов и необработанных ошибок в отдельный шаг, чтобы не связывать его с UX-улучшениями.

### Зависимости

- Этап 4

### Файлы

- `src/pages/NotFoundPage.tsx`
- `src/app/ErrorBoundary.tsx` — Sentry catch + fallback UI
- `src/app/router/index.tsx`
- точка оборачивания всего приложения в `ErrorBoundary`

### Детали реализации

- Для несуществующих URL появляется отдельная `404`-страница с крупным кодом ошибки и CTA «На главную»
- `ErrorBoundary` оборачивает всё приложение, перехватывает unhandled errors и отправляет их в Sentry
- Пользователь вместо white screen получает безопасный fallback с коротким пояснением и кнопкой возврата
- Fallback UI не должен ломать базовую навигацию и повторный вход в приложение после reload

### Локализация

- `notFound.*`
- при необходимости `errors.boundary_*`

### Проверка

1. Переход на несуществующий URL показывает `404`, а не пустой экран
2. Искусственно брошенная ошибка рендерит fallback и не валит всё приложение бесконечным циклом
3. Событие ошибки уходит в Sentry при включённом DSN

---

## Этап 12e — UX-polish для асинхронных и dirty-сценариев

Мелкие, но полезные улучшения поведения интерфейса, которые не должны блокировать остальные подпункты этапа 12.

### Зависимости

- Этапы 1, 7

### Файлы

- `src/shared/ui/Toast/setup.tsx` — расширить, добавить promise-toasts
- `src/shared/hooks/useDirty.ts` или существующая точка хранения dirty-состояния
- экраны с редактированием, где уже есть unsaved changes

### Детали реализации

- Добавить promise-toasts для длинных асинхронных действий, где пользователю полезно видеть стадии `loading / success / error`
- Вынести `beforeunload`-логику в переиспользуемый `useDirty`-механизм
- Предупреждение о закрытии вкладки показывать только когда в приложении действительно есть несохранённые изменения
- Подключать dirty-проверку только в тех местах, где уже есть редактируемое состояние, без искусственного расширения на весь проект

### Тесты

**Unit / Integration:**

- `useDirty.test.ts` — флаг включается и снимается корректно
- smoke-тест для promise-toast обвязки на success/error сценариях

### Проверка

1. При наличии несохранённых изменений браузер предупреждает о закрытии вкладки
2. Без dirty-состояния предупреждение не появляется
3. Длинные асинхронные операции показывают последовательный toast-статус

---

## Этап 13 — Финальная сборка

### Что делаем

- Пройтись по `frontend/docs/designs/` и сверить каждый экран с кодом (visual diff)
- Проверить все state'ы каждой страницы (loading, error, empty)
- E2E: полный happy path — register → connect github → create project → simulate webhook (через бэкенд интеграционный тест) → see task → publish
- Проверить что все строки в JSX обёрнуты в `t('...')`
- Bundle size — `npm run build`, посмотреть `dist/stats.html`, выявить тяжёлые зависимости
- Lighthouse — performance score > 90 на главной
- **Sentry source maps**: установить `@sentry/vite-plugin` (devDep), добавить в `vite.config.ts`. При build плагин загружает source maps в Sentry и удаляет их из публичного бандла. Требует `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` в env (CI). Без него Sentry будет показывать минифицированные стек-трейсы
- **`.env` шаблоны:**
  - `frontend/.env.example` — пример переменных (`VITE_SENTRY_DSN=`, `VITE_PROXY_TARGET=http://localhost:8000`)
  - `frontend/.env.development` — dev-только переменные, добавить в `.gitignore`
  - `frontend/.env.production` — production-переменные (только `VITE_SENTRY_DSN`), также в `.gitignore`. На сервере деплой кладёт `.env.production` через CI secrets
- Sentry init гейтится `import.meta.env.PROD && VITE_SENTRY_DSN` (уже сделано на Этапе 1) — проверить что в dev сетевых запросов к Sentry нет
- Доки: обновить `frontend/README.md`, добавить command shortcuts (`Cmd+K` и т.п.)

### Безопасность — финальный чеклист

- HttpOnly session cookie приходит с бэка — frontend не управляет
- CSRF не нужен (cookie + сервер на одном домене за nginx)
- Webhook secret не показывается дважды — только в WebhookSecretModal
- `dangerouslySetInnerHTML` — только для markdown preview через `react-markdown` (sanitized)
- Source maps — генерировать при build, загружать в Sentry, не публиковать в production бандле
- Все формы пользовательского ввода валидируются через zod до отправки

---

## Порядок этапов

```
1   Базовая инфраструктура (design tokens, shared UI)
2   RTK Query + Auth bootstrap + Protected routes
3   Auth pages (Login + Register)
4   Layout + Sidebar
5   Repositories (list + create + WebhookSecretModal)
5а  Туннель для webhook-тестирования (Cloudpub)       ← настроить перед этапом 6
6   Dashboard (TaskList)
7   TaskDetail (Diff + Logs + Conflict)
8   History
9   Analytics
10  Dictionaries
11  Settings
12  Cross-cutting features (umbrella)
12a Заглушки для служебных страниц
12b Onboarding для первого входа
12c Command Palette (`Cmd+K`)
12d 404 + ErrorBoundary
12e UX-polish: beforeunload + promise-toasts
13  Финальная сборка
```

Этапы 1–4 — фундамент, без UI-фич, но обязательны.
Этапы 5–5а — подготовка: создание проекта + туннель для реального webhook.
Этапы 6–7 — основной MVP-флоу: задача → детали → публикация.
Этапы 8–11 — вспомогательные экраны.
Этапы 12a–12e — cross-cutting features.
Этап 13 — polish.

---

## Какие изменения нужны в бэкенде по этапам

| Этап | Изменения в API/моделях                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5    | + `POST /projects/{id}/regenerate-webhook-secret`, + `GET /me/github-repos` (обёртка над `GitHubClient.get_user_repos()`)                                                                                                                                                                                                                                                                                                                                                                   |
| 6    | Расширить `TaskSummary`: `github_sha`, `commit_message`, `commit_author_name`, `commit_author_login`, `project_name`, `current_stage`. Расширить `Task` модель: `commit_author_name`, `commit_author_login`, `current_stage`. Миграция. Заполнение `commit_author_*` в webhook, `current_stage` в `pipeline_runner` на каждом stage_update. + `?search=` (ILIKE по `file_path` и `commit_message`) в `GET /tasks`. Расширить `GET /health` до `{status, pipeline_version, last_webhook_at}` |
| 7    | + статус `conflict` в Task (CHECK constraint обновить) + поля `conflict_base/ours/theirs` (text nullable) + миграция. `pipeline_runner` сбрасывает их на `null` при старте. На успешный publish — обратно `null` + `status='published'`                                                                                                                                                                                                                                                     |
| 9    | Расширить `GET /analytics`: добавить `published_count`; изменить `tasks_per_day` с массива `{date, count}` на массив дневных bucket-ов по статусам `{date, queued, running, done, failed, published, conflict}`. Текущие агрегаты (`total_tasks`, `success_rate`, `avg_duration_seconds`, `tasks_by_status`, `top_errors`) сохранить без breaking changes                                                                                                                                   |

Все остальные этапы используют существующее API без изменений.

---

## Этап 14 — Admin Panel

Реализация разбита на 4 подэтапа.

### 14.1 — Backend: миграции + invite-система + CLI

**Модели:**

- `User`: добавить `is_admin: bool = False` + миграция
- Новая таблица `invite_tokens`: `id` UUID PK, `token` UUID unique, `created_by_id FK users`, `used_by_id FK users nullable`, `expires_at datetime nullable`, `created_at datetime`

**Регистрация:**

- `UserRegister` + `UserRead` расширить полем `is_admin`
- `POST /auth/register` принимает опц. `invite_token: str | None`
- Если таблица `invite_tokens` не пуста → токен обязателен (400 если не передан или недействителен)
- Действителен: существует, `used_by_id IS NULL`, `expires_at IS NULL OR expires_at > now()`
- После создания пользователя → `token.used_by_id = new_user.id`

**CLI:**

- `backend/app/cli.py` — команда `create-admin --email --password`
- Создаёт User с `is_admin=True`, обходит invite-проверку

**Auth dependency:**

- `require_admin` в `app/services/auth.py` — проверяет `current_user.is_admin`, иначе 403

### 14.2 — Backend: Admin API

Все маршруты в `backend/app/api/routes/admin.py`, prefix `/admin`, зависимость `require_admin`.

| Метод    | URL                         | Что делает                                                   |
| -------- | --------------------------- | ------------------------------------------------------------ |
| `GET`    | `/admin/users`              | Список всех пользователей с task_count                       |
| `PATCH`  | `/admin/users/{id}`         | Обновить `is_admin`                                          |
| `DELETE` | `/admin/users/{id}`         | Удалить пользователя и его задачи                            |
| `GET`    | `/admin/invite-tokens`      | Список токенов                                               |
| `POST`   | `/admin/invite-tokens`      | Создать токен (`expires_in_days` опц.)                       |
| `DELETE` | `/admin/invite-tokens/{id}` | Отозвать (expires_at = now)                                  |
| `GET`    | `/admin/tasks`              | Все задачи всех пользователей (фильтры: `user_id`, `status`) |

Схемы: `backend/app/schemas/admin.py` — `AdminUserRead`, `AdminUserUpdate`, `AdminTaskRead`, `InviteTokenRead`, `InviteTokenCreate`

### 14.3 — Frontend: routing + guard + sidebar + register invite

**Файлы:**

- `src/features/admin/model/AdminRoute.tsx` — если `!user?.is_admin` → redirect `/tasks`
- `src/app/router/index.tsx` — добавить `/admin` под `<AdminRoute>`
- `src/shared/ui/Sidebar/Sidebar.tsx` — секция «АДМИНИСТРИРОВАНИЕ» при `user.is_admin`, пункт «Панель» (иконка звезды, indigo-подсветка при active)
- `src/shared/ui/Sidebar/UserBlock.tsx` — бейдж «admin» (indigo pill) при `user.is_admin`
- `src/features/auth/ui/RegisterForm.tsx` — читать `?invite=<token>` из URL, передавать в `POST /auth/register`
- `src/locales/ru/admin.json`

### 14.4 — Frontend: Admin page + секции

**Файлы:**

- `src/features/admin/api/adminApi.ts` — RTK Query: getAdminUsers, promoteUser, deleteUser, getAdminTasks, getInviteTokens, createInviteToken, revokeInviteToken
- `src/features/admin/ui/AdminPage/AdminPage.tsx` — страница: заголовок + три секции (скролл)
- `src/features/admin/ui/AdminPage/AdminPage.module.css`
- `src/features/admin/ui/UsersSection/UsersSection.tsx` — таблица пользователей с действиями
- `src/features/admin/ui/InvitesSection/InvitesSection.tsx` — таблица токенов + создание + copy ссылки
- `src/features/admin/ui/TasksSection/TasksSection.tsx` — таблица всех задач с фильтрами
- `src/pages/AdminPage/index.tsx`

**Порядок:**

```
14.1  backend: модели + миграция + invite в register + CLI + require_admin
14.2  backend: /admin/* endpoints + схемы
14.3  frontend: AdminRoute + sidebar + RegisterForm invite
14.4  frontend: adminApi + AdminPage + три секции
```

---

## Этап 15 — Команда (совместная работа)

Позволяет объединить нескольких пользователей в команду с общим пространством задач и репозиториев. У каждого пользователя не более одной команды плюс личное пространство. Задачи видны всем участникам. Репозитории создаёт только владелец.

Реализация разбита на 5 подэтапов.

### Ключевые решения

| Вопрос                      | Решение                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| Название                    | «Команда» (не «группа») — везде в UI и коде                                |
| Ролей                       | Две: `owner` (владелец) и `member` (участник)                              |
| Команд на пользователя      | Максимум одна + личное пространство                                        |
| Видимость задач             | Все участники видят все задачи команды                                     |
| Управление репозиториями    | Только владелец создаёт / редактирует / удаляет проекты                    |
| GitHub-токен при запуске    | Всегда токен владельца проекта; участник может опционально подключить свой |
| Авторство задачи из webhook | Задача принадлежит владельцу проекта                                       |
| Приглашение                 | Владелец генерирует group-invite ссылку                                    |
| Аналитика                   | Фильтр по команде — нужен                                                  |
| Уведомления                 | Post-MVP                                                                   |
| Существующие данные         | Все старые пользователи и проекты становятся личными (`team_id = NULL`)    |

### Матрица прав

| Действие                                    | Владелец | Участник |
| ------------------------------------------- | :------: | :------: |
| Видеть задачи команды                       |    ✓     |    ✓     |
| Редактировать / публиковать задачи          |    ✓     |    ✓     |
| Создавать / редактировать / удалять проекты |    ✓     |    —     |
| Просматривать репозитории команды           |    ✓     |    ✓     |
| Управлять участниками                       |    ✓     |    —     |
| Генерировать invite-ссылки                  |    ✓     |    —     |
| Переименовывать команду                     |    ✓     |    —     |
| Удалять команду                             |    ✓     |    —     |
| Покинуть команду                            |    —     |    ✓     |

---

### 15.1 — Backend: модели + миграции + Team API

**Новые таблицы:**

- `teams`: `id` UUID PK, `name` str(100) not null, `owner_id` FK users not null, `created_at` datetime
- `team_members`: `id` UUID PK, `team_id` FK teams, `user_id` FK users, `joined_at` datetime; UNIQUE(team_id, user_id); FK `user_id` с `ON DELETE CASCADE`
- `team_invites`: `id` UUID PK, `team_id` FK teams, `token` UUID unique not null, `created_by` FK users, `used_by_id` FK users nullable, `expires_at` datetime nullable, `created_at` datetime

**Расширение существующих таблиц:**

- `projects`: добавить `team_id` UUID nullable FK teams `ON DELETE SET NULL`; NULL = личный проект
- `tasks`: добавить `team_id` UUID nullable FK teams `ON DELETE SET NULL`; заполняется из `project.team_id` при создании задачи

**Миграция:**

- Добавить новые таблицы в указанном порядке (сначала `teams`, затем `team_members`, затем `team_invites`)
- Добавить колонки `team_id` в `projects` и `tasks` (nullable, дефолт NULL)
- Существующие строки получают `team_id = NULL`

**Схемы (`backend/app/schemas/team.py`):**

```
TeamCreate      { name: str }
TeamRead        { id, name, owner_id, created_at, member_count: int }
TeamMemberRead  { user_id, email, display_name, github_linked, joined_at, role: 'owner'|'member' }
TeamDetail      { ...TeamRead, members: list[TeamMemberRead] }
TeamInviteRead  { id, token, created_by_email, used_by_email|None, expires_at|None, created_at, status: 'active'|'used'|'expired' }
TeamInviteCreate { expires_in_days: int | None = Field(None, ge=1) }
TeamJoin        { token: UUID }
```

**API (`backend/app/api/routes/teams.py`, prefix `/teams`):**

| Метод    | URL                           | Что делает                                                                                           | Кто может                                     |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `POST`   | `/teams`                      | Создать команду (текущий user становится владельцем и первым участником)                             | Любой аутентифицированный, у кого нет команды |
| `GET`    | `/teams/me`                   | Информация о своей команде + участники                                                               | Любой участник команды                        |
| `PATCH`  | `/teams/me`                   | Переименовать команду                                                                                | Только владелец                               |
| `DELETE` | `/teams/me`                   | Удалить команду (каскадно удаляет team_members и team_invites; проекты/задачи получают team_id=NULL) | Только владелец                               |
| `DELETE` | `/teams/me/members/{user_id}` | Исключить участника                                                                                  | Только владелец                               |
| `POST`   | `/teams/me/leave`             | Покинуть команду                                                                                     | Только участник (не владелец)                 |
| `GET`    | `/teams/me/invites`           | Список invite-токенов команды                                                                        | Только владелец                               |
| `POST`   | `/teams/me/invites`           | Создать invite-токен                                                                                 | Только владелец                               |
| `DELETE` | `/teams/me/invites/{id}`      | Отозвать invite-токен (expires_at = now)                                                             | Только владелец                               |
| `POST`   | `/teams/join`                 | Вступить в команду по токену                                                                         | Любой аутентифицированный, у кого нет команды |

**Dependency `require_no_team`** — 400 если пользователь уже состоит в команде (для `POST /teams` и `POST /teams/join`).

**Dependency `require_team_member`** — проверяет что `current_user` состоит в `team_members` для запрошенной команды (через `teams/me` маршрут — достаточно проверить что у пользователя есть команда).

**Dependency `require_team_owner`** — дополнительно проверяет `team.owner_id == current_user.id`.

**Файлы:**

- `backend/app/models/team.py` — модели `Team`, `TeamMember`, `TeamInvite`
- `backend/app/schemas/team.py` — схемы выше
- `backend/app/api/routes/teams.py` — маршруты выше
- `backend/app/api/router.py` — подключить `teams_router`
- `backend/migrations/versions/XXXX_add_teams.py`

---

### 15.2 — Backend: расширение Projects + Tasks для командного контекста

**`GET /projects`** — возвращать проекты текущего пользователя (личные, `team_id=NULL`) + проекты его команды (если состоит). Добавить поле `team_id: UUID | None` и `is_team_project: bool` в `ProjectRead`.

**`POST /projects`** — добавить опц. поле `team_id` в `ProjectCreate`. Если указан и пользователь состоит в этой команде → проект создаётся с `team_id`. Если `team_id` не `None` и пользователь не владелец — 403. Владелец проекта = тот, кто его создал (`user_id`).

**`GET /tasks`** — если `team_id` пользователя не NULL, возвращать задачи где `task.user_id = current_user.id OR task.team_id = current_user.team_id`. Добавить поля `team_id` и `is_team_task: bool` в `TaskSummary`.

**Webhook**: при создании задачи через webhook — `task.team_id = project.team_id`.

**GitHub-токен при запуске задачи**: `pipeline_runner` берёт `github_token` владельца проекта (`project.user_id`), не запускающего пользователя. Это гарантирует что у pipeline всегда есть доступ к репозиторию.

**Расширить `ProjectRead`:**

```python
team_id: UUID | None
is_team_project: bool
```

**Расширить `TaskSummary`:**

```python
team_id: UUID | None
is_team_task: bool
```

**Файлы:**

- `backend/app/api/routes/projects.py` — изменить `get_projects`, `create_project`
- `backend/app/api/routes/tasks.py` — изменить `get_tasks` (расширить WHERE)
- `backend/app/schemas/project.py` — добавить поля в `ProjectRead`, `ProjectCreate`
- `backend/app/schemas/task.py` — добавить поля в `TaskSummary`

---

### 15.3 — Frontend: страница управления командой в Settings

**Новый раздел в Settings:** `/settings/team`

**Если пользователь не состоит в команде:**

- Форма создания: поле `name` (required) + кнопка «Создать команду»
- После успеха — страница переходит в режим «команда создана»

**Если пользователь — владелец команды:**

- Название команды (редактируемое, inline-edit)
- Список участников (таблица: avatar + email + display_name + дата + кнопка «Исключить» с ConfirmDialog)
- Блок invite-токенов: список активных токенов с «Копировать ссылку», «Отозвать»; форма создания нового токена с полем `expires_in_days`
- Опасная зона: «Удалить команду» (ConfirmDialog с вводом названия команды)

**Если пользователь — участник (не владелец):**

- Название команды (read-only), имя владельца
- Список участников (read-only, без кнопок)
- Кнопка «Покинуть команду» с ConfirmDialog

**Файлы:**

- `frontend/src/features/teams/api/teamsApi.ts` — RTK Query: `getMyTeam`, `createTeam`, `renameTeam`, `deleteTeam`, `removeMember`, `leaveTeam`, `getTeamInvites`, `createTeamInvite`, `revokeTeamInvite`
- `frontend/src/features/teams/model/types.ts` — `TeamRead`, `TeamDetail`, `TeamMemberRead`, `TeamInviteRead`, `TeamInviteCreate`
- `frontend/src/features/teams/ui/TeamSettingsPage/TeamSettingsPage.tsx`
- `frontend/src/features/teams/ui/TeamSettingsPage/TeamSettingsPage.module.css`
- `frontend/src/features/teams/ui/CreateTeamForm/CreateTeamForm.tsx`
- `frontend/src/features/teams/ui/MembersTable/MembersTable.tsx`
- `frontend/src/features/teams/ui/TeamInvitesSection/TeamInvitesSection.tsx`
- `frontend/src/app/router/index.tsx` — добавить `/settings/team`
- `frontend/src/features/settings/ui/SettingsLayout.tsx` — добавить пункт «Команда» в sub-nav
- `frontend/src/locales/ru/teams.json`

**Локализация (`teams.json`):**

```json
{
  "section_title": "Команда",
  "no_team_title": "Вы не состоите в команде",
  "create_team": "Создать команду",
  "team_name_label": "Название команды",
  "members_section": "Участники",
  "invites_section": "Приглашения",
  "invite_copy": "Копировать ссылку",
  "invite_revoke": "Отозвать",
  "invite_create": "Создать приглашение",
  "invite_expires_days": "Срок действия (дней)",
  "invite_expires_never": "Бессрочно",
  "remove_member": "Исключить",
  "remove_member_confirm": "Исключить участника {{email}} из команды?",
  "leave_team": "Покинуть команду",
  "leave_team_confirm": "Покинуть команду «{{name}}»? Ваши личные задачи и репозитории сохранятся.",
  "delete_team": "Удалить команду",
  "delete_team_confirm": "Удалить команду «{{name}}»? Все участники потеряют доступ. Репозитории и задачи станут личными.",
  "owner_badge": "Владелец",
  "member_badge": "Участник",
  "invite_copied": "Ссылка скопирована"
}
```

---

### 15.4 — Frontend: страница вступления в команду

**Маршрут:** `/teams/join?token=XXX`

Доступен только для авторизованных пользователей без команды.

**Сценарии:**

- **Токен валидный, пользователь без команды** — показать карточку с названием команды и кнопкой «Вступить». По клику → `POST /teams/join { token }` → редирект `/settings/team`
- **Токен невалидный / истёк / использован** — показать ошибку «Ссылка недействительна или устарела» с кнопкой «На главную»
- **Пользователь уже состоит в команде** — показать предупреждение «Вы уже состоите в команде «X»» с кнопкой «Перейти к команде»
- **Пользователь не авторизован** — редирект `/login?redirect=/teams/join?token=XXX`

**Файлы:**

- `frontend/src/features/teams/api/teamsApi.ts` — добавить `joinTeam`, `getTeamByInviteToken` (preview для отображения имени команды)
- `frontend/src/features/teams/ui/JoinTeamPage/JoinTeamPage.tsx`
- `frontend/src/features/teams/ui/JoinTeamPage/JoinTeamPage.module.css`
- `frontend/src/app/router/index.tsx` — добавить `/teams/join` (protected route)
- `frontend/src/locales/ru/teams.json` — добавить ключи `join_title`, `join_cta`, `join_invalid_token`, `join_already_member`

**Бэкенд prerequisite:**

- `GET /teams/invite-preview?token=XXX` — публичный (не требует авторизации) эндпоинт, возвращает `{ team_name, member_count }` или 404 если токен недействителен. Нужен чтобы страница вступления могла показать название команды до клика

---

### 15.5 — Frontend: UI-метки, фильтр команды, командная аналитика

**Репозитории (`/repositories`):**

- Новая колонка «Команда» или badge «Команда» в строке RepositoryRow при `project.is_team_project === true`
- Фильтр «Показать: Личные / Команда / Все» (select или три кнопки-переключателя)
- При `is_team_project` скрыть кнопки редактирования/удаления для участников (оставить только владельцу)

**Задачи (`/tasks`):**

- Badge «Команда» в TaskRow при `task.is_team_task === true`
- Фильтр по источнику: «Все / Личные / Команда» в TaskListToolbar

**Sidebar:**

- Под UserBlock добавить строку с иконкой `Users` и названием команды (если пользователь состоит). Клик ведёт на `/settings/team`

**Аналитика (`/analytics`):**

- Добавить фильтр «Пространство: Личное / Команда / Всё» в AnalyticsToolbar
- При выборе «Команда» — передавать `team_id` в запрос `GET /analytics?team_id=...`
- Бэкенд добавляет `team_id` как необязательный query param к `GET /analytics` — фильтрует задачи по `team_id`

**Файлы:**

- `frontend/src/features/projects/ui/RepositoriesPage/RepositoriesPage.tsx` — фильтр + колонка
- `frontend/src/features/projects/ui/RepositoryRow/RepositoryRow.tsx` — badge, скрыть кнопки
- `frontend/src/features/tasks/ui/TaskListToolbar/TaskListToolbar.tsx` — фильтр Личные/Команда
- `frontend/src/features/tasks/ui/TaskRow/TaskRow.tsx` — badge «Команда»
- `frontend/src/shared/ui/Sidebar/Sidebar.tsx` — строка с названием команды
- `frontend/src/features/analytics/ui/AnalyticsToolbar/AnalyticsToolbar.tsx` — фильтр по команде
- `frontend/src/features/analytics/api/analyticsApi.ts` — добавить `team_id` в query params
- `frontend/src/locales/ru/teams.json` — добавить `team_badge`, `filter_personal`, `filter_team`, `filter_all`

**Бэкенд prerequisite для аналитики:**

- `GET /analytics` принимает опц. query param `team_id: UUID | None`; если указан — фильтрует задачи только по этой команде (доступ проверяется: пользователь должен состоять в команде)

---

### Порядок подэтапов 15

```
15.1  backend: модели Team/TeamMember/TeamInvite + миграции + API /teams/*
15.2  backend: расширить Projects + Tasks (team_id, is_team_project/task, токен владельца)
15.3  frontend: Settings/Team — создание команды, участники, invite-ссылки
15.4  frontend: /teams/join — страница вступления
15.5  frontend: UI-метки в Repos/Tasks/Sidebar + фильтр командной аналитики
```

### Изменения в бэкенде по подэтапам 15

| Подэтап | Изменения в API/моделях                                                                                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15.1    | Новые таблицы `teams`, `team_members`, `team_invites` + миграция + все `/teams/*` endpoints                                                                                                                                                                                                             |
| 15.2    | Колонки `team_id` в `projects` и `tasks` + миграция. Изменить `GET /projects`, `POST /projects`, `GET /tasks` (добавить командные записи в выборку). Добавить `team_id`, `is_team_project` в `ProjectRead`, `is_team_task` в `TaskSummary`. GitHub-токен в pipeline_runner берётся от владельца проекта |
| 15.4    | Добавить `GET /teams/invite-preview?token=XXX` (публичный)                                                                                                                                                                                                                                              |
| 15.5    | Добавить `team_id` query param в `GET /analytics`                                                                                                                                                                                                                                                       |

---

## Этап 16 — Pipeline Queue + CommitGroup + Real-time трансляция

> **Для агентного выполнения:** использовать `superpowers:subagent-driven-development` или `superpowers:executing-plans`. Шаги отмечены чекбоксами для трекинга.

**Цель:** Защитить систему от флуда при больших коммитах, заменить костыльный `PIPELINE_RUN_LOCK` настоящей FIFO-очередью, добавить cancel/pause/resume и транслировать все изменения статусов задач в реальном времени через SSE.

**Архитектура:**

- Новая таблица `commit_groups` хранит «ожидающие подтверждения» группы файлов из крупных коммитов
- `pipeline_runner.py` получает явную `asyncio.Queue[UUID]` и единственный воркер-coroutine вместо scattered `asyncio.create_task` + `PIPELINE_RUN_LOCK`
- `task_list_events.py` расширяется событиями `task_updated` и `commit_group_created/updated` — фронтенд обновляет статусы in-place без перезагрузки

**Стек:** SQLAlchemy async, FastAPI lifespan, asyncio.Queue, asyncio.Semaphore, SSE (EventSource), RTK Query `updateQueryData`.

---

### 16.1 — Backend: DB schema

**Зависимости:** нет.

#### Файлы

- Создать: `backend/app/models/commit_group.py`
- Изменить: `backend/app/models/project.py` — добавить `webhook_file_limit`, `pipeline_paused`
- Изменить: `backend/app/models/task.py` — добавить `commit_group_id`, `cancelled` в CHECK constraint
- Создать: `backend/migrations/versions/XXXX_add_commit_groups.py`

#### Детали реализации

**`backend/app/models/commit_group.py`:**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class CommitGroup(Base):
    __tablename__ = "commit_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    github_sha: Mapped[str]
    github_ref: Mapped[str]
    commit_message: Mapped[str | None]
    commit_author_name: Mapped[str | None]
    commit_author_login: Mapped[str | None]
    file_paths: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(server_default="pending_confirmation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project] = relationship()
    tasks: Mapped[list[Task]] = relationship(back_populates="commit_group")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_confirmation', 'processing', 'done', 'cancelled')",
            name="commit_groups_status_check",
        ),
        Index("idx_commit_groups_project_id", "project_id"),
        Index("idx_commit_groups_user_id", "user_id"),
        Index("idx_commit_groups_status", "status"),
    )
```

**`backend/app/models/project.py`** — добавить поля:

```python
webhook_file_limit: Mapped[int] = mapped_column(default=50, server_default=text("50"))
pipeline_paused: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
```

**`backend/app/models/task.py`** — добавить поле и обновить CHECK constraint:

```python
commit_group_id: Mapped[uuid.UUID | None] = mapped_column(
    ForeignKey("commit_groups.id", ondelete="SET NULL"), nullable=True
)
commit_group: Mapped[CommitGroup | None] = relationship(back_populates="tasks")
```

CheckConstraint обновить:

```python
"status IN ('queued', 'running', 'done', 'failed', 'published', 'conflict', 'cancelled')"
```

**Миграция** — создать через `alembic revision --autogenerate -m "add_commit_groups"`, проверить что содержит:

- `CREATE TABLE commit_groups`
- `ALTER TABLE projects ADD COLUMN webhook_file_limit INTEGER NOT NULL DEFAULT 50`
- `ALTER TABLE projects ADD COLUMN pipeline_paused BOOLEAN NOT NULL DEFAULT false`
- `ALTER TABLE tasks ADD COLUMN commit_group_id UUID REFERENCES commit_groups(id) ON DELETE SET NULL`
- `ALTER TABLE tasks DROP CONSTRAINT tasks_status_check` + `ADD CONSTRAINT` с расширенным списком (включая `'cancelled'`)

#### Шаги выполнения

- [ ] Создать `backend/app/models/commit_group.py` с кодом выше
- [ ] Добавить `webhook_file_limit` и `pipeline_paused` в `backend/app/models/project.py`
- [ ] Добавить `commit_group_id`, обновить CHECK constraint в `backend/app/models/task.py`
- [ ] Добавить импорт `CommitGroup` в `backend/app/models/__init__.py`
- [ ] Запустить `alembic revision --autogenerate -m "add_commit_groups"` и проверить содержимое
- [ ] Запустить `alembic upgrade head`, убедиться что миграция проходит без ошибок

#### Проверка

```bash
# Проверить наличие таблицы и колонок
SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name IN ('webhook_file_limit', 'pipeline_paused');
SELECT table_name FROM information_schema.tables WHERE table_name = 'commit_groups';
```

---

### 16.2 — Backend: Pipeline queue worker

**Зависимости:** 16.1

#### Файлы

- Изменить: `backend/app/services/pipeline_runner.py` — полный рефакторинг очереди
- Изменить: `backend/app/main.py` — lifespan запускает воркер

#### Детали реализации

Удалить `PIPELINE_RUN_LOCK`. Заменить на:

```python
_PIPELINE_QUEUE: asyncio.Queue[uuid.UUID] = asyncio.Queue()
_DEFERRED_TASKS: dict[uuid.UUID, list[uuid.UUID]] = {}  # project_id → [task_ids]
_PAUSED_PROJECTS: set[uuid.UUID] = set()
_CURRENT_TASK_ID: uuid.UUID | None = None
_CURRENT_EXECUTION: asyncio.Task[None] | None = None
_WORKER_TASK: asyncio.Task[None] | None = None
```

**`schedule_task(task_id)`** — теперь просто кладёт в очередь:

```python
async def schedule_task(task_id: uuid.UUID) -> bool:
    if task_id in _SCHEDULED_PIPELINES:
        return False
    _PIPELINE_QUEUE.put_nowait(task_id)
    _SCHEDULED_PIPELINES[task_id] = True
    return True
```

**`_queue_worker()`** — единственный воркер, запускается один раз при старте:

```python
async def _queue_worker() -> None:
    global _CURRENT_TASK_ID, _CURRENT_EXECUTION

    while True:
        task_id = await _PIPELINE_QUEUE.get()
        _SCHEDULED_PIPELINES.pop(task_id, None)

        session_factory = get_session_factory()
        async with session_factory() as session:
            task = await session.get(Task, task_id)
            if task is None or task.status != "queued":
                continue
            if task.project_id in _PAUSED_PROJECTS:
                _DEFERRED_TASKS.setdefault(task.project_id, []).append(task_id)
                continue

        _CURRENT_TASK_ID = task_id
        _CURRENT_EXECUTION = asyncio.create_task(
            run_task(task_id), name=f"docflow.task.{task_id}"
        )
        _BACKGROUND_TASKS.add(_CURRENT_EXECUTION)
        try:
            await _CURRENT_EXECUTION
        except asyncio.CancelledError:
            pass
        finally:
            _BACKGROUND_TASKS.discard(_CURRENT_EXECUTION)
            _CURRENT_EXECUTION = None
            _CURRENT_TASK_ID = None
```

**`run_task()`** — добавить обработку `CancelledError` перед `except Exception`:

```python
    except asyncio.CancelledError:
        task.status = "cancelled"
        task.current_stage = None
        task.completed_at = datetime.now(UTC)
        await session.commit()
        task_list_events.publish_task_status_changed(task, previous_status="running")
        raise
```

**`main.py` lifespan** — инициализация при старте:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Сбросить зависшие running → queued
    async with session_factory() as session:
        await session.execute(
            update(Task)
            .where(Task.status == "running")
            .values(status="queued", current_stage=None)
        )
        await session.commit()

    # Загрузить paused проекты из DB
    async with session_factory() as session:
        paused_ids = (await session.scalars(
            select(Project.id).where(Project.pipeline_paused == True)
        )).all()
        pipeline_runner._PAUSED_PROJECTS.update(paused_ids)

    # Поставить в очередь все queued задачи (кроме paused проектов)
    async with session_factory() as session:
        queued = (await session.scalars(
            select(Task.id).where(
                Task.status == "queued",
                Task.project_id.notin_(list(pipeline_runner._PAUSED_PROJECTS)),
            ).order_by(Task.created_at)
        )).all()
        for task_id in queued:
            await pipeline_runner.schedule_task(task_id)

    # Запустить воркер
    worker = asyncio.create_task(
        pipeline_runner._queue_worker(), name="docflow.queue_worker"
    )
    pipeline_runner._WORKER_TASK = worker

    yield

    worker.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await worker
```

#### Шаги выполнения

- [ ] Удалить `PIPELINE_RUN_LOCK` и `async with PIPELINE_RUN_LOCK:` из `pipeline_runner.py`
- [ ] Добавить новые глобальные переменные (`_PIPELINE_QUEUE`, `_DEFERRED_TASKS`, `_PAUSED_PROJECTS`, `_CURRENT_TASK_ID`, `_CURRENT_EXECUTION`, `_WORKER_TASK`)
- [ ] Переписать `schedule_task()` — только `put_nowait`
- [ ] Добавить `_queue_worker()` coroutine
- [ ] Добавить `except asyncio.CancelledError` блок в `run_task()`
- [ ] Обновить `lifespan` в `main.py`
- [ ] Запустить сервер, создать задачу через `POST /tasks/manual`, убедиться что она выполняется (`queued → running → done`)
- [ ] Перезапустить сервер пока задача `running` — после перезапуска она сбросится в `queued` и перезапустится

---

### 16.3 — Backend: Cancel задачи

**Зависимости:** 16.2

#### Файлы

- Изменить: `backend/app/api/routes/tasks.py` — новый endpoint
- Изменить: `backend/app/services/pipeline_runner.py` — функция `cancel_task()`
- Изменить: `backend/app/schemas/task.py` — добавить `cancelled` в `TaskStatus`

#### Детали реализации

**`pipeline_runner.cancel_task(task_id)`:**

```python
async def cancel_task(task_id: uuid.UUID) -> bool:
    if _CURRENT_TASK_ID == task_id and _CURRENT_EXECUTION is not None:
        _CURRENT_EXECUTION.cancel()
        return True
    return False
```

**Новый endpoint `POST /tasks/{task_id}/cancel`:**

```python
@router.post(
    "/{task_id}/cancel",
    status_code=200,
    summary="Отменить задачу",
    description="Отменяет задачу со статусом `queued` или `running`. Статус становится `cancelled`.",
)
async def cancel_task_route(
    task_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> dict[str, str]:
    task = await get_task_or_404(session, task_id, current_user)
    if task.status not in ("queued", "running"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task with status '{task.status}'",
        )
    previous_status = task.status
    if task.status == "queued":
        task.status = "cancelled"
        task.completed_at = datetime.now(UTC)
        await session.commit()
        task_list_events.publish_task_status_changed(task, previous_status=previous_status)
    else:
        # running: cancel через asyncio, run_task сам обновит статус
        await pipeline_runner.cancel_task(task_id)
    return {"id": str(task.id), "status": "cancelled"}
```

**`TaskStatus` в `schemas/task.py`** — добавить `cancelled = "cancelled"`.

#### Шаги выполнения

- [ ] Добавить `cancelled` в `TaskStatus` enum в `backend/app/schemas/task.py`
- [ ] Добавить `cancel_task()` в `pipeline_runner.py`
- [ ] Добавить `POST /tasks/{id}/cancel` в `tasks.py` (до других `/{task_id}` роутов)
- [ ] Проверить: создать задачу → отменить пока `queued` → статус `cancelled` в DB
- [ ] Проверить: создать задачу → дождаться `running` → отменить → статус `cancelled`

---

### 16.4 — Backend: Pause/Resume проекта

**Зависимости:** 16.2, 16.3

#### Файлы

- Изменить: `backend/app/api/routes/projects.py` — два новых endpoint
- Изменить: `backend/app/services/pipeline_runner.py` — `pause_project()`, `resume_project()`
- Изменить: `backend/app/schemas/project.py` — добавить `pipeline_paused`, `webhook_file_limit`

#### Детали реализации

**`pipeline_runner.pause_project(project_id)`:**

```python
async def pause_project(project_id: uuid.UUID) -> None:
    _PAUSED_PROJECTS.add(project_id)
    if _CURRENT_TASK_ID is not None and _CURRENT_EXECUTION is not None:
        session_factory = get_session_factory()
        async with session_factory() as session:
            task = await session.get(Task, _CURRENT_TASK_ID)
            if task is not None and task.project_id == project_id:
                _CURRENT_EXECUTION.cancel()
```

**`pipeline_runner.resume_project(project_id)`:**

```python
async def resume_project(project_id: uuid.UUID) -> None:
    _PAUSED_PROJECTS.discard(project_id)
    deferred = _DEFERRED_TASKS.pop(project_id, [])
    for task_id in deferred:
        _PIPELINE_QUEUE.put_nowait(task_id)
        _SCHEDULED_PIPELINES[task_id] = True
    # Сканировать DB на queued задачи этого проекта (на случай рестарта)
    session_factory = get_session_factory()
    async with session_factory() as session:
        queued = (await session.scalars(
            select(Task.id).where(
                Task.project_id == project_id,
                Task.status == "queued",
                Task.id.notin_(list(_SCHEDULED_PIPELINES.keys())),
            ).order_by(Task.created_at)
        )).all()
        for task_id in queued:
            _PIPELINE_QUEUE.put_nowait(task_id)
            _SCHEDULED_PIPELINES[task_id] = True
```

**Новые endpoints в `projects.py`:**

```python
@router.post("/{project_id}/pause", status_code=200, summary="Поставить пайплайн на паузу")
async def pause_project_route(
    project_id: UUID, session: DbSession, current_user: CurrentUser
) -> dict:
    project = await get_project_visible_or_404(session, project_id, current_user)
    project.pipeline_paused = True
    await session.commit()
    await pipeline_runner.pause_project(project_id)
    return {"pipeline_paused": True}


@router.post("/{project_id}/resume", status_code=200, summary="Возобновить пайплайн")
async def resume_project_route(
    project_id: UUID, session: DbSession, current_user: CurrentUser
) -> dict:
    project = await get_project_visible_or_404(session, project_id, current_user)
    project.pipeline_paused = False
    await session.commit()
    await pipeline_runner.resume_project(project_id)
    return {"pipeline_paused": False}
```

**`schemas/project.py`** — добавить в `ProjectRead`:

```python
pipeline_paused: bool
webhook_file_limit: int
```

Добавить в `ProjectUpdate` (опционально):

```python
pipeline_paused: bool | None = None
webhook_file_limit: int | None = Field(None, ge=1, le=1000)
```

#### Шаги выполнения

- [x] Добавить `pipeline_paused` и `webhook_file_limit` в `ProjectRead` и `ProjectUpdate`
- [x] Добавить `pause_project()` и `resume_project()` в `pipeline_runner.py`
- [x] Добавить `POST /projects/{id}/pause` и `POST /projects/{id}/resume` в `projects.py`
- [ ] Проверить: создать задачи → поставить проект на паузу → задачи не запускаются → возобновить → задачи начинают выполняться

---

### 16.5 — Backend: Webhook — bulk protection → CommitGroup

**Зависимости:** 16.1

#### Файлы

- Изменить: `backend/app/api/routes/webhook.py`
- Создать: `backend/app/schemas/commit_group.py`

#### Детали реализации

**`backend/app/schemas/commit_group.py`:**

```python
from __future__ import annotations
import uuid
from datetime import datetime
from pydantic import BaseModel


class CommitGroupRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    github_sha: str
    github_ref: str
    commit_message: str | None
    commit_author_name: str | None
    commit_author_login: str | None
    file_paths: list[str]
    status: str
    created_at: datetime
    confirmed_at: datetime | None


class CommitGroupListResponse(BaseModel):
    items: list[CommitGroupRead]
    total: int
```

**`webhook.py`** — добавить блок после `_apply_exclude_patterns`:

```python
# Bulk protection
if len(files_to_process) > project.webhook_file_limit:
    owner = await _get_project_owner(session, project)
    commit_group = CommitGroup(
        project_id=project.id,
        user_id=owner.id,
        team_id=project.team_id,
        github_sha=payload.get("after"),
        github_ref=str(payload["ref"]),
        commit_message=commit_message,
        commit_author_name=commit_author_name,
        commit_author_login=commit_author_login,
        file_paths=files_to_process,
        status="pending_confirmation",
    )
    session.add(commit_group)
    await session.commit()
    task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_created")
    logger.info(
        "webhook_bulk_commit_group_created",
        extra={"project_id": str(project.id), "files_count": len(files_to_process)},
    )
    return {
        "created": 0,
        "task_ids": [],
        "skipped": skipped_files,
        "commit_group_id": str(commit_group.id),
        "commit_group_status": "pending_confirmation",
    }
```

**Семафор на GitHub API** — вынести `_fetch_file_metadata` и обернуть:

```python
_GITHUB_FETCH_SEMAPHORE = asyncio.Semaphore(10)

async def _fetch_file_metadata_safe(github_client, project, file_path):
    async with _GITHUB_FETCH_SEMAPHORE:
        return await _fetch_file_metadata(github_client, project, file_path)
```

Заменить `asyncio.gather(*[_fetch_file_metadata(fp) for fp in files_to_process])` на `asyncio.gather(*[_fetch_file_metadata_safe(github_client, project, fp) for fp in files_to_process])`.

#### Шаги выполнения

- [x] Создать `backend/app/schemas/commit_group.py`
- [x] Добавить `_GITHUB_FETCH_SEMAPHORE` и `_fetch_file_metadata_safe` в `webhook.py`
- [x] Заменить `asyncio.gather` на версию с семафором
- [x] Добавить bulk-protection блок в webhook handler
- [ ] Проверить: curl-запрос с 1 файлом → задача создаётся. Curl с 51 файлом → возвращается `commit_group_id`

---

### 16.6 — Backend: CommitGroup API

**Зависимости:** 16.1, 16.5, 16.2

#### Файлы

- Создать: `backend/app/services/commit_groups.py`
- Создать: `backend/app/api/routes/commit_groups.py`
- Изменить: `backend/app/api/router.py` — подключить router

#### Детали реализации

**`backend/app/services/commit_groups.py`:**

```python
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commit_group import CommitGroup
from app.models.task import Task
from app.models.user import User
from app.services import pipeline_runner, task_list_events
from app.services.github import GitHubClient


async def list_commit_groups(
    session: AsyncSession,
    *,
    user_id: UUID,
    team_id: UUID | None,
    project_id: UUID | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[CommitGroup], int]:
    q = select(CommitGroup).where(
        (CommitGroup.user_id == user_id)
        if team_id is None
        else (CommitGroup.user_id == user_id) | (CommitGroup.team_id == team_id)
    )
    if project_id:
        q = q.where(CommitGroup.project_id == project_id)
    if status:
        q = q.where(CommitGroup.status == status)
    q = q.order_by(CommitGroup.created_at.desc())
    total = (await session.scalar(
        select(func.count()).select_from(q.subquery())
    )) or 0
    items = (await session.scalars(q.offset(offset).limit(limit))).all()
    return list(items), total


async def confirm_commit_group(
    session: AsyncSession,
    commit_group: CommitGroup,
    owner: User,
    github_client: GitHubClient,
) -> list[Task]:
    from app.api.routes.webhook import _fetch_file_metadata_safe

    commit_group.status = "processing"
    commit_group.confirmed_at = datetime.now(UTC)
    await session.commit()
    task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_updated")

    active_tasks = (await session.scalars(
        select(Task).where(
            Task.project_id == commit_group.project_id,
            Task.file_path.in_(commit_group.file_paths),
            Task.status.in_(("queued", "running")),
        )
    )).all()
    active_by_path = {t.file_path: t for t in active_tasks}
    to_process = [fp for fp in commit_group.file_paths if fp not in active_by_path]

    project = commit_group.project
    fetched = await asyncio.gather(*[
        _fetch_file_metadata_safe(github_client, project, fp) for fp in to_process
    ])

    tasks_to_create = [
        Task(
            user_id=owner.id,
            project_id=commit_group.project_id,
            team_id=commit_group.team_id,
            commit_group_id=commit_group.id,
            file_path=fp,
            github_ref=commit_group.github_ref,
            github_sha=commit_group.github_sha,
            commit_message=commit_group.commit_message,
            commit_author_name=commit_group.commit_author_name,
            commit_author_login=commit_group.commit_author_login,
            source_file_sha=source_sha,
            target_file_sha=target_sha,
            original_content=content,
            status="queued",
        )
        for fp, content, source_sha, target_sha in fetched
    ]

    session.add_all(tasks_to_create)
    commit_group.status = "done"
    await session.commit()
    task_list_events.publish_commit_group_event(commit_group, event_type="commit_group_updated")

    for task in tasks_to_create:
        task_list_events.publish_task_entered_scope(task)
        await pipeline_runner.schedule_task(task.id)

    return tasks_to_create
```

**`backend/app/api/routes/commit_groups.py`:**

```python
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.models.commit_group import CommitGroup
from app.models.user import User
from app.schemas.commit_group import CommitGroupListResponse, CommitGroupRead
from app.services import task_list_events
from app.services.auth import decrypt_github_access_token, get_current_user
from app.services.commit_groups import confirm_commit_group, list_commit_groups
from app.services.github import GitHubClient
from app.services.projects import _get_user_team_id

router = APIRouter(prefix="/commit-groups", tags=["commit-groups"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_group_or_404(session: AsyncSession, group_id: UUID, user: User) -> CommitGroup:
    group = await session.get(CommitGroup, group_id)
    if group is None or group.user_id != user.id:
        raise HTTPException(status_code=404, detail="Commit group not found")
    return group


@router.get("", response_model=CommitGroupListResponse)
async def get_commit_groups(
    session: DbSession,
    current_user: CurrentUser,
    project_id: UUID | None = None,
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> CommitGroupListResponse:
    team_id = await _get_user_team_id(session, current_user.id)
    items, total = await list_commit_groups(
        session,
        user_id=current_user.id,
        team_id=team_id,
        project_id=project_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return CommitGroupListResponse(
        items=[CommitGroupRead.model_validate(g) for g in items],
        total=total,
    )


@router.post("/{group_id}/confirm", status_code=202)
async def confirm_group_route(
    group_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> dict:
    group = await _get_group_or_404(session, group_id, current_user)
    if group.status != "pending_confirmation":
        raise HTTPException(status_code=400, detail=f"Cannot confirm group with status '{group.status}'")
    if not current_user.github_linked or not current_user.github_access_token:
        raise HTTPException(status_code=400, detail="GitHub account is not linked")

    access_token = decrypt_github_access_token(current_user.github_access_token)
    github_client = GitHubClient(access_token)
    await session.refresh(group, ["project"])
    tasks = await confirm_commit_group(session, group, current_user, github_client)
    return {"created": len(tasks), "task_ids": [str(t.id) for t in tasks]}


@router.delete("/{group_id}", status_code=204)
async def cancel_group_route(
    group_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> None:
    group = await _get_group_or_404(session, group_id, current_user)
    if group.status != "pending_confirmation":
        raise HTTPException(status_code=400, detail=f"Cannot cancel group with status '{group.status}'")
    group.status = "cancelled"
    await session.commit()
    task_list_events.publish_commit_group_event(group, event_type="commit_group_updated")
```

#### Шаги выполнения

- [x] Создать `backend/app/services/commit_groups.py`
- [x] Создать `backend/app/api/routes/commit_groups.py`
- [x] Добавить `commit_groups_router` в `backend/app/api/router.py`
- [ ] Проверить `GET /commit-groups` → 200, пустой список
- [ ] Создать CommitGroup через webhook → `POST /commit-groups/{id}/confirm` → задачи созданы
- [ ] `DELETE /commit-groups/{id}` → статус `cancelled`

---

### 16.7 — Backend: SSE — task_updated + commit_group events

**Зависимости:** 16.2, 16.3, 16.4

#### Файлы

- Изменить: `backend/app/services/task_list_events.py`

#### Детали реализации

**Добавить `publish_task_status_changed`:**

```python
def publish_task_status_changed(task: Task, *, previous_status: str) -> None:
    payload = {
        "task_id": str(task.id),
        "project_id": str(task.project_id) if task.project_id is not None else None,
        "status": task.status,
        "current_stage": task.current_stage,
    }
    for subscription in list(TASK_LIST_EVENT_SUBSCRIPTIONS.values()):
        belongs_to_user = task.user_id == subscription.user_id
        belongs_to_team = (
            subscription.team_id is not None
            and task.team_id is not None
            and task.team_id == subscription.team_id
        )
        if not belongs_to_user and not belongs_to_team:
            continue
        if subscription.project_id is not None and task.project_id != subscription.project_id:
            continue
        if subscription.search:
            needle = subscription.search
            if needle not in task.file_path.lower() and needle not in (task.commit_message or "").lower():
                continue
        subscription.queue.put_nowait({"event": "task_updated", "data": payload})
```

**Добавить `publish_commit_group_event`:**

```python
def publish_commit_group_event(commit_group: Any, *, event_type: str) -> None:
    payload = {
        "commit_group_id": str(commit_group.id),
        "project_id": str(commit_group.project_id),
        "github_sha": commit_group.github_sha,
        "files_count": len(commit_group.file_paths),
        "commit_message": commit_group.commit_message,
        "commit_author_name": commit_group.commit_author_name,
        "commit_author_login": commit_group.commit_author_login,
        "status": commit_group.status,
        "created_at": commit_group.created_at.isoformat(),
    }
    for subscription in list(TASK_LIST_EVENT_SUBSCRIPTIONS.values()):
        belongs_to_user = commit_group.user_id == subscription.user_id
        belongs_to_team = (
            subscription.team_id is not None
            and getattr(commit_group, "team_id", None) == subscription.team_id
        )
        if not belongs_to_user and not belongs_to_team:
            continue
        if subscription.project_id is not None and commit_group.project_id != subscription.project_id:
            continue
        subscription.queue.put_nowait({"event": event_type, "data": payload})
```

**Точки вызова `publish_task_status_changed`** — добавить в `pipeline_runner.py`:

| Место в `run_task`                       | Вызов                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| После `task.status = "running"` + commit | `task_list_events.publish_task_status_changed(task, previous_status="queued")`  |
| После `task.status = "done"` + commit    | `task_list_events.publish_task_status_changed(task, previous_status="running")` |
| После `task.status = "failed"` + commit  | `task_list_events.publish_task_status_changed(task, previous_status="running")` |
| В `except CancelledError` + commit       | уже добавлено в 16.2                                                            |

Также в `tasks.py cancel_task_route` для queued→cancelled — уже добавлено в 16.3.

#### Шаги выполнения

- [x] Добавить `publish_task_status_changed` в `task_list_events.py`
- [x] Добавить `publish_commit_group_event` в `task_list_events.py`
- [x] Добавить вызовы `publish_task_status_changed` в `pipeline_runner.run_task` на каждый переход статуса
- [ ] Проверить через DevTools Network: открыть `/api/tasks/events` SSE → изменить статус задачи → получить `task_updated` событие

---

### 16.8 — Frontend: Real-time обновления статусов

**Зависимости:** 16.7

#### Файлы

- Создать: `src/features/tasks/hooks/useTaskListSSE.ts`
- Изменить: `src/features/tasks/ui/TaskListPage/TaskListPage.tsx`

#### Детали реализации

**`useTaskListSSE.ts`:**

```typescript
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/shared/store'
import { tasksApi } from '../api/tasksApi'
import { commitGroupsApi } from '@/features/commit-groups/api/commitGroupsApi'

interface Filters {
  projectId?: string
  status?: string
  search?: string
}

export function useTaskListSSE(filters: Filters) {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.projectId) params.set('project_id', filters.projectId)
    if (filters.status) params.set('status', filters.status)
    if (filters.search) params.set('search', filters.search)

    const es = new EventSource(`/api/tasks/events?${params}`)

    es.addEventListener('task_entered', () => {
      dispatch(tasksApi.util.invalidateTags(['Task']))
    })

    es.addEventListener('task_updated', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        task_id: string
        status: string
        current_stage: string | null
        project_id: string | null
      }
      dispatch(
        tasksApi.util.updateQueryData('getTasks', undefined as any, (draft) => {
          const task = draft.items.find((t) => t.id === data.task_id)
          if (task) {
            task.status = data.status as any
            task.current_stage = data.current_stage
          }
        }),
      )
    })

    es.addEventListener('commit_group_created', () => {
      dispatch(commitGroupsApi.util.invalidateTags(['CommitGroup']))
    })

    es.addEventListener('commit_group_updated', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        commit_group_id: string
        status: string
      }
      dispatch(
        commitGroupsApi.util.updateQueryData('getCommitGroups', undefined as any, (draft) => {
          const group = draft.items.find((g) => g.id === data.commit_group_id)
          if (group) group.status = data.status as any
        }),
      )
    })

    es.onerror = () => es.close()
    return () => es.close()
  }, [filters.projectId, filters.status, filters.search, dispatch])
}
```

**`TaskListPage.tsx`** — подключить hook:

```typescript
const filters = useTaskFilters()
useTaskListSSE({
  projectId: filters.projectId ?? undefined,
  status: filters.status ?? undefined,
  search: filters.search ?? undefined,
})
```

#### Шаги выполнения

- [x] Создать `src/features/tasks/hooks/useTaskListSSE.ts`
- [x] Вызвать `useTaskListSSE(filters)` в `TaskListPage.tsx`
- [x] Добавить `'CommitGroup'` в список тегов `baseApi` в `src/shared/api/baseApi.ts`
- [ ] Проверить: отменить задачу через API → статус обновился в UI без перезагрузки страницы

---

### 16.9 — Frontend: CommitGroup UI

**Зависимости:** 16.6, 16.8

#### Файлы

- Создать: `src/features/commit-groups/model/types.ts`
- Создать: `src/features/commit-groups/api/commitGroupsApi.ts`
- Создать: `src/features/commit-groups/ui/CommitGroupRow/CommitGroupRow.tsx` + `.module.css`
- Изменить: `src/features/tasks/ui/TaskListPage/TaskListPage.tsx`
- Изменить: `src/locales/ru/tasks.json`

#### Детали реализации

**`types.ts`:**

```typescript
export interface CommitGroup {
  id: string
  project_id: string
  github_sha: string
  github_ref: string
  commit_message: string | null
  commit_author_name: string | null
  commit_author_login: string | null
  file_paths: string[]
  files_count: number
  status: 'pending_confirmation' | 'processing' | 'done' | 'cancelled'
  created_at: string
  confirmed_at: string | null
}

export interface CommitGroupListResponse {
  items: CommitGroup[]
  total: number
}
```

**`commitGroupsApi.ts`:**

```typescript
import { baseApi } from '@/shared/api/baseApi'
import { CommitGroup, CommitGroupListResponse } from '../model/types'

export const commitGroupsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCommitGroups: build.query<CommitGroupListResponse, { projectId?: string; status?: string }>({
      query: ({ projectId, status }) => ({
        url: '/commit-groups',
        params: { project_id: projectId, status },
      }),
      providesTags: ['CommitGroup'],
    }),
    confirmCommitGroup: build.mutation<{ created: number; task_ids: string[] }, string>({
      query: (groupId) => ({ url: `/commit-groups/${groupId}/confirm`, method: 'POST' }),
      invalidatesTags: ['CommitGroup', 'Task'],
    }),
    cancelCommitGroup: build.mutation<void, string>({
      query: (groupId) => ({ url: `/commit-groups/${groupId}`, method: 'DELETE' }),
      invalidatesTags: ['CommitGroup'],
    }),
  }),
})

export const {
  useGetCommitGroupsQuery,
  useConfirmCommitGroupMutation,
  useCancelCommitGroupMutation,
} = commitGroupsApi
```

**`CommitGroupRow.tsx`:**

```tsx
import { useTranslation } from 'react-i18next'
import { GitCommitHorizontal, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/Button/Button'
import {
  useConfirmCommitGroupMutation,
  useCancelCommitGroupMutation,
} from '../../api/commitGroupsApi'
import { CommitGroup } from '../../model/types'
import styles from './CommitGroupRow.module.css'

interface Props {
  group: CommitGroup
}

export function CommitGroupRow({ group }: Props) {
  const { t } = useTranslation('tasks')
  const [confirm, { isLoading: confirming }] = useConfirmCommitGroupMutation()
  const [cancel, { isLoading: cancelling }] = useCancelCommitGroupMutation()

  return (
    <div className={styles.row}>
      <div className={styles.icon}>
        <GitCommitHorizontal size={13} />
      </div>
      <div className={styles.body}>
        <span className={styles.sha}>{group.github_sha?.slice(0, 7)}</span>
        <span className={styles.message}>{group.commit_message ?? '—'}</span>
        <span className={styles.meta}>
          {t('commit_group.files_count', { count: group.file_paths.length })}
          {' · '}
          <span className={styles.pending}>{t('commit_group.pending_label')}</span>
        </span>
      </div>
      <div className={styles.actions}>
        {group.status === 'processing' ? (
          <Loader2 size={15} className={styles.spinner} />
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={confirming}
              onClick={() => confirm(group.id)}
            >
              {t('commit_group.confirm_action')}
            </Button>
            <Button variant="ghost" size="sm" loading={cancelling} onClick={() => cancel(group.id)}>
              {t('commit_group.cancel_action')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
```

**Ключи локализации в `tasks.json`:**

```json
{
  "commit_group": {
    "files_count_one": "{{count}} файл",
    "files_count_few": "{{count}} файла",
    "files_count_many": "{{count}} файлов",
    "pending_label": "ожидает подтверждения",
    "confirm_action": "Запустить перевод",
    "cancel_action": "Отклонить"
  }
}
```

**`TaskListPage.tsx`** — добавить перед commit-группами задач:

```tsx
const { data: pendingGroups } = useGetCommitGroupsQuery({ status: 'pending_confirmation' })

// В JSX:
{
  pendingGroups?.items.map((group) => <CommitGroupRow key={group.id} group={group} />)
}
```

#### Шаги выполнения

- [x] Создать `src/features/commit-groups/model/types.ts`
- [x] Создать `src/features/commit-groups/api/commitGroupsApi.ts`
- [x] Добавить `'CommitGroup'` в baseApi tags (если ещё не добавлено в 16.8)
- [x] Создать `CommitGroupRow.tsx` + `CommitGroupRow.module.css`
- [x] Добавить ключи в `src/locales/ru/tasks.json`
- [x] Добавить `useGetCommitGroupsQuery` и `CommitGroupRow` в `TaskListPage.tsx`
- [ ] Проверить: webhook с 51 файлом → в TaskList появилась строка «ожидает подтверждения» → «Запустить перевод» → строка исчезла, задачи появились

---

### 16.10 — Frontend: Cancel + Pause/Resume UI

**Зависимости:** 16.3, 16.4, 16.8

#### Файлы

- Изменить: `src/features/tasks/api/tasksApi.ts` — мутация `cancelTask`
- Изменить: `src/features/tasks/ui/TaskRow/TaskRow.tsx` — кнопка Cancel
- Изменить: `src/features/projects/api/projectsApi.ts` — мутации `pauseProject`, `resumeProject`
- Изменить: `src/features/projects/ui/RepositoryDetailPage/RepositoryDetailPage.tsx` — секция Пайплайн
- Изменить: `src/locales/ru/tasks.json`, `src/locales/ru/repositories.json`

#### Детали реализации

**`tasksApi.ts`** — добавить мутацию:

```typescript
cancelTask: build.mutation<{ id: string; status: string }, string>({
  query: (taskId) => ({ url: `/tasks/${taskId}/cancel`, method: 'POST' }),
  invalidatesTags: (_result, _error, taskId) => [{ type: 'Task', id: taskId }],
}),
```

**`TaskRow.tsx`** — добавить кнопку Cancel для `queued` и `running`:

```tsx
const [cancelTask, { isLoading: cancelling }] = useCancelTaskMutation()

// В action-секции строки:
{
  ;(task.status === 'queued' || task.status === 'running') && (
    <Button
      variant="ghost"
      size="sm"
      iconLeft={<X size={13} />}
      loading={cancelling}
      title={t('task.cancel_action')}
      onClick={(e) => {
        e.stopPropagation()
        cancelTask(task.id)
      }}
    />
  )
}
```

**`projectsApi.ts`** — добавить:

```typescript
pauseProject: build.mutation<{ pipeline_paused: boolean }, string>({
  query: (projectId) => ({ url: `/projects/${projectId}/pause`, method: 'POST' }),
  invalidatesTags: (_r, _e, id) => [{ type: 'Project', id }],
}),
resumeProject: build.mutation<{ pipeline_paused: boolean }, string>({
  query: (projectId) => ({ url: `/projects/${projectId}/resume`, method: 'POST' }),
  invalidatesTags: (_r, _e, id) => [{ type: 'Project', id }],
}),
```

**`RepositoryDetailPage.tsx`** — добавить секцию «Пайплайн» (после секции Webhook):

```tsx
const [pauseProject, { isLoading: pausing }] = usePauseProjectMutation()
const [resumeProject, { isLoading: resuming }] = useResumeProjectMutation()

// Настройки лимита
const [limitValue, setLimitValue] = useState(String(project.webhook_file_limit))

// JSX — новая секция:
<section className={styles.section}>
  <h2>{t('repositories.pipeline_title')}</h2>
  <div className={styles.pipelineRow}>
    <label>{t('repositories.webhook_file_limit')}</label>
    <input
      type="number"
      min={1}
      max={1000}
      value={limitValue}
      onChange={(e) => setLimitValue(e.target.value)}
    />
    <Button variant="secondary" size="sm" onClick={() =>
      updateProject({ id: project.id, webhook_file_limit: Number(limitValue) })
    }>
      {t('common.save')}
    </Button>
    <span className={styles.hint}>{t('repositories.webhook_file_limit_hint')}</span>
  </div>
  <div className={styles.pipelineRow}>
    {project.pipeline_paused ? (
      <>
        <StatusPill status="paused" />
        <Button variant="secondary" loading={resuming} onClick={() => resumeProject(project.id)}>
          {t('repositories.resume_pipeline')}
        </Button>
      </>
    ) : (
      <Button variant="ghost" loading={pausing} onClick={() => pauseProject(project.id)}>
        {t('repositories.pause_pipeline')}
      </Button>
    )}
  </div>
</section>
```

**Ключи локализации:**

`tasks.json`:

```json
{ "task": { "cancel_action": "Отменить задачу" } }
```

`repositories.json`:

```json
{
  "pipeline_title": "Пайплайн",
  "webhook_file_limit": "Лимит файлов на коммит",
  "webhook_file_limit_hint": "Коммиты с большим числом .md файлов потребуют подтверждения",
  "pause_pipeline": "Поставить на паузу",
  "resume_pipeline": "Возобновить пайплайн"
}
```

#### Шаги выполнения

- [x] Добавить `cancelTask` mutation в `tasksApi.ts`
- [x] Добавить кнопку Cancel в `TaskRow.tsx`
- [x] Добавить `pauseProject` и `resumeProject` в `projectsApi.ts`
- [x] Добавить секцию «Пайплайн» в `RepositoryDetailPage.tsx`
- [x] Добавить ключи локализации
- [ ] Проверить: задача `queued` → нажать Cancel → статус сразу обновляется без перезагрузки
- [ ] Проверить: поставить проект на паузу → новые задачи не запускаются → возобновить → запускаются

---

### Порядок подэтапов 16

```
16.1  backend: DB schema (CommitGroup + поля Project/Task + миграция)
16.2  backend: pipeline queue worker (замена PIPELINE_RUN_LOCK)
16.3  backend: cancel задачи (queued + running)
16.4  backend: pause/resume проекта
16.5  backend: webhook bulk protection → CommitGroup
16.6  backend: CommitGroup API (list / confirm / cancel)
16.7  backend: SSE — task_updated + commit_group events
16.8  frontend: real-time обновления через SSE (useTaskListSSE)
16.9  frontend: CommitGroupRow в TaskList
16.10 frontend: Cancel button + Pause/Resume UI
```

16.1–16.7 — бэкенд, брать по одному подэтапу. 16.8–16.10 — фронтенд, зависят от 16.7.

### Изменения в бэкенде по подэтапам 16

| Подэтап | Изменения в API/моделях                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 16.1    | Новая таблица `commit_groups`. Поля `webhook_file_limit`, `pipeline_paused` в `projects`. Поле `commit_group_id` в `tasks`. Статус `cancelled` в CHECK constraint. Миграция                                                                                                    |
| 16.2    | `pipeline_runner.py`: удалён `PIPELINE_RUN_LOCK`, добавлены `_PIPELINE_QUEUE`, `_DEFERRED_TASKS`, `_PAUSED_PROJECTS`, `_CURRENT_TASK_ID`, `_CURRENT_EXECUTION`, `_queue_worker()`. `main.py`: lifespan запускает воркер, сбрасывает `running→queued`, загружает paused проекты |
| 16.3    | Новый `POST /tasks/{id}/cancel`. `TaskStatus` enum расширен `cancelled`. `pipeline_runner.cancel_task()`                                                                                                                                                                       |
| 16.4    | Новые `POST /projects/{id}/pause` и `POST /projects/{id}/resume`. `pipeline_runner.pause_project()`, `resume_project()`. Поля `pipeline_paused`, `webhook_file_limit` в `ProjectRead` и `ProjectUpdate`                                                                        |
| 16.5    | Bulk-protection блок в `webhook.py`. `asyncio.Semaphore(10)` на GitHub API fetch. Возврат `commit_group_id` в ответе                                                                                                                                                           |
| 16.6    | Новые `GET /commit-groups`, `POST /commit-groups/{id}/confirm`, `DELETE /commit-groups/{id}`. Файлы: `schemas/commit_group.py`, `services/commit_groups.py`, `api/routes/commit_groups.py`                                                                                     |
| 16.7    | `task_list_events.py`: `publish_task_status_changed`, `publish_commit_group_event`. Вызовы во всех точках смены статуса в `pipeline_runner.py` и `tasks.py`                                                                                                                    |

---

## Этап 17 — Инкрементальный перевод через git diff

**Цель:** переводить только изменившиеся абзацы файла, а не весь файл целиком. Уменьшает стоимость и время перевода при небольших правках в большом документе.

### Концепция

Единица сравнения — **абзац** (блок текста, отделённый пустой строкой). Абзацы устойчивее строк: LLM почти всегда сохраняет структуру абзацев даже при перефразировании.

Синхронизированные репозитории означают совпадающие пути файлов: если source-файл лежит по пути `docs/api/overview.md`, то в target-репозитории переведённая версия лежит по тому же пути `docs/api/overview.md`. Никакого сложного маппинга не нужно.

#### Алгоритм для webhook-события (push в source-репозиторий)

1. Webhook приносит `before_sha` и `after_sha`.
2. Backend получает `new_en` (новый исходник, `after_sha`) и `old_en` (старый исходник, `before_sha`) через GitHub API.
3. Backend получает `old_ru` (текущий перевод в target-репозитории) по тому же пути файла.
4. Разбиваем `new_en` и `old_en` на абзацы, считаем хэш каждого абзаца.
5. Находим «грязные» абзацы: те, у которых хэш в `new_en` ≠ хэш в `old_en`.
6. Считаем порог: если `len(dirty) / len(new_en_paragraphs) > incremental_threshold / 100` → полный перевод.
7. При инкрементальном режиме: находим соответствующие абзацы в `old_ru` (по позиции через `SequenceMatcher`), переводим только грязные, собираем итоговый файл из смеси старых и новых переводов.
8. На задаче сохраняем `previous_task_id` — ссылка на последнюю опубликованную задачу для этого файла.

#### Когда находить previous_task_id

В `webhook.py` при создании задачи: `SELECT id FROM tasks WHERE file_path = $file_path AND project_id = $project_id AND status = 'published' ORDER BY created_at DESC LIMIT 1`.

### Изменения в бэкенде

#### Новые поля БД

**`tasks`:**

```sql
previous_task_id UUID REFERENCES tasks(id) NULL
```

**`projects`:**

```sql
incremental_threshold INTEGER NOT NULL DEFAULT 40
```

`incremental_threshold` — процент (0–100). Если доля изменённых абзацев превышает порог, pipeline переключается на полный перевод.

#### Новые поля API

`ProjectRead` / `ProjectUpdate`:

```python
incremental_threshold: int = 40  # 0 = всегда инкрементально, 100 = всегда полностью
```

`TaskRead`:

```python
previous_task_id: UUID | None = None
```

#### Изменения в pipeline

`pipeline_runner.py` — новая функция `_build_incremental_prompt`:

```python
async def _build_incremental_prompt(
    task: Task,
    new_en: str,
    old_en: str,
    old_ru: str,
    threshold: int,
) -> tuple[str, bool]:
    """
    Возвращает (prompt, is_incremental).
    is_incremental=False означает полный перевод.
    """
    new_paras = split_paragraphs(new_en)
    old_paras = split_paragraphs(old_en)
    dirty_indices = find_dirty_paragraphs(new_paras, old_paras)

    ratio = len(dirty_indices) / max(len(new_paras), 1)
    if ratio * 100 > threshold:
        return build_full_prompt(new_en), False

    old_ru_paras = split_paragraphs(old_ru)
    aligned = align_paragraphs(old_paras, old_ru_paras)  # SequenceMatcher
    return build_incremental_prompt(new_paras, dirty_indices, aligned), True
```

`pipeline_runner.py` — в основном цикле перед вызовом LLM: если `task.previous_task_id` не None, загружать `old_en` из GitHub (`before_sha` на задаче) и `old_ru` из target-репозитория.

#### Новые поля на Task (в памяти, не обязательно в БД)

При создании задачи через webhook добавлять в meta/payload: `before_sha` — SHA коммита до push, чтобы pipeline мог получить старую версию файла.

### Новые файлы в бэкенде

- `app/services/paragraph_diff.py` — `split_paragraphs`, `find_dirty_paragraphs`, `align_paragraphs`, `merge_translations`
- `app/services/incremental_translate.py` — оркестрация: GitHub fetch `old_en` + `old_ru`, вызов `paragraph_diff`, сборка финального текста

### Изменения во фронтенде

#### Настройка порога в RepositoryDetailPage

Новая секция «Инкрементальный перевод» рядом с «Пайплайном»:

```tsx
<div className={styles.pipelineRow}>
  <label>{t('repositories.incremental_threshold')}</label>
  <input
    type="number"
    min={0}
    max={100}
    value={thresholdValue}
    onChange={(e) => setThresholdValue(e.target.value)}
  />
  <span className={styles.hint}>{t('repositories.incremental_threshold_hint')}</span>
  <Button variant="secondary" size="sm" onClick={saveThreshold}>
    {t('common.save')}
  </Button>
</div>
```

#### Индикатор в TaskRow / TaskDetailPage

Если `task.previous_task_id != null` — показывать бейдж «Инкрементальный» рядом со статусом. В деталях задачи показывать количество переведённых абзацев из общего числа.

**Ключи локализации** (`repositories.json`):

```json
{
  "incremental_threshold": "Порог инкрементального перевода (%)",
  "incremental_threshold_hint": "Если изменилось больше N% абзацев — файл переводится целиком"
}
```

**Ключи локализации** (`tasks.json`):

```json
{
  "incremental_badge": "Инкрементальный",
  "incremental_detail": "Переведено {{dirty}} из {{total}} абзацев"
}
```

### Риски и митигация

| Риск                                                             | Митигация                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LLM добавляет/убирает абзацы — смещение индексов                 | `SequenceMatcher` на хэшах `new` vs `old_en` (один язык — хэши совпадают) даёт new↔old_en; old_en↔old_ru берётся позиционно (пайплайн сохраняет блочную структуру) |
| `before_sha` недоступен (ручной запуск)                          | При ручном запуске `previous_task_id = NULL` → всегда полный перевод                                                                                               |
| target-репозиторий не содержит перевода (первый раз)             | Если файл не найден в target-репозитории → полный перевод, `previous_task_id = NULL`                                                                               |
| Большой файл, один изменённый абзац — стоимость всё равно высока | В будущем: кэшировать неизменённые абзацы через OpenAI prompt caching                                                                                              |

---

### 17.1 — backend: DB schema + миграция

#### Зависимости

- Бэкенд: нет

#### Что делаем

Добавляем два новых поля через Alembic-миграцию.

**`tasks`:**

```sql
previous_task_id UUID REFERENCES tasks(id) NULL
before_sha       TEXT NULL
```

`before_sha` — SHA коммита до push из GitHub webhook, нужен pipeline для получения старой версии файла через GitHub API.

**`projects`:**

```sql
incremental_threshold INTEGER NOT NULL DEFAULT 40
```

Обновляем схемы Pydantic:

- `ProjectRead` / `ProjectUpdate` / `ProjectCreate` — поле `incremental_threshold: int = 40`
- `TaskRead` — поля `previous_task_id: UUID | None = None`, `before_sha: str | None = None`
- `TaskCreate` (internal) — поля `previous_task_id`, `before_sha` для webhook

#### Шаги выполнения

- [x] `backend/app/models/task.py` — добавить `previous_task_id`, `before_sha`
- [x] `backend/app/models/project.py` — добавить `incremental_threshold`
- [x] `backend/app/schemas/task.py` — `previous_task_id`, `before_sha` в `TaskRead` и `TaskCreate`
- [x] `backend/app/schemas/project.py` — `incremental_threshold` в `ProjectRead` / `ProjectUpdate` / `ProjectCreate`
- [x] `backend/migrations/versions/` — новая Alembic-миграция
- [ ] Проверить: `alembic upgrade head` проходит без ошибок

---

### 17.2 — backend: `paragraph_diff.py`

#### Зависимости

- 17.1 (модели и схемы готовы)

#### Что делаем

Новый файл `backend/app/services/paragraph_diff.py` с чистой функциональностью без I/O:

```python
def split_paragraphs(text: str) -> list[str]:
    """Разбивает текст на абзацы по пустым строкам. Возвращает непустые блоки."""

def find_dirty_paragraphs(new_paras: list[str], old_paras: list[str]) -> list[int]:
    """
    Возвращает индексы абзацев в new_paras, которых нет в old_paras (по хэшу).
    Использует SequenceMatcher для выравнивания, чтобы правильно обработать
    вставку/удаление абзацев в середине.
    """

def map_unchanged_to_old(new_paras: list[str], old_paras: list[str]) -> dict[int, int]:
    """
    Возвращает {индекс_в_new: индекс_в_old} для абзацев, не изменившихся между
    new и old (одинаковый язык — хэши совпадают). Использует SequenceMatcher на
    хэшах, поэтому вставка/удаление абзацев корректно сдвигают индексы.
    """
    # ВАЖНО: исходно планировался align_paragraphs(old_en, old_ru) на хэшах, но
    # абзацы на разных языках не совпадают по хэшу. Поэтому выравнивание
    # old_en↔old_ru делается позиционно (см. 17.4), а map_unchanged_to_old
    # связывает new↔old_en в пределах одного языка.

def merge_translations(
    new_paras: list[str],
    dirty_indices: list[int],
    new_translations: dict[int, str],
    aligned_old_ru: dict[int, str],
) -> str:
    """
    Собирает итоговый файл: для чистых абзацев берёт old_ru,
    для грязных — new_translations[i].
    """
```

#### Шаги выполнения

- [x] Создать `backend/app/services/paragraph_diff.py` с функциями выше
- [x] Покрыть тестами: файл с 10 абзацами, изменить 2 → `find_dirty_paragraphs` возвращает ровно 2 индекса
- [x] Тест: вставка абзаца в середину → выравнивание корректно сдвигает индексы
- [x] Тест: `merge_translations` правильно собирает итоговый текст

---

### 17.3 — backend: webhook — сохранение `before_sha` и `previous_task_id`

#### Зависимости

- 17.1 (поля есть в модели и схеме)

#### Что делаем

В `webhook.py` при создании задачи из push-события:

1. Сохранять `before_sha = payload["before"]` на задаче.
2. Перед созданием задачи выполнять запрос:
   ```sql
   SELECT id FROM tasks
   WHERE file_path = :file_path
     AND project_id = :project_id
     AND status = 'published'
   ORDER BY created_at DESC
   LIMIT 1
   ```
   Если найдено — ставить `previous_task_id = найденный id`.
3. Если задача создаётся вручную (TriggerTranslationDialog) — `previous_task_id = NULL`, `before_sha = NULL` → всегда полный перевод.

#### Шаги выполнения

- [x] `webhook.py` — при итерации по файлам в push-событии: добавить `before_sha` и запрос `previous_task_id`
- [x] Проверить: повторный push одного файла → новая задача имеет `previous_task_id` = id предыдущей опубликованной задачи
- [x] Проверить: первый push (нет опубликованных задач) → `previous_task_id = NULL`

---

### 17.4 — backend: `incremental_translate.py`

#### Зависимости

- 17.2 (`paragraph_diff.py` готов)
- 17.3 (`before_sha` и `previous_task_id` сохраняются)

#### Что делаем

Новый файл `backend/app/services/incremental_translate.py` — оркестрация инкрементального перевода:

```python
async def build_translation_context(
    task: Task,
    project: Project,
    new_en: str,
    github_client: GitHubClient,
) -> TranslationContext:
    """
    Возвращает TranslationContext с полями:
      - content: str — текст для перевода (полный или только грязные абзацы)
      - is_incremental: bool
      - dirty_indices: list[int] — индексы грязных абзацев (пустой при полном переводе)
      - aligned_old_ru: dict[int, str] — выравненные абзацы old_ru (пустой при полном переводе)
      - new_paras: list[str] — абзацы new_en (нужны для merge_translations)
    """
```

Логика внутри:

1. Если `task.previous_task_id is None` или `task.before_sha is None` → вернуть полный перевод.
2. Получить `old_en` из GitHub: `github_client.get_file_at_sha(repo, path, task.before_sha)`.
3. Получить `old_ru` из target-репозитория: `github_client.get_file(target_repo, path)`.
4. Если `old_ru` не найден → полный перевод.
5. Вызвать `find_dirty_paragraphs`, посчитать `ratio`.
6. Если `ratio * 100 > project.incremental_threshold` → полный перевод.
7. Иначе построить `aligned_old_ru` (new-индекс → старый русский абзац) через `map_unchanged_to_old(new, old_en)` + позиционное `old_en[k] ↔ old_ru[k]`, вернуть инкрементальный контекст.

#### Шаги выполнения

- [x] Создать `backend/app/services/incremental_translate.py` с `build_translation_context`
- [x] Определить `TranslationContext` dataclass/TypedDict
- [x] Покрыть тестами: `previous_task_id = None` → возвращает `is_incremental=False`
- [x] Тест: порог 40%, изменено 30% абзацев → `is_incremental=True`
- [x] Тест: порог 40%, изменено 50% абзацев → `is_incremental=False`
- [x] Тест: `old_ru` не найден в target-репо → `is_incremental=False`

---

### 17.5 — backend: pipeline_runner — интеграция инкрементального перевода

#### Зависимости

- 17.4 (`incremental_translate.py` готов)

#### Что делаем

В `pipeline_runner.py` перед вызовом LLM:

1. Вызвать `build_translation_context(task, project, new_en, github_client)`.
2. Если `is_incremental=True` — передать в LLM только грязные абзацы с контекстом инструкции «переведи только эти абзацы».
3. После получения ответа LLM: вызвать `merge_translations` для сборки итогового файла.
4. Записывать в логи задачи: `"Инкрементальный режим: {len(dirty)} из {total} абзацев"` или `"Полный перевод"`.
5. Сохранять на Task поле `incremental_paragraphs_count: int | None` — количество фактически переведённых абзацев (для отображения во фронтенде).

Новое поле в БД (добавить в миграцию 17.1 или отдельной):

```sql
incremental_paragraphs_count INTEGER NULL
incremental_total_paragraphs  INTEGER NULL
```

#### Шаги выполнения

- [x] `pipeline_runner.py` — интегрировать вызов `build_translation_context` перед LLM
- [x] Добавить `merge_translations` после получения ответа при `is_incremental=True`
- [x] Добавить логирование режима перевода в `task.logs`
- [x] `backend/app/models/task.py` — добавить `incremental_paragraphs_count`, `incremental_total_paragraphs`
- [x] `TaskRead` — добавить эти два поля (в `TaskSummary`, чтобы были доступны и списку, и детали)
- [x] Миграция (дополнено в миграции 17.1 `a1b2c3d4e5f6`)
- [x] Проверить end-to-end: webhook push 2 изменённых абзаца → pipeline переводит 2, итоговый файл корректен (покрыто `test_run_task_incremental_merges_dirty_paragraphs`)

> **Корректировка выравнивания (17.2/17.4):** `align_paragraphs` (хэш en↔ru) удалён — английские и русские абзацы не совпадают по хэшу, поэтому чистые абзацы откатывались на английский. Замена: `map_unchanged_to_old(new, old_en)` (one-language SequenceMatcher) + позиционное `old_en[k] ↔ old_ru[k]`. `aligned_old_ru` теперь индексируется по new-индексу, что корректно при вставке/удалении абзацев.

---

### 17.6 — frontend: настройка порога в RepositoryDetailPage

#### Зависимости

- 17.1 (поле `incremental_threshold` в `ProjectRead`)

#### Что делаем

Новая секция «Инкрементальный перевод» в `RepositoryDetailPage.tsx` рядом с секцией «Пайплайн»:

- Числовой input (0–100) для `incremental_threshold`
- Кнопка «Сохранить»
- Подсказка: «Если изменилось больше N% абзацев — файл переводится целиком. 0 — всегда инкрементально, 100 — всегда целиком.»

**Ключи локализации** (`repositories.json`):

```json
{
  "incremental_section_title": "Инкрементальный перевод",
  "incremental_threshold": "Порог полного перевода (%)",
  "incremental_threshold_hint": "Если изменилось больше {{n}}% абзацев — файл переводится целиком. 0 — всегда инкрементально, 100 — всегда целиком."
}
```

#### Шаги выполнения

- [x] `projectsApi.ts` — добавить `incremental_threshold` в тип `Project` и update-мутацию
- [x] `RepositoryDetailPage.tsx` — секция с числовым input и кнопкой сохранения
- [x] Добавить ключи локализации
- [x] Проверить: изменить порог → сохранить → reload → значение сохранилось (покрыто `RepositoryDetailPage.test.tsx`)

> Примечание: backend ограничивает `incremental_threshold` диапазоном 1–100 (`Field(ge=1, le=100)`), поэтому input использует `min=1`, а подсказка скорректирована («1 — почти всегда инкрементально»).

---

### 17.7 — frontend: индикатор инкрементального режима в TaskRow / TaskDetailPage

#### Зависимости

- 17.5 (`incremental_paragraphs_count`, `incremental_total_paragraphs` в `TaskRead`)

#### Что делаем

**`TaskRow.tsx`** — бейдж «Инкрементальный» рядом со статусом, если `task.previous_task_id != null && task.incremental_paragraphs_count != null`.

**`TaskDetailPage.tsx`** — в секции логов или статуса отображать строку:
«Переведено X из Y абзацев» (только при `is_incremental`).

**Ключи локализации** (`tasks.json`):

```json
{
  "incremental_badge": "Инкрементальный",
  "incremental_detail": "Переведено {{dirty}} из {{total}} абзацев"
}
```

#### Шаги выполнения

- [x] `tasksApi.ts` — добавить `incremental_paragraphs_count`, `incremental_total_paragraphs`, `previous_task_id` в тип `Task` (в `TaskSummary`, наследуется `TaskDetail`)
- [x] `TaskRow.tsx` — бейдж «Инкрементальный»
- [x] `TaskDetailPage.tsx` — строка с количеством переведённых абзацев (в `TaskDetailHeader` metaRow)
- [x] Добавить ключи локализации
- [x] Проверить: инкрементальная задача → бейдж виден в списке и детальной странице (покрыто `TaskDetailPage.test.tsx`)

---

### Порядок подэтапов 17

```
17.1  backend: DB schema (previous_task_id, before_sha, incremental_threshold + миграция)
17.2  backend: paragraph_diff.py (split / find_dirty / align / merge)
17.3  backend: webhook — before_sha + previous_task_id при создании задачи
17.4  backend: incremental_translate.py (оркестрация: GitHub fetch + порог + контекст)
17.5  backend: pipeline_runner — интеграция incremental_translate + логи
17.6  frontend: RepositoryDetailPage — настройка incremental_threshold
17.7  frontend: TaskRow / TaskDetailPage — бейдж + счётчик абзацев
```

17.1–17.5 — бэкенд, выполняются последовательно. 17.6 зависит только от 17.1 (API). 17.7 зависит от 17.5.

### Изменения в бэкенде по подэтапам 17

| Подэтап | Изменения в API/моделях                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17.1    | Поля `previous_task_id`, `before_sha` в `tasks`. Поле `incremental_threshold` в `projects`. Alembic-миграция. Обновлены `TaskRead`, `ProjectRead/Update`                     |
| 17.2    | Новый `app/services/paragraph_diff.py`: `split_paragraphs`, `find_dirty_paragraphs`, `map_unchanged_to_old`, `merge_translations`                                            |
| 17.3    | `webhook.py`: сохраняет `before_sha` из push-payload; ищет `previous_task_id` среди опубликованных задач                                                                     |
| 17.4    | Новый `app/services/incremental_translate.py`: `build_translation_context` — GitHub fetch `old_en` + `old_ru`, расчёт порога, возврат `TranslationContext`                   |
| 17.5    | `pipeline_runner.py`: вызов `build_translation_context` перед LLM, `merge_translations` после. Поля `incremental_paragraphs_count`, `incremental_total_paragraphs` в `tasks` |

---

## Этап 18 — Перевод YAML TOC-файлов отдельной веткой пайплайна

> **Актуальный полный план вынесен в отдельный документ:** [`yaml-translation-pipeline-plan.md`](yaml-translation-pipeline-plan.md).
> Этот черновой этап оставлен только как исторический контекст и не должен использоваться как основной план реализации.

### Концепция

Добавить поддержку `.yaml` / `.yml` без передачи YAML-структуры в LLM. Markdown и YAML переводятся двумя независимыми форматными ветками:

- `.md` — существующий `TranslationPipeline` без изменения поведения.
- `.yaml` / `.yml` — новый YAML-пайплайн: извлечь только переводимые строковые значения, перевести их отдельным prompt/dictionary, собрать исходный YAML обратно с сохранением структуры.

Первичный целевой сценарий — TOC-файлы вида `api-reference/calendar/b24-toc.yaml`:

```yaml
title: Календарь
href: index.md
items:
  - name: Обзор методов
    href: index.md
  - name: События календаря
    include:
      path: calendar-event/b24-toc.yaml
      mode: link
```

Переводятся только значения `title`, `name` и другие явно разрешённые текстовые поля. `href`, `path`, `mode`, `id`, `slug`, `url`, `include` и технические ключи не отправляются в LLM и не меняются.

### Ключевые решения

1. **YAML — отдельный processor в submodule `pipeline/`**  
   Логика формата живёт в `pipeline/src/processors/yaml_translator/`, а не в `backend`. Backend только разрешает новый формат и запускает пайплайн как раньше.

2. **Отдельный prompt и словарь для YAML**  
   YAML TOC — это навигационные заголовки, а не markdown-документация. Для него нужны отдельные данные:
   - `pipeline/data/yaml_prompt.txt`
   - `pipeline/data/yaml_dictionary.json`
   - `pipeline/data/yaml_glossary.json` при необходимости
   - `pipeline/data/yaml_tm/cache.json` для коротких повторяющихся пунктов меню

3. **LLM получает только текстовые значения**  
   Payload в LLM строится как нумерованный список строк, без YAML-ключей и отступов:

   ```text
   1. Календарь
   2. Обзор методов
   3. Добавить новый календарь
   ```

   Ответ ожидается в таком же нумерованном формате. Processor валидирует количество строк и номера; если ответ некорректен — делает один retry с более жёсткой инструкцией.

4. **Структура YAML сохраняется round-trip parser-ом**  
   Использовать `ruamel.yaml`, потому что `PyYAML` хуже сохраняет исходное форматирование, порядок, кавычки и комментарии. Даже если в текущих TOC комментариев нет, навигационные YAML лучше не пересобирать “с нуля”.

5. **Whitelist вместо эвристики "всё русское"**  
   Не переводить все строки с кириллицей автоматически. В TOC могут появиться технические значения или примеры. Базовый whitelist:
   - `title`
   - `name`
   - `label`
   - `description`

   Whitelist хранить рядом с processor-ом как константу. В дальнейшем можно вынести в `pipeline/data/yaml_keys.json`.

6. **Инкрементальный перевод для YAML — отдельный механизм, не markdown paragraph diff**  
   На первом этапе YAML всегда переводится целиком на уровне извлечённых строк. Это безопаснее, чем применять `paragraph_diff.py`, рассчитанный на markdown-абзацы. Оптимизация позже: сравнивать YAML-path строк (`items[3].name`) и переводить только изменившиеся значения.

7. **Markdown fixers/validators не применяются к YAML**  
   `CellTypeFixer`, `TableClosersFixer`, `TabsIndentFixer`, `InlineCodeFixer`, `StructureValidator` остаются только для `.md`. YAML-пайплайн имеет собственную валидацию: YAML парсится до и после, набор ключей/путей не меняется, изменены только whitelisted values.

### Изменения в pipeline submodule

#### 18.1 — Pipeline dependencies

**Файлы:**

- Изменить: `pipeline/pyproject.toml`
- Изменить: `pipeline/uv.lock` или lock-файл, который используется в submodule

**Что делаем:**

- Добавить зависимость `ruamel.yaml>=0.18`.
- Проверить импорт в локальном окружении pipeline.

**Проверка:**

```bash
cd pipeline
uv sync
uv run python -c "from ruamel.yaml import YAML; print('yaml ok')"
```

#### 18.2 — YAML translator processor

**Файлы:**

- Создать: `pipeline/src/processors/yaml_translator/__init__.py`
- Создать: `pipeline/src/processors/yaml_translator/models.py`
- Создать: `pipeline/src/processors/yaml_translator/extractor.py`
- Создать: `pipeline/src/processors/yaml_translator/batcher.py`
- Создать: `pipeline/src/processors/yaml_translator/facade.py`
- Создать: `pipeline/tests/test_yaml_translator.py`

**Модель:**

```python
@dataclass(frozen=True)
class YamlTextUnit:
    index: int
    path: tuple[str | int, ...]
    key: str
    source: str
```

**Extractor:**

- Загружает YAML через `ruamel.yaml.YAML(typ="rt")`.
- Рекурсивно обходит `CommentedMap` / `CommentedSeq`.
- Создаёт `YamlTextUnit` только для строковых значений, у которых ключ входит в whitelist.
- Пропускает пустые строки и строки без кириллицы.
- Не трогает ключи и не меняет порядок.

**Batcher:**

- Делит units на батчи по размеру, например `max_batch_chars=2500`, потому что TOC-строки короткие.
- Формирует payload вида `1. ...`.
- Парсит ответ строго по номерам.
- При несовпадении количества/номеров делает retry с prompt: “Верни ровно N строк, сохрани номера, без пояснений”.
- Если retry тоже невалиден — падает с понятной ошибкой, задача становится `failed`.

**Facade:**

```python
class YamlTranslator:
    def __init__(self, translator: TranslatorClient, prompt: str, dictionary: dict[str, str], logger: logging.Logger): ...
    def translate(self, content: str) -> str: ...
```

Шаги внутри:

1. Parse YAML.
2. Extract text units.
3. Apply exact dictionary/TM hits до LLM.
4. Translate unresolved units через batcher.
5. Записать переводы обратно в YAML tree по `path`.
6. Dump YAML в строку через `ruamel.yaml`.
7. Validate: YAML парсится, количество extracted paths совпадает, non-whitelisted values не изменились.

**Тесты:**

- `b24-toc.yaml` пример: переводятся `title` и `items[*].name`, `href/include.path/mode` не меняются.
- Вложенный `items -> include` не ломается.
- Строка без кириллицы не отправляется в LLM.
- Dictionary hit не отправляется в LLM.
- Некорректный LLM-ответ вызывает retry.
- После второго некорректного ответа — исключение с текстом `YAML translation response is invalid`.

#### 18.3 — YAML prompt/dictionary data

**Файлы:**

- Создать: `pipeline/data/yaml_prompt.txt`
- Создать: `pipeline/data/yaml_dictionary.json`
- Создать: `pipeline/data/yaml_glossary.json`
- Создать: `pipeline/data/yaml_tm/cache.json`

**Prompt требования:**

- Переводить короткие навигационные заголовки Bitrix24 REST docs.
- Не добавлять точку в конце, если её не было.
- Не расширять текст пояснениями.
- Сохранять стиль title case/sentence case по принятому для docs правилу.
- Сохранять номера строк ответа.
- Не переводить technical identifiers, method names, API object names без словаря.

**Dictionary стартовый набор:**

```json
{
  "Календарь": "Calendar",
  "Обзор методов": "Methods overview",
  "События": "Events",
  "События календаря": "Calendar events",
  "Бронирование ресурсов": "Resource booking"
}
```

Словарь должен быть отдельным от markdown `dictionary.json`, потому что короткие TOC-лейблы часто требуют других формулировок, чем фразы внутри статьи.

#### 18.4 — Pipeline dispatch по расширению

**Файлы:**

- Изменить: `pipeline/src/pipeline.py`
- Изменить: `pipeline/src/processors/parser.py`
- Изменить: `pipeline/src/processors/writer.py`
- Создать: `pipeline/tests/test_pipeline_yaml_dispatch.py`

**Что делаем:**

- Добавить helper:

```python
def detect_document_format(file_path: str | Path) -> Literal["markdown", "yaml"]:
    suffix = Path(file_path).suffix.lower()
    if suffix == ".md": return "markdown"
    if suffix in {".yaml", ".yml"}: return "yaml"
    raise ValueError(...)
```

- `MarkdownParser` оставить markdown-only или переименовать в `TextFileParser`; главное — не ломать текущие тесты.
- `MarkdownWriter.save()` расширить до writer-а, который сохраняет исходное расширение:
  - `.md` → `.md`
  - `.yaml` → `.yaml`
  - `.yml` → `.yml`
- В `run()` сделать dispatch:

```python
if detect_document_format(file_path) == "yaml":
    YamlTranslationPipeline(...).run()
else:
    TranslationPipeline(...).run()
```

- YAML ветка не вызывает markdown pre_translator/protector/fixers/validator.
- Markdown ветка остаётся byte-for-byte совместимой по поведению.

**Тесты:**

- `.md` вызывает существующий markdown pipeline.
- `.yaml` вызывает YAML pipeline и создаёт output с тем же расширением.
- `.yml` создаёт `.yml`.
- Unsupported extension падает с понятной ошибкой.

### Изменения в docflow-web backend

#### 18.5 — Общая утилита поддерживаемых форматов

**Файлы:**

- Создать: `backend/app/services/file_formats.py`
- Изменить: `backend/app/services/tasks.py`
- Изменить: `backend/app/api/routes/webhook.py`
- Изменить: `backend/app/services/github.py`

**Что делаем:**

```python
TRANSLATABLE_SUFFIXES = {".md", ".yaml", ".yml"}

def is_translatable_path(path: str) -> bool: ...
def ensure_translatable_path(path: str, field: str) -> None: ...
def content_type_for_path(path: str) -> str: ...
```

Заменить все проверки `.endswith(".md")` на `is_translatable_path`.

Точки замены:

- `webhook._collect_markdown_files` → `_collect_translatable_files`
- `GitHubClient.get_repo_tree()` — возвращать `.md`, `.yaml`, `.yml`
- `create_manual_task_from_upload()` — разрешить YAML
- `parse_upload_payload()` — разрешить target path YAML
- Swagger/API descriptions — заменить “markdown-файлы” на “поддерживаемые текстовые файлы”

**Тесты:**

- Webhook создаёт задачу для `b24-toc.yaml`.
- Webhook создаёт задачу для `.yml`.
- Webhook игнорирует `.json`.
- Manual repo trigger принимает `.yaml`.
- Upload принимает `.yaml`, отклоняет `.json`.

#### 18.6 — `pipeline_runner.py` output path

**Файлы:**

- Изменить: `backend/app/services/pipeline_runner.py`
- Изменить: `backend/tests/test_pipeline_runner.py`

**Что делаем:**

Сейчас runner ожидает:

```python
output_file = output_dir / input_file.name
```

Это корректно только если pipeline сохраняет output с тем же именем. В плане закрепить контракт: pipeline для любого поддерживаемого формата пишет output с тем же basename и suffix. Добавить явную проверку:

```python
if not output_file.exists():
    raise FileNotFoundError(f"Pipeline output not found: {output_file}")
```

Дополнить лог:

```text
Полный перевод
Формат: yaml
```

Инкрементальный markdown-контекст отключать для YAML:

```python
if is_yaml_path(task.file_path):
    translation_ctx = None
```

**Тесты:**

- YAML task запускает pipeline и читает `output/b24-toc.yaml`.
- Для YAML не вызывается `incremental_translate.build_translation_context`.
- Missing output даёт `failed` с понятной ошибкой.

### Изменения во frontend

#### 18.7 — UI: выбор, upload, download YAML

**Файлы:**

- Изменить: `frontend/src/features/tasks/ui/TriggerTranslationDialog/TriggerTranslationDialog.tsx`
- Изменить: `frontend/src/features/tasks/lib/downloadMd.ts`
- Изменить: `frontend/src/features/tasks/ui/TaskTypeIcon/TaskTypeIcon.tsx`
- Изменить: `frontend/src/locales/ru/tasks.json`
- Изменить: `frontend/tests/integration/TaskListPage.test.tsx`
- Изменить: `frontend/tests/unit/downloadMd.test.ts`

**Что делаем:**

- Upload `accept` заменить на:

```tsx
accept = '.md,.yaml,.yml,text/markdown,text/yaml,application/yaml,application/x-yaml'
```

- Переименовать `downloadMd.ts` в `downloadTextFile.ts` или оставить имя с обратной совместимостью, но MIME выбирать по расширению:
  - `.md` → `text/markdown;charset=utf-8`
  - `.yaml`, `.yml` → `text/yaml;charset=utf-8`
  - fallback → `text/plain;charset=utf-8`

- В диалоге запуска заменить тексты “.md файл” на “.md, .yaml или .yml файл”.
- `TaskTypeIcon` может показывать отдельный YAML icon/label или общий file icon с `YAML` badge.

**Тесты:**

- Upload input принимает `.yaml`.
- Download YAML создаёт blob с `text/yaml`.
- В списке/детали YAML задача отображает путь без markdown-specific текста.

### Документация и API

#### 18.8 — Обновить docs

**Файлы:**

- Изменить: `docs/api.md`
- Изменить: `docs/architecture.md`
- Изменить: `docs/pipeline-integration.md`
- Изменить: `backend/README.md`
- Изменить: `frontend/docs/pages.md`

**Что обновить:**

- В webhook описать “translatable files: `.md`, `.yaml`, `.yml`”.
- В manual trigger/upload описать новые расширения.
- В architecture добавить два pipeline формата: Markdown и YAML.
- В pipeline integration описать `yaml_translator` processor и отдельные `yaml_*` data files.

### Порядок подэтапов 18

```
18.1  pipeline: добавить ruamel.yaml dependency
18.2  pipeline: yaml_translator processor + unit tests
18.3  pipeline: yaml_prompt/yaml_dictionary/yaml_tm data
18.4  pipeline: dispatch .md vs .yaml/.yml + writer output suffix
18.5  backend: разрешить translatable suffixes во webhook/manual/upload/repo tree
18.6  backend: pipeline_runner contract + отключение incremental для YAML
18.7  frontend: upload/download/UI labels для YAML
18.8  docs: обновить API/architecture/pipeline docs
```

18.1–18.4 выполняются в submodule `pipeline/` и коммитятся в репозиторий DocFlowAI. После этого в `docflow-web` обновляется pointer submodule (`git add pipeline`). 18.5–18.8 выполняются в основном репозитории.

### Изменения в бэкенде по подэтапам 18

| Подэтап | Изменения                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18.5    | Новый `file_formats.py`; `.md/.yaml/.yml` в webhook, manual repo trigger, upload validation, GitHub tree listing. Обновить тексты ошибок и OpenAPI descriptions |
| 18.6    | `pipeline_runner.py`: формат в логах, YAML без incremental context, явная проверка output-файла с тем же suffix                                                 |

### Риски и митигация

| Риск                                      | Митигация                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| LLM вернул меньше/больше строк            | Строгий numbered protocol + retry; после второго сбоя задача `failed`                                |
| LLM перевёл method/API identifiers        | Отдельный YAML prompt + yaml dictionary + запрет переводить identifiers без словаря                  |
| YAML форматирование изменилось            | `ruamel.yaml` round-trip mode; тесты на сохранение `href/include/path/mode`                          |
| Markdown pipeline сломался из-за dispatch | Тест на `.md` ветку и запрет менять markdown processor/fixers в 18.4                                 |
| Инкрементальный перевод применился к YAML | Явный guard в `pipeline_runner`: YAML всегда full на первом этапе                                    |
| Смешались markdown и YAML словари         | Отдельные `yaml_*` data files; markdown `dictionary.json/prompt.txt` не используются в YAML pipeline |

### Definition of Done

- Push с изменением `api-reference/calendar/b24-toc.yaml` создаёт задачу.
- Задача переводится в фоне и получает `status=done`.
- В `translated_content` переведены только `title` и `name`.
- `href`, `include.path`, `include.mode` остались без изменений.
- Публикация пишет `.yaml` в target repo по тому же path.
- `.md` задачи проходят старые тесты без изменения поведения.
- Тесты зелёные:

```bash
cd pipeline && uv run pytest
cd backend && python -m pytest
npm --prefix frontend test -- TaskListPage.test.tsx downloadMd.test.ts
```
