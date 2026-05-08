# DocFlow Web — Frontend

## Стек

### Ядро

| Пакет               | Версия | Роль                     |
| ------------------- | ------ | ------------------------ |
| React               | 19     | UI                       |
| TypeScript          | 6      | Типизация                |
| Vite                | 8      | Сборка                   |
| react-router-dom    | 7      | Роутинг                  |
| @reduxjs/toolkit    | 2      | State + RTK Query        |
| react-redux         | 9      | React-интеграция Redux   |
| axios               | 1      | HTTP (baseQuery)         |
| dayjs               | latest | Форматирование дат       |
| react-hook-form     | 7      | Формы                    |
| @hookform/resolvers | 5      | RHF + zod                |
| zod                 | 4      | Валидация схем + типы    |
| recharts            | 3      | Графики (Analytics)      |
| sonner              | 2      | Toast-уведомления        |
| clsx                | 2      | Условные CSS-классы      |
| lucide-react        | latest | Иконки (SVG, tree-shake) |

### Diff / редактор

| Пакет                                         | Версия | Роль          |
| --------------------------------------------- | ------ | ------------- |
| @codemirror/view, state, lang-markdown, merge | 6      | Diff-редактор |

### Radix UI (accessible примитивы)

| Пакет                         | Где используется                    |
| ----------------------------- | ----------------------------------- |
| @radix-ui/react-dialog        | Модалки (Onboarding, Confirm)       |
| @radix-ui/react-tabs          | TaskDetail (Diff / Logs / Conflict) |
| @radix-ui/react-dropdown-menu | Меню действий по задаче             |
| @radix-ui/react-tooltip       | Hover на SHA, статусы, пути         |
| @radix-ui/react-checkbox      | Batch-select задач                  |
| @radix-ui/react-select        | Стилизуемые dropdown-фильтры        |
| @radix-ui/react-popover       | Date picker, фильтры                |
| @radix-ui/react-progress      | Прогресс-бар пайплайна              |

### Дополнительные UX-библиотеки

| Пакет                       | Назначение                                     |
| --------------------------- | ---------------------------------------------- |
| @tanstack/react-virtual     | Виртуализация длинных списков (TaskList, логи) |
| cmdk                        | Командная палитра (`Cmd+K` навигация)          |
| react-hotkeys-hook          | Горячие клавиши (`g t` → tasks, `Esc` → close) |
| react-day-picker            | Date picker (Analytics, History фильтры)       |
| react-markdown + remark-gfm | Preview-вкладка markdown в TaskDetail          |
| shiki                       | Подсветка code-блоков в markdown preview       |
| framer-motion               | Анимации переходов и появления                 |
| papaparse                   | Экспорт Analytics в CSV                        |

### Observability

| Пакет         | Роль                                |
| ------------- | ----------------------------------- |
| @sentry/react | Error tracking, source maps в проде |

CSS-фреймворк не используется — чистый CSS + CSS Modules.
React Query и Zustand не используются — server state через RTK Query, client state через slices.

## Запуск

```bash
npm install
npm run dev      # localhost:5173
```

Backend: `localhost:8000`. Vite проксирует `/api/*` → `localhost:8000/*`.

## Архитектура — Feature Colocation

```
src/
├── app/
│   ├── router.tsx          # все маршруты
│   ├── App.tsx
│   └── styles/
│       └── vars.css        # CSS-переменные дизайн-системы
├── features/
│   ├── tasks/
│   │   ├── ui/             # TaskList, TaskDetail, TaskRow, CommitGroup, DiffEditor, ConflictEditor
│   │   ├── api/            # tasksApi.ts — RTK Query endpoints
│   │   ├── model/          # uiSlice.ts (batch, filters), types.ts
│   │   └── hooks/          # useSSE.ts, useBatchSelect.ts
│   ├── auth/
│   │   ├── ui/             # Login, Register
│   │   ├── api/            # authApi.ts
│   │   └── model/          # authSlice.ts, types.ts
│   ├── projects/
│   │   ├── ui/             # Repositories page
│   │   ├── api/            # projectsApi.ts
│   │   └── model/          # types.ts
│   ├── history/
│   ├── analytics/
│   ├── dictionaries/
│   └── notifications/
├── shared/
│   ├── ui/                 # Sidebar, Button, Badge, StatusPill — переиспользуемые компоненты
│   ├── api/
│   │   └── baseApi.ts      # createApi + axiosBaseQuery
│   ├── store/
│   │   └── index.ts        # configureStore, RootState, AppDispatch
│   └── lib/
│       ├── axios.ts         # axios instance + interceptors
│       └── date.ts          # dayjs helpers
└── pages/                  # тонкие обёртки — только импорт фичи + Layout
    ├── TaskListPage.tsx
    ├── TaskDetailPage.tsx
    └── ...
```

