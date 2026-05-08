# Зафиксированные решения

Все ответы на вопросы из аудита перед стартом разработки фронтенда.
Решения принимались на этапе подготовки и привязаны к плану из `dev-plan.md` (будет создан после).

---

## Изменения в API (бэкенд)

| #   | Решение                                                                                            | Действие                                                                                      |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `TaskSummary` получает `github_sha`, `commit_message`, `commit_author_name`, `commit_author_login` | Миграция `Task` + поля заполняются в webhook из `payload.head_commit.author`                  |
| 2   | `TaskSummary` получает `project_name` (через JOIN)                                                 | Денорм для UI без N+1                                                                         |
| 3   | Добавить эндпоинт `GET /projects/{id}/files?path=<dir>`                                            | Использует уже хранимый OAuth-токен через `GitHubClient.get_repo_tree`                        |
| 4   | Расширить `GET /health` до `{status, pipeline_version, last_webhook_at}`                           | `pipeline_version` через `git rev-parse HEAD` в `pipeline/`, кэш в settings                   |
| 5   | Добавить статус `conflict` + поля `conflict_base/ours/theirs` в `Task`                             | Миграция, `CHECK constraint` обновлён, после успешного publish → возврат в `done`/`published` |

## UX-стратегия (фронтенд)

| #   | Решение                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | Real-time для списка: RTK Query `pollingInterval: 15s` на TaskList page. Глобальный SSE — post-MVP                                                      |
| 7   | Все фильтры TaskList в URL (`useSearchParams`). Slice только для `selectedTaskIds` и `batchMode`                                                        |
| 8   | TaskDetail tabs в URL: `/tasks/:id?tab=diff\|logs\|conflict`. Дефолт по статусу: `failed→logs`, `conflict→conflict`, иначе `diff`                       |
| 9   | `AuthBootstrap` в `App.tsx`: `/auth/me` при mount, splash до ответа. Axios response interceptor: 401 → `clearUser()` + redirect `/login`                |
| 10  | 3-way merge MVP: 3 read-only колонки + один редактируемый CodeMirror внизу с `theirs` или `ours` стартовым. Hunk accept/reject — post-MVP               |
| 11  | Глобально в RTK Query middleware: 401 → logout. Локально per-endpoint: 409/502 → toast (`sonner`) и dispatch на slice                                   |
| 12  | Backend errors через map `errorMessages.ts` (en → ru). Error codes — post-MVP                                                                           |
| 13  | Webhook secret на странице создания: модалка с предупреждением + копирование. Эндпоинт `POST /projects/{id}/regenerate-webhook-secret` — добавить сразу |

## Дизайн-система и стилизация

| #   | Решение                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------- |
| 14  | По дизайну, ускоряя через библиотеки: Radix-примитивы для поведения, CSS Modules для вида. `shadcn/ui` cli не используем (Tailwind-ориентирован)   |
| 15  | MVP — только dark тема. Структура CSS-переменных совместима с `[data-theme]` на корне                                                              |
| 16  | i18n настроен с самого начала: `react-i18next` + `i18next-browser-languagedetector`. Все строки через `t('key')`. Подробности — [i18n.md](i18n.md) |
| 17  | Виртуализация: только Diff (CodeMirror — внутри). Pipeline logs — без виртуализации (объёмы небольшие). TaskList виртуализировать когда >500 задач |
| 18  | Onboarding modal в `App.tsx` после Auth bootstrap. Условие: `user.github_linked === false                                                          |     | projects.length === 0`. Закрытие через "Skip" → флаг в localStorage |
| 19  | CodeMirror Diff: левая (RU) read-only, правая (EN) editable. Save через явную кнопку, debounce auto-save не делаем                                 |

## Процесс

| #   | Решение                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 20  | Тесты: 100% slice reducers, 100% custom hooks, smoke API через MSW, сложные компоненты только. Coverage measurement не настраивается |
| 21  | Без Storybook                                                                                                                        |
| 22  | Без PWA / offline                                                                                                                    |
