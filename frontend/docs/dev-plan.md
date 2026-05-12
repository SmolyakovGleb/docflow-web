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

### Файлы

- `src/features/analytics/api/analyticsApi.ts`
- `src/features/analytics/ui/AnalyticsPage.tsx`
- `src/features/analytics/ui/StatCard.tsx` — 4 карточки сверху
- `src/features/analytics/ui/TasksPerDayChart.tsx` — recharts stacked bar
- `src/features/analytics/ui/SuccessRateChart.tsx` — recharts line
- `src/features/analytics/ui/TopErrorsTable.tsx`
- `src/features/analytics/ui/ExportCsvButton.tsx` — papaparse blob download
- `src/pages/AnalyticsPage.tsx`

### Детали реализации

- `useGetAnalyticsQuery({ project_id, from, to })`
- StatCards: total, success rate, avg duration, опубликовано в диапазоне
- Stacked bar: tasks_per_day по статусам с цветами из палитры
- Line chart: success rate per day (агрегация на фронте — backend возвращает per_day, считаем rate из bar-данных)
- TopErrorsTable: ряды с visual proportion bar
- CSV экспорт: формат `date,total,done,failed,published,success_rate`

### Используемые API

- `GET /analytics?project_id=&from=&to=`

### Локализация

- `analytics.*`

### Тесты

**Unit:**

- `csvExport.test.ts` — генерация CSV корректная

**Integration:**

- `AnalyticsPage.test.tsx` — графики получают данные из мока

### Проверка

- Графики отображаются, фильтры работают
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

## Этап 12 — Onboarding + Command Palette + 404 + Polish

Финальные сборки и cross-cutting фичи.

### Зависимости

- Этапы 5, 6 (нужны Projects и Tasks для cmdk)

### Файлы

- `src/app/OnboardingDialog.tsx` — модалка с 3 шагами
- `src/app/OnboardingDialog.module.css`
- `src/features/cmdk/ui/CommandPalette.tsx` — cmdk Dialog
- `src/features/cmdk/hooks/useCmdkData.ts` — поиск по tasks/projects/actions
- `src/pages/NotFoundPage.tsx`
- `src/app/ErrorBoundary.tsx` — Sentry catch + fallback UI
- `src/shared/ui/Toast/setup.tsx` — расширить, добавить promise-toasts

### Детали реализации

- **OnboardingDialog**: показывается в `App.tsx` при условии `user.github_linked === false || projects.length === 0`. Skip → localStorage флаг `onboarding_skipped=true`. На init компонента — проверка флага, если true → не рендерится
- **3 шага** в state machine `currentStep: 1 | 2 | 3`:
  - **Шаг 1 «Привязать GitHub»** — иконка `lucide:github`, описание, primary-кнопка «Привязать GitHub» (`window.location.href = '/api/auth/github/connect'`). При возврате с callback (`user.github_linked === true`) → автоматический переход на шаг 2
  - **Шаг 2 «Создать проект»** — иконка `lucide:folder-git`, описание, primary-кнопка «Создать проект» (закрывает dialog + `navigate('/repositories/new')`). Если проектов > 0 — автоматический переход на шаг 3
  - **Шаг 3 «Настроить webhook»** — иконка `lucide:webhook`, текст «Скопируйте URL и секрет в GitHub Webhook Settings», ссылка «Открыть GitHub Webhook docs» + primary-кнопка «Готово» (закрывает + ставит флаг)
- Stepper-индикатор сверху: 3 круга соединённых линиями. Текущий highlighted (border белым), пройденные с галочкой, будущие dim
- Footer: «Пропустить онбординг» (ghost) + primary-action текущего шага
- **CommandPalette**: открывается через `useSelector(cmdkSlice.selectors.isOpen)` (слайс был создан в Этапе 4). `Cmd+K` уже зарегистрирован в Layout. Radix Dialog 640px вверху
- Поиск группированный: задачи (последние 5 совпадений) / проекты / действия (статичный список)
- 404: «404» большой + «На главную»
- ErrorBoundary вокруг всего App, catch unhandled errors → Sentry + fallback
- Beforeunload warning только когда есть dirty где-то (вынести в `useDirty` хук, использован в Этапе 7)

### Используемые API

- `GET /tasks` (для cmdk поиска — последние 50)
- `GET /projects` (для cmdk)

### Локализация

- `onboarding.*`
- `cmdk.*`
- `notFound.*`

### Тесты

**Unit:**

- `useCmdkData.test.ts` — фильтрация по поисковому запросу

**Integration:**

- `OnboardingDialog.test.tsx` — рендерится при условиях, Skip → localStorage
- `CommandPalette.test.tsx` — поиск работает, навигация по результатам

**E2E (`e2e/onboarding_flow.spec.ts`):**

- Newly registered user → onboarding modal появляется → Skip → modal закрыт + localStorage флаг

### Проверка

1. Новый пользователь видит onboarding после регистрации
2. `Cmd+K` открывает палитру
3. 404 для несуществующего URL
4. Sentry получает события (с тестовым DSN)

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
12  Onboarding + Cmdk + 404 + ErrorBoundary
12a Заглушки для служебных страниц
13  Финальная сборка
```

Этапы 1–4 — фундамент, без UI-фич, но обязательны.
Этапы 5–5а — подготовка: создание проекта + туннель для реального webhook.
Этапы 6–7 — основной MVP-флоу: задача → детали → публикация.
Этапы 8–11 — вспомогательные экраны.
Этап 12 — cross-cutting features.
Этап 13 — polish.

---

## Какие изменения нужны в бэкенде по этапам

| Этап | Изменения в API/моделях                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5    | + `POST /projects/{id}/regenerate-webhook-secret`, + `GET /me/github-repos` (обёртка над `GitHubClient.get_user_repos()`)                                                                                                                                                                                                                                                                                                                                                                   |
| 6    | Расширить `TaskSummary`: `github_sha`, `commit_message`, `commit_author_name`, `commit_author_login`, `project_name`, `current_stage`. Расширить `Task` модель: `commit_author_name`, `commit_author_login`, `current_stage`. Миграция. Заполнение `commit_author_*` в webhook, `current_stage` в `pipeline_runner` на каждом stage_update. + `?search=` (ILIKE по `file_path` и `commit_message`) в `GET /tasks`. Расширить `GET /health` до `{status, pipeline_version, last_webhook_at}` |
| 7    | + статус `conflict` в Task (CHECK constraint обновить) + поля `conflict_base/ours/theirs` (text nullable) + миграция. `pipeline_runner` сбрасывает их на `null` при старте. На успешный publish — обратно `null` + `status='published'`                                                                                                                                                                                                                                                     |

Все остальные этапы используют существующее API без изменений.