### Правила

- `features/X` — всё что относится к домену X: UI, API, типы, хуки, стейт.
- `shared/ui` — только компоненты без бизнес-логики и без импортов из `features/`.
- `shared/api/baseApi.ts` — один `createApi`, все `tasksApi`, `projectsApi` и т.д. инжектируют эндпоинты через `baseApi.injectEndpoints`.
- `pages/` — тонкий слой: обернуть фичу в `<Layout>`, пробросить params из роутера.

## State

**RTK Query** (`features/*/api/`) — server state:

- теги инвалидации: `Task`, `Project`, `History`, `Dictionary`, `NotificationChannel`
- кеш, loading/error, background refetch — из коробки

**RTK slices** (`features/*/model/`) — client state:

`authSlice`:

```ts
{ user: UserRead | null, isAuthenticated: boolean }
```

`uiSlice` (tasks):

```ts
{ selectedTaskIds: string[], batchMode: boolean, filters: { status: string | null, projectId: string | null } }
```

## Роутинг

```
/login              — публичный
/register           — публичный
/*                  — ProtectedRoute (redirect → /login если не авторизован)
  /tasks            — TaskList (default)
  /tasks/:id        — TaskDetail
  /history          — History
  /analytics        — Analytics
  /repositories     — Repositories
  /dictionaries     — Dictionaries
  /settings         — Settings
```

## Real-time (SSE)

`features/tasks/hooks/useSSE.ts` — подключается к `GET /tasks/:id/events` пока `status === 'running'`.

События:

- `stage_update` — этап пайплайна + индекс
- `log_line` — строка лога
- `status_change` — финальный статус, после которого хук закрывает соединение и триггерит инвалидацию кеша задачи

## Дизайн

Макеты: `docs/designs/`

- `dashboard_v4.html` — TaskList: группировка по коммитам, live-прогресс, batch-режим (floating bar), вкладка «К публикации», пустые состояния
- `taskdetail_v1.html` — TaskDetail: три состояния (Done+Diff, Running+Logs, Conflict+3-way merge)

CSS-переменные (`src/app/styles/vars.css`):

```css
--bg: #0f0f0f;
--surface: #161616;
--surface-hover: #1e1e1e;
--border: #262626;
--text: #ededed;
--text-dim: #666;
--text-dimmer: #555;
--text-path-dim: #444;
--accent: #ffffff;
```

Шрифты: Inter — UI, JetBrains Mono — пути, SHA, код, логи.

## Тестирование

| Пакет                       | Назначение                                 |
| --------------------------- | ------------------------------------------ |
| vitest                      | Unit / integration runner (нативно с Vite) |
| jsdom                       | DOM-окружение для vitest                   |
| @testing-library/react      | Рендер компонентов в тестах                |
| @testing-library/user-event | Имитация действий пользователя             |
| @testing-library/jest-dom   | Custom matchers (`toBeInTheDocument`)      |
| msw                         | Мок API на уровне network (для RTK Query)  |
| @playwright/test            | E2E-тесты (login → publish flow)           |

Запуск:

```bash
npm run test           # unit + integration через vitest
npm run test:watch     # watch mode
npm run e2e            # playwright (после реализации)
```

## Инструменты

- ESLint: TypeScript + react-hooks + unused-imports
- Prettier
- Husky + lint-staged: pre-commit форматирование и линтинг
- TypeScript: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
- rollup-plugin-visualizer: `npm run build` — генерирует `stats.html` с разбивкой бандла

## Observability

`@sentry/react` инициализируется в `app/main.tsx` при `import.meta.env.PROD`:

```ts
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
})
```

DSN задаётся через переменную окружения `VITE_SENTRY_DSN` в `.env.production`.
В dev Sentry выключен.
