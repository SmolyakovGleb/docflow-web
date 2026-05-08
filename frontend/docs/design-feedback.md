# Замечания и инструкции для дизайн-модели

Все решения уже приняты. Это техническое задание для AI-модели, генерирующей макеты.
Каждый раздел содержит **конкретные изменения** и **исчерпывающие требования**.

---

## Глобальные конвенции (актуально для всех экранов)

### Типографика

- **UI-шрифт:** Inter — для всех текстовых элементов
- **Mono-шрифт:** JetBrains Mono — для путей файлов, SHA, кода, логов
- **Размеры:** 11px (mini), 12px (caption), 13px (body), 13.5px (UI default), 14px (page body), 16px (lead), 22px (h2), 34px (h1)

### Цветовая палитра (только dark в MVP)

```
--bg:           #0f0f0f   /* фон страницы */
--surface:      #161616   /* карточки, поповеры */
--surface-hover: #1e1e1e  /* hover-фон */
--border:       #262626   /* основные границы */
--border-soft:  #1e1e1e   /* мягкие разделители */
--text:         #ededed   /* основной текст */
--text-dim:     #666      /* вторичный текст */
--text-dimmer:  #555      /* подписи */
--text-path-dim:#444      /* dimmer-фрагменты путей */
--accent:       #ffffff   /* primary (button text) */

/* Состояния */
--status-queued:  #888    /* серый */
--status-running: #6db8ff /* синий */
--status-done:    #6dd394 /* зелёный */
--status-failed:  #ff6d6d /* красный */
--status-published: #b07dff /* фиолетовый */
--status-conflict: #ffb547 /* оранжевый */
```

### Spacing

- Базовый шаг: 4px. Используются 4, 6, 8, 10, 12, 14, 16, 20, 22, 24, 28, 32, 38, 56
- Page padding: 38px top / 56px sides / 80px bottom
- Card padding: 14–22px

### Иконки

- Используем библиотеку **lucide-react** (импорт по имени), не inline SVG
- Размеры: 13px (mini в кнопках), 15px (nav, toolbar), 16px (default), 24px (header)
- Stroke-width: 1.5 везде
- В макетах AI указывать имя иконки: `lucide:check`, `lucide:github`, `lucide:circle-dot`

### Аватары пользователей

