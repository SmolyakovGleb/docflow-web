# DocFlow Web — Frontend

## Стек

| Пакет                                         | Версия | Роль                   |
| --------------------------------------------- | ------ | ---------------------- |
| React                                         | 19     | UI                     |
| TypeScript                                    | 6      | Типизация              |
| Vite                                          | 8      | Сборка                 |
| react-router-dom                              | 7      | Роутинг                |
| @reduxjs/toolkit                              | 2      | State + RTK Query      |
| react-redux                                   | 9      | React-интеграция Redux |
| axios                                         | 1      | HTTP (baseQuery)       |
| dayjs                                         | latest | Форматирование дат     |
| @codemirror/view, state, lang-markdown, merge | 6      | Diff-редактор          |

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

- `dashboard_v3.html` — TaskList: группировка по коммитам, live-прогресс, batch-режим, пустые состояния

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

## Инструменты

- ESLint: TypeScript + react-hooks + unused-imports
- Prettier
- Husky + lint-staged: pre-commit форматирование и линтинг
- TypeScript: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