- Круглые, размер 26px (default), 22px (mini), 18px (avatar-tiny)
- Инициалы (первая буква имени + первая буква фамилии, верхний регистр)
- Фон: монохромный — `var(--surface-hover)` (#1e1e1e). Не используем градиенты или цветные фоны
- Текст инициалов: `var(--text)`, `font-weight: 600`, `font-size: 11px`

### Mobile/tablet

- **Desktop-only в MVP.** Minimum viewport: 1280px
- При уже 1280px показываем full-screen заглушку: «DocFlow оптимизирован для desktop. Откройте на компьютере» + ссылка
- Не тратить бюджет дизайна на mobile/tablet версии

### Loading skeleton

- Серые прямоугольники с пульсирующей анимацией (1.4s, ease-in-out, opacity 0.5–1.0)
- Цвет: `var(--surface-hover)` на фоне `var(--surface)`
- Радиус: совпадает с радиусом конечного элемента (4–6px для строк, 8px для карточек)

### Toasts (sonner)

- Позиция: top-right, gap 8px между toast'ами
- Фон: `var(--surface)`, граница 1px `var(--border)`, радиус 8px, padding 12px 16px
- Левая accent-полоса 3px шириной по статусу:
  - success → `var(--status-done)`
  - error → `var(--status-failed)`
  - info → `var(--status-running)`
- Auto-dismiss: 4 сек для info/success, 8 сек для error, бесконечно для loading
- Иконка слева 16px (lucide: check-circle / x-circle / info)

### Empty states (общий шаблон)

- Центрированный контент по вертикали и горизонтали
- Иконка 32px в круге `var(--surface)` 64px
- Title 16px `font-weight: 600`
- Description 13.5px `var(--text-dim)`, max-width 420px
- 1–2 actions ниже
- Опциональный foot-text 12px

### ConfirmDialog

- Radix Dialog overlay (50% black) + центрированная модалка 480px
- Header: title 16px + close button (×)
- Body: описание действия + последствия
- Footer: 2 кнопки справа, primary action с цветом по риску (red для destructive)

---

## TaskList (`dashboard_v4.html`) — конкретные правки

### Что убираем

1. **Счётчики на пунктах sidebar** — убрать «247», «8». Sidebar остаётся только с иконкой + текстом
2. **Popover «RU → EN»** в toolbar — убрать целиком. В MVP только одно направление
3. **Текст «Сортировка: сначала новые»** в toolbar — убрать. Всегда сортировка `created_at DESC`
4. **Tab «Готово»** — убрать. Дублирует «К публикации». Оставить только: `Все | В очереди | В работе | К публикации | Опубликовано | Ошибки`
5. **Conflict-icon в строке статуса `running`** — убрать. Иконка появляется только когда `status=conflict`
6. **Pipeline progress «4/7»** — убрать дробь и progress-bar. Оставить только текущий этап + анимированный spinner + elapsed time

### Что меняем

1. **Stat-chips сверху** — оставить 4 чипа, но изменить источники данных:
   - «в работе» = `tasks_by_status.running` из `GET /analytics`
   - «ждут проверки» = `tasks_by_status.done`
   - «ошибки» = `tasks_by_status.failed`
   - «опубликовано сегодня» = из `tasks_per_day` за текущую дату по UTC
2. **Footer** — формат: «Пайплайн `a3f2c1d` · Последняя синхронизация `2 мин назад` · Показано 12 из 247 задач». SHA отображать в JetBrains Mono
3. **Search bar** — добавить debounced query-параметр в URL `?search=`. Бэкенд получит новый параметр (ILIKE по `file_path` и `commit_message`)
4. **Webhook-индикатор «webhook активен»** — показывать всегда зелёным. Бэкенд не трекает реальный статус webhook'а в MVP, индикатор статичный
5. **Pipeline-stage отображение в строке** — текст вида «Pipeline · 12 с» с пульсирующей точкой. Без числовых стадий

### Что добавляем

1. **Состояние loading** — skeleton 8 строк (3 commit-group по ~2–3 строки)
2. **Состояние error** — empty state иконка `lucide:wifi-off` + «Не удалось загрузить задачи» + кнопка «Повторить»
3. **Banner «новые задачи»** — узкая полоса под tabs, появляется когда polling обнаружил новые IDs: «Появилось 3 новых задачи · обновить». При клике — refetch query
4. **Иконка типа задачи в строке** — слева от path: `lucide:git-commit-horizontal` для webhook-задач, `lucide:upload` для manual+upload, `lucide:terminal` для manual+from-repo. Размер 13px, цвет `var(--text-dimmer)`

### Empty state «нет задач для этого фильтра»

- Когда применён фильтр (status, project, search) и результат пустой — отдельное состояние
- Иконка `lucide:filter-x`, текст «Нет задач по этому фильтру», кнопка «Сбросить фильтры»

---

## TaskDetail (`taskdetail_v1.html`) — конкретные правки

### Что убираем

1. **Hunk accept/reject** в Conflict-табе — убрать «0/3 разрешено» counter и хунки. Только 3 read-only колонки + редактируемый CodeMirror внизу
2. **Авторы колонок «Дмитрий Волков · 4 мин назад»** для `theirs` — убрать (нет данных без extra GitHub call). Показать только «Текущая версия в репозитории · `target_repo`»

### Что меняем

1. **Diff-таб «Скачать» кнопка** — одна кнопка «Скачать .md», скачивает `translated_content` как файл с именем `Path(file_path).name`
2. **Save-bar поведение** — явная кнопка «Сохранить» (PATCH), `beforeunload` warning при попытке уйти с dirty-состоянием. Auto-save **не делаем**
3. **Conflict-таб структура:**
   - 3 колонки read-only сверху (height 50%): base / ours / theirs
   - Один редактируемый CodeMirror снизу (height 50%) с предзаполненным `theirs`
   - Над редактируемым — переключатель «Использовать: наш перевод / текущий EN» (radio), который перезаписывает содержимое CodeMirror
   - Bar внизу: «Опубликовать» button + текст «Внесите правки и опубликуйте»
4. **Logs-таб этапы** — frontend парсит `log_line` из SSE, группирует по префиксам стадий. Бэк не меняем. Неузнанные строки идут в общую группу «Прочее»
5. **Header статус-pill** — показывать дополнительно для `published`: «Опубликовано `2 ч назад`» с link `lucide:external-link` на `commit_url`
6. **Авторы в conflict** — для base используем `Task.commit_author_name` (после расширения API), для ours хардкод «DocFlow AI · `completed_at` relative»

### Что добавляем

1. **Состояние `queued`** — таб Diff показывает RU original_content слева в read-only режиме. Справа — empty state с иконкой `lucide:clock` и текстом «Перевод в очереди, начнётся через ~N сек» (N = timer от current avg pipeline duration из `/analytics`)
2. **Retry-конфликт диалог** — отдельная модалка `<Dialog>`:
   - Title: «Source-файл изменился в GitHub»
   - Body: «Файл `<file_path>` был изменён в репозитории `<source_repo>` после создания задачи. Старый SHA: `<old_sha>`, новый: `<new_sha>`.»
   - 3 кнопки в footer:
     - «Создать новую задачу с актуальным файлом» (primary)
     - «Перевести старую версию» (secondary, → POST retry с force=true)
     - «Отмена» (ghost)
3. **Failed-состояние** — таб Logs автоматически активен при load. В шапке pill `var(--status-failed)` + кнопка «Повторить» в action-bar
4. **Conflict-состояние** — таб Conflict автоматически активен. В шапке pill `var(--status-conflict)`

---

## Новые экраны (нужно нарисовать)

### Login

**Layout:** центрированная карточка 380px на полном dark-фоне.

**Содержание:**

- Logo + wordmark «DocFlow» вверху карточки
- Заголовок «Вход» (h2, 22px)
- Поле Email (label + input)
- Поле Пароль (label + input + toggle visibility)
- Кнопка «Войти» (primary, full-width)
- Ссылка «Нет аккаунта? Зарегистрироваться» снизу
- Error-banner над формой при 401/429 (`var(--status-failed)`)

**Состояния:** idle, loading (кнопка с спиннером), error.

### Register

Аналогично Login + дополнительное поле «Отображаемое имя» (опциональное).
Заголовок «Регистрация», кнопка «Зарегистрироваться», ссылка «Уже есть аккаунт? Войти».

### `/repositories` — список проектов

**Layout:** обычный page-content с sidebar.

**Header:** «Репозитории» (h1) + «Управляйте парами source/target репозиториев» (subtitle) + кнопка «Новый проект» справа.

**Список:** таблица или карточки (предпочитаем таблицу для density):
| Колонка | Содержание |
|---------|-----------|
| Имя | `Project.name` (font-weight 500) |
| Source → Target | `owner/repo` (mono) → `owner/repo` (mono) с иконкой `lucide:arrow-right` |
| Ветки | `source_branch` → `target_branch` |
| Задач | счётчик (link → `/tasks?project_id=...`) |
| Создан | relative date |
| Действия | dropdown menu: «Открыть», «Удалить» |

**Empty state:** иконка `lucide:folder-git`, «Нет проектов», подпись «Создайте первый проект чтобы начать переводить документацию», кнопка «Новый проект».

### `/repositories/new` — создание проекта

**Layout:** центрированная форма 560px.

**Header:** «Новый проект» + breadcrumb «Репозитории / Новый проект».

**Поля:**

- Имя (text)
- Source repo — combobox с автокомплитом из `GET /user/repos` (показывать `owner/repo` + иконка private/public/archived)
- Source branch (default: main)
- Target repo — combobox аналогично
- Target branch (default: main)
- Exclude patterns — multi-input с chip-добавлением. Подсказка под полем: «gitignore-синтаксис, по одному паттерну»

**Footer:** «Отмена» + «Создать» (primary).

**После создания:** модалка `WebhookSecretModal` (см. ниже).

### `WebhookSecretModal` — модалка с секретом

**Триггер:** появляется после успешного `POST /projects` или `POST /projects/{id}/regenerate-webhook-secret`.

**Layout:** Radix Dialog 560px, нельзя закрыть на overlay-click (только через явные кнопки).

**Содержание:**

- Title: «Сохраните webhook secret»
- Warning-banner оранжевый: «Секрет показывается только один раз. Скопируйте и сохраните в безопасном месте.»
- Поле read-only с секретом + кнопка «Скопировать» (toast «Скопировано»)
- Заголовок «Настройка webhook в GitHub»:
  - URL (read-only поле + копировать)
  - Шаги нумерованные: «1. Откройте Settings → Webhooks вашего source-репо → Add webhook. 2. Payload URL: вставьте URL выше. 3. Content type: `application/json`. 4. Secret: вставьте секрет выше. 5. Events: Just the push event.»
- Footer: «Готово» (primary)

### `/repositories/:id` — детали проекта

**Layout:** обычный page-content.

**Header:** имя проекта (h1) + breadcrumb + статус-индикатор GitHub-связи.

**Секции (стек сверху вниз):**

1. **Source / Target** — read-only данные с кнопкой «Изменить ветки» (открывает edit-модалку с branch-полями)
2. **Webhook** — URL (read-only mono), статус доставки (статичный «активен» в MVP), кнопка «Сгенерировать новый секрет» (с confirm dialog → WebhookSecretModal)
3. **Exclude patterns** — список chip'ов + edit-режим (textarea, save → PATCH)
4. **Связанные задачи** — таблица из 5 последних + link «Все задачи проекта →»
5. **Опасная зона** — отдельная карточка с красной границей: «Удалить проект» (с двойным confirm: первый «Точно удалить?», второй с вводом имени проекта)

### `OnboardingDialog` — глобальная модалка

**Триггер:** при auth-bootstrap, если `user.github_linked === false || projects.length === 0`. Не показывается если в localStorage `onboarding_skipped === 'true'`.

**Layout:** Radix Dialog 640px, можно закрыть кнопкой «Пропустить».

**Содержание:**

- Title: «Добро пожаловать в DocFlow»
- Subtitle: «Настройте окружение за 3 шага»
- Stepper-индикатор (3 шага: «Привязать GitHub», «Создать проект», «Настроить webhook»). Текущий шаг highlighted, пройденные с галочкой
- Body шага 1: иконка GitHub + описание + кнопка «Привязать GitHub» (открывает `/auth/github/connect` через `window.location.href`)
- Body шага 2: иконка folder-git + «Создайте первый проект» + кнопка «Создать проект» (закрывает dialog, redirect `/repositories/new`)
- Body шага 3: иконка webhook + «Скопируйте URL и секрет в GitHub Webhook Settings» + ссылка «Открыть GitHub Webhook docs»
- Footer: «Пропустить онбординг» (ghost) + «Далее / Готово» (primary)

### `/history` — лента публикаций

**Header:** «История публикаций» (h1) + «Все публикации по вашим репозиториям» (subtitle).

**Toolbar:**

- Filter chips popover: проект (multi), пользователь, диапазон дат (react-day-picker)
- Search bar по `file_path`

**Лента:** карточки в столбце:

- Header card: avatar + имя пользователя + relative date + commit-sha mono
- Body: file_path (mono), source_repo → target_repo
- Footer: link «Открыть commit на GitHub» (`lucide:external-link`)

**Pagination:** «Загрузить ещё» внизу или infinite scroll (выбираем infinite).

**Empty state:** «Публикаций ещё нет. Опубликуйте первый перевод в TaskDetail.»

### `/analytics` — графики

**Header:** «Аналитика» (h1) + filter toolbar (project, date range).

**Stat-cards сверху (4 в ряд):**

- Total tasks
- Success rate (% с pulse-индикатором)
- Avg duration (`{value}с`)
- Опубликовано в диапазоне

**Графики:**

1. **Tasks per day** — stacked bar (recharts). Цвета по статусам из палитры. Tooltip с детализацией
2. **Success rate over time** — line chart, тонкая линия `var(--accent)`, dot на hover
3. **Top 5 errors** — таблица: error_type | count | bar (визуальная пропорция от max)

**Кнопка справа:** «Экспорт CSV» (papaparse → blob download).

### `/dictionaries` — список словарей (read-only MVP)

**Layout:** sidebar с типами + main-content.

**Sidebar (вторичный, внутри страницы):**

- Список из 7 типов
- На каждом: название + counter (кол-во записей)
- Активный highlighted

**Main:**

- Banner оранжевый: «Редактирование словарей будет доступно в следующей версии»
- Search bar по key
- Таблица:
  - key (mono)
  - value
  - source — chip `base` (серый) или `user` (синий)
  - updated_by (только для user)
  - updated_at (только для user)

**Для prompt:** один большой read-only textarea высотой 60% viewport.

### `/settings` (с под-маршрутами)

**Layout:** левая колонка с sub-nav, правая — content.

**Sub-nav:**

- Профиль (`lucide:user`)
- GitHub (`lucide:github`)
- Уведомления (`lucide:bell`)

#### `/settings/profile`

- Avatar 64px + display_name (h2)
- Email (read-only)
- Form: change display_name (input + save)
- Form: change password (current + new + confirm + save). Rate-limit hint
- Section «Опасная зона»: «Удалить аккаунт» — disabled с tooltip «В разработке»

#### `/settings/github`

- Status-banner:
  - Если подключён: зелёная иконка + «GitHub подключён как `{github_login}`» + кнопка «Отвязать» (с confirm dialog)
  - Если не подключён: серая иконка + «GitHub не подключён» + кнопка «Привязать»
- Banner ошибки: если в URL `?github_error=...`, показываем красный banner с описанием
- Info-block: «Что даёт привязка»: список из 3 пунктов с иконками

#### `/settings/notifications`

- Banner серый: «Уведомления Bitrix24 будут доступны в следующей версии»
- Заголовок «Каналы уведомлений»
- Empty state: иконка `lucide:bell-off`, «Каналов нет», кнопка «Добавить канал» — disabled

### `/404`

**Layout:** центрированный контент.

- Большая цифра «404» (h1, 80px, `var(--text-dim)`)
- Текст «Страница не найдена»
- Кнопка «На главную» (primary)

### Command Palette (cmdk)

**Триггер:** `Cmd+K` / `Ctrl+K` или клик на search-input в header.

**Layout:** Radix Dialog 640px вверху страницы (top: 15%).

**Содержание:**

- Search-input верх (full-width, font-size 16px)
- Список результатов сгруппированный:
  - **Задачи** — последние 5 совпадений (file_path, project_name)
  - **Проекты** — список совпадений
  - **Действия** — quick actions («Запустить перевод», «Создать проект», «Открыть аналитику»)
- Footer: hint «↑↓ навигация · ↵ выбрать · Esc закрыть»

---

## Сквозные элементы для всех экранов

### Sidebar (postоянный для всех authenticated-страниц)

- Width: 220px, sticky
- Wordmark «DocFlow» + glyph сверху
- Nav: «РАБОТА» секция (Задачи, История, Аналитика), divider, «КОНФИГУРАЦИЯ» секция (Репозитории, Словари, Настройки)
- Внизу: user-block с avatar, display_name, GitHub-status-dot

### Top action bar (для страниц с глобальным поиском)

- Sticky под header
- Search-input с `⌘K` shortcut
- Notifications-icon (опционально, badge с count)
- User-menu dropdown

### Status-pill (используется везде)

- Inline element с цветом из `--status-*` переменных
- Background: цвет с alpha 0.15
- Text-color: цвет статуса
- Padding: 2px 8px, border-radius 4px, font-size 11.5px, uppercase, letter-spacing 0.05em
- Иконка слева 11px (для running — анимированный pulse-dot)

### RepoLink (компонент для отображения owner/repo)

- Иконка GitHub 12px слева
- Текст mono `font-size: 12.5px`
- Hover: подсветка `var(--text)` + underline
- При клике — открывает `https://github.com/{repo}` в новой вкладке

### Status colors mapping

| Status    | Цвет                 | Иконка lucide         |
| --------- | -------------------- | --------------------- |
| queued    | `--status-queued`    | `clock`               |
| running   | `--status-running`   | `loader-2` (rotating) |
| done      | `--status-done`      | `check-circle`        |
| failed    | `--status-failed`    | `x-circle`            |
| published | `--status-published` | `git-merge`           |
| conflict  | `--status-conflict`  | `alert-triangle`      |

---

## Что НЕ нужно проектировать

- Mobile / tablet версии
- Light theme (post-MVP)
- Light/dark theme switcher
- Multi-language UI (post-MVP)
- Storybook / component gallery
- PWA install prompt
- Push notifications
- 3D / illustrations
- Анимированные splash-screens (только simple loading skeleton)

---

## Приоритет дизайна

При следующих итерациях AI-модели рисуем в этом порядке:

1. **Login + Register** (1 итерация — оба простые, общая стилистика)
2. **`/repositories` + `/repositories/new` + WebhookSecretModal** (1 итерация, связанные)
3. **OnboardingDialog** (1 итерация)
4. **Правки `dashboard_v4.html`** по разделу выше (1 итерация)
5. **Правки `taskdetail_v1.html`** по разделу выше (1 итерация)
6. **`/repositories/:id`** (1 итерация)
7. **`/history`** (1 итерация)
8. **`/analytics`** (1 итерация)
9. **`/settings/*`** (1 итерация на все три под-страницы)
10. **`/dictionaries`** (1 итерация)
11. **404, Command Palette, оставшиеся диалоги** (1 итерация на сборку мелочей)
