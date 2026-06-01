# План разработки: отдельный YAML-пайплайн

**Цель:** добавить полноценный перевод YAML TOC-файлов Bitrix24 (`b24-toc.yaml`) как отдельную ветку DocFlowAI pipeline, не передавая YAML-структуру в LLM и не смешивая YAML-логику с markdown-пайплайном.

**Ключевой вывод после изучения текущего pipeline:** YAML не стоит реализовывать как один processor внутри `pipeline/src/processors`. Текущий `src/pipeline.py` — markdown-ориентированная цепочка: `MarkdownParser`, `PreTranslator`, `TranslationMemory`, `CodeTranslator`, `YfmTableTranslator`, `MarkdownProtector`, chunk translation, restore, markdown fixers, `StructureValidator`, `MarkdownWriter`. Для `b24-toc.yaml` потребуется собственный parser/extractor/batcher/protector/fixers/validator/writer и отдельные data-файлы, поэтому правильнее создать отдельную папку верхнего уровня `pipeline/src/yaml/`.

**Ограничение формата:** пайплайн проектируется только под TOC-файлы `b24-toc.yaml`. Поддержка произвольных YAML-файлов не входит в задачу и не должна усложнять первую реализацию.

**Принцип перевода:** стабильность и качество важнее максимальной автоматизации через LLM. YAML-пайплайн должен переводить максимум значений через словарь, шаблонные правила и translation memory. LLM используется только как fallback для остатка, который нельзя надежно покрыть детерминированными механизмами.

---

## Анализ реальных YAML в b24-rest-docs

Проверена директория `C:\Users\g.smolyakov\github\b24-rest-docs\api-reference`.

Статистика:

- найдено 378 YAML-файлов;
- все найденные файлы имеют расширение `.yaml`;
- все найденные файлы называются `b24-toc.yaml`;
- ключи по всем файлам: `name` — 2670, `href` — 2664, `items` — 379, `title` — 378, `include` — 377, `path` — 377, `mode` — 377;
- в выборке просмотрены 27 файлов, включая крупные и нестандартные TOC: корневой `b24-toc.yaml`, `tasks`, `sale`, `crm`, `catalog`, `calendar`, `booking`, `landing`, `widgets`, `chat-bots`, `rest-v3`, `biconnector`.

Основной паттерн:

```yaml
title: Календарь
href: index.md
items:
  - name: Обзор методов
    href: index.md
  - name: События
    include:
      path: events/b24-toc.yaml
      mode: link
```

Фактическая схема:

- `title` есть во всех 378 файлах и должен переводиться;
- `href` на верхнем уровне есть не везде: минимум 6 файлов без root `href`;
- `items` обычно один на файл, но есть вложенный `items` в `chat-bots\b24-toc.yaml`, поэтому extractor обязан обходить дерево рекурсивно;
- элементы меню бывают двух типов: `name + href` и `name + include.path + include.mode`;
- `include.mode` в данных используется как техническое значение `link` и не должен переводиться;
- `href` может быть `index.md`, обычным markdown-файлом или method-like именем вида `vote.attachedvote.getMany.md`; это всегда protected value;
- `path` указывает на вложенный `b24-toc.yaml` и всегда protected value;
- переводимые значения короткие: navigation labels, названия разделов, названия методов и событий.

Частые повторяющиеся значения, которые стоит сразу положить в YAML dictionary/TM:

- `Обзор методов`;
- `События`;
- `Обзор событий`;
- `Пользовательские поля`;
- `Общие методы`;
- `Сообщения`;
- `Устаревшее`;
- `Устаревшие методы`;
- `Комментарии`;
- `Чаты`;
- `Файлы`.

Вывод для реализации:

- первая версия должна быть не generic YAML translator, а строго `b24-toc.yaml` translator;
- whitelist переводимых ключей: `title`, `name`;
- `label`, `description` и другие YAML-поля не поддерживать в первой реализации, чтобы не размывать контракт TOC-схемы;
- `href`, `include`, `path`, `mode`, `items` должны быть protected structure keys;
- валидатор должен поддерживать отсутствие root `href`;
- валидатор должен рекурсивно сравнивать все `items`, а не только первый уровень;
- schema validator должен разрешать item-группы с вложенным `items` без собственного `href/include`, потому что такой паттерн уже есть в `chat-bots\b24-toc.yaml`;
- для качества перевода важен отдельный short-label prompt: модель должна переводить кратко, без пояснений и без добавления точек.

Связь с `pipeline/docs`: текущие документы по пайплайну уже фиксируют подход со специализированными этапами, retry/fixer-слоями и структурной валидацией. YAML-ветка должна повторить этот принцип: LLM видит только текстовые units, а parser/writer/validators отвечают за структуру и ссылки.

---

## Архитектура

### Форматные ветки

```text
src/pipeline.py
  detect_document_format(file_path)
    .md           -> MarkdownTranslationPipeline (текущий flow)
    .yaml/.yml    -> YamlTranslationPipeline (новый flow)
```

Markdown-пайплайн должен остаться максимально нетронутым. Общими остаются только:

- `src.processors.translator.Translator`
- базовые протоколы переводчика
- общий entrypoint `pipeline.run(...)`
- `OUTPUT_DIR`
- логирование

YAML-пайплайн не использует markdown `PreTranslator`, `MarkdownProtector`, markdown fixers и `StructureValidator`.

### Новая структура

```text
pipeline/src/yaml/
├── __init__.py
├── pipeline.py              # YamlTranslationPipeline + YamlPipelineConfig/State
├── models.py                # YamlTextUnit, YamlPath, YamlTranslationBatch, validation models
├── parser.py                # round-trip YAML parse/load
├── extractor.py             # извлечение переводимых values
├── dictionary.py            # yaml_dictionary/yaml_tm lookup + normalization
├── protector.py             # защита inline-токенов внутри values
├── batcher.py               # LLM batch protocol, retry, parsing response
├── fixers/
│   ├── __init__.py
│   ├── base.py
│   ├── untranslated.py      # доперевод оставшейся кириллицы в whitelist values
│   ├── casing.py            # точечная нормализация capitalization
│   ├── glossary.py          # обязательные yaml terms
│   └── artifacts.py         # убрать кавычки/маркеры/мусор от LLM внутри values
├── validators/
│   ├── __init__.py
│   ├── structure.py         # ключи, paths, типы, порядок
│   ├── content.py           # кириллица, пустые переводы, forbidden content
│   └── links.py             # href/include/path/mode не изменены
└── writer.py                # сохранить YAML с исходным suffix
```

### Данные

```text
pipeline/data/yaml/
├── prompt.txt
├── dictionary.json
├── glossary.json
├── tm/
│   └── cache.json
└── config.json
```

`config.json`:

```json
{
  "supported_file_name": "b24-toc.yaml",
  "translatable_keys": ["title", "name"],
  "protected_keys": ["href", "path", "mode", "id", "slug", "url", "include"],
  "max_batch_chars": 2500,
  "retry_count": 1
}
```

Markdown `data/dictionary.json`, `data/glossary.json`, `data/prompt.txt`, `data/tm/cache.json` не используются YAML-пайплайном.

---

## YAML Pipeline Flow

### 1. Parse

- Загрузить YAML через `ruamel.yaml.YAML(typ="rt")`.
- Сохранить исходный `raw_content`.
- Построить snapshot структуры:
  - paths всех keys/values
  - типы значений
  - protected values (`href`, `path`, `mode`, etc.)
  - исходный suffix (`.yaml` или `.yml`)

Причина использовать `ruamel.yaml`: нужен round-trip режим, чтобы не пересобирать TOC “с нуля” и не терять порядок/комментарии/кавычки без необходимости.

### 2. Extract

Если имя файла не `b24-toc.yaml`, YAML-ветка должна завершаться ошибкой `UnsupportedYamlFormatError`: такие файлы не являются частью текущего контракта.

Извлечь только строковые values, где:

- key находится в `translatable_keys`
- value содержит кириллицу
- value не пустой
- value не выглядит как технический идентификатор, путь, URL, method name

Пример unit:

```python
YamlTextUnit(
    index=1,
    path=("items", 0, "name"),
    key="name",
    source="Обзор методов",
)
```

LLM не получает `path`, `key`, YAML-отступы или `href`.

### 3. Dictionary-first translation

Основная стратегия YAML-пайплайна: **dictionary/rules/TM first, LLM fallback**.

Порядок обработки:

1. Exact match по `data/yaml/dictionary.json`.
2. Нормализованный lookup по translation memory `data/yaml/tm/cache.json`.
3. Шаблонные правила для стабильных фраз TOC:
   - `Обзор методов`;
   - `Обзор событий`;
   - `Получить список ...`;
   - `Получить ... по идентификатору`;
   - `Добавить ...`;
   - `Изменить ...`;
   - `Удалить ...`;
   - `При добавлении ...`;
   - `При изменении ...`;
   - `При удалении ...`.
4. LLM получает только значения, которые не удалось перевести детерминированно.
5. Новые пары после LLM не должны автоматически попадать в основной словарь. Их можно сохранять в отдельный pending/TM слой для последующей проверки.

До LLM применить:

- exact match из `data/yaml/dictionary.json`
- normalized TM из `data/yaml/tm/cache.json`
- простые replacements, если они специфичны для TOC

Для YAML лучше не переиспользовать markdown `TranslationMemory`, потому что нормализация markdown inline tokens не совпадает с короткими navigation labels. Можно взять идею `normalize_inline`, но держать реализацию отдельно в `src/yaml/dictionary.py`.

### 4. Protect Values

Защитить внутри values:

- inline code: `` `...` ``
- method names: `calendar.section.add`, `crm.item.*`
- product identifiers: `Bitrix24`, `REST`, `OAuth`
- placeholders вроде `{{...}}`, `%...%`
- URLs/domains, если такие попадут в label

Формат маркеров: `[[YAML_PROTECTED_0]]`. Это отдельный namespace от markdown `[[PROTECTED_N]]`, чтобы логи и validator не путались.

### 5. Batch LLM

Payload:

```text
[[YAML_ITEM_1]]
Календарь
[[/YAML_ITEM_1]]

[[YAML_ITEM_2]]
Обзор методов
[[/YAML_ITEM_2]]
```

Не использовать простой `1. text` как финальный протокол: текущие batcher-ы показывают, что wrappers надёжнее для retry и extraction. В `YfmTableTranslationBatcher` уже есть рабочий паттерн `[[TABLE_ITEM_N]] ... [[/TABLE_ITEM_N]]`; для YAML стоит сделать аналог.

Prompt:

- “Translate only item contents.”
- “Preserve every `[[YAML_ITEM_N]]` and `[[YAML_PROTECTED_N]]` marker exactly.”
- “Return the same blocks in the same order.”
- “No explanations.”
- “These are short navigation labels for Bitrix24 REST documentation.”
- “Do not add punctuation if absent.”
- “Use concise English UI/navigation wording.”

Retry:

- Если пропали wrappers или количество items изменилось — один retry с критической инструкцией.
- Если после retry всё ещё invalid — task fails. Лучше fail, чем опубликовать сломанный TOC.

### 6. Restore

- Восстановить `[[YAML_PROTECTED_N]]`.
- Сохранить leading/trailing spaces внутри value, если были.
- Не менять quote style вручную; оставить round-trip dumper.

### 7. Apply YAML Fixers

Минимальный набор на первый релиз:

- `YamlUntranslatedFixer`: находит кириллицу в translatable values и точечно допереводит только эти values.
- `YamlArtifactFixer`: убирает лишние wrappers, markdown fences, кавычки вокруг всего ответа, если LLM вернул мусор внутри value.
- `YamlGlossaryFixer`: проверяет обязательные термины из `yaml/glossary.json`, при безопасной exact-замене исправляет.
- `YamlCasingFixer`: нормализует очевидные кейсы для navigation labels, но без агрессивного title-casing.

Fixers работают с YAML tree/units, а не со всем YAML-текстом. Никаких regex replace по полному YAML, если можно работать по path.

### 8. Validate

Validator должен сравнить original snapshot и translated snapshot:

- YAML парсится после сборки.
- Множество paths не изменилось.
- Типы значений не изменились.
- Protected keys values не изменились.
- Количество `items` не изменилось.
- `href`, `include.path`, `include.mode` не изменились.
- Нет `[[YAML_*]]` маркеров.
- В translatable values не осталось кириллицы, кроме allowlist.
- В non-translatable values не появилось английского перевода вместо технического значения.

Ошибки структуры должны падать как exception и переводить task в `failed`. Warnings можно писать в лог, но не блокировать, если YAML валиден и protected поля не изменены.

### 9. Write

Сохранить в `OUTPUT_DIR / input_file.name`, то есть:

- `b24-toc.yaml` -> `output/b24-toc.yaml`
- `b24-toc.yml` -> `output/b24-toc.yml`

Это важно для `backend/app/services/pipeline_runner.py`, который сейчас ожидает `output_dir / input_file.name`.

---

## Изменения в pipeline

### Задача 1 — Подготовить format dispatch

**Файлы:**

- Изменить: `pipeline/src/pipeline.py`
- Создать: `pipeline/src/document_format.py`
- Изменить: `pipeline/main.py`

**Шаги:**

- [ ] Добавить `detect_document_format(path) -> Literal["markdown", "yaml"]`.
- [ ] Переименовать текущий `TranslationPipeline` в `MarkdownTranslationPipeline` или оставить имя, но явно обернуть markdown branch.
- [ ] В `run()` добавить dispatch по suffix.
- [ ] В `main.py --dir` искать `*.md`, `*.yaml`, `*.yml`.
- [ ] Обновить help texts: не только `.md`.
- [ ] Проверка: `.md` файл проходит старую ветку без изменения логов и output.

### Задача 2 — Добавить YAML dependencies

**Файлы:**

- Изменить: `pipeline/pyproject.toml`
- Изменить: `pipeline/uv.lock`

**Шаги:**

- [ ] Добавить `ruamel.yaml>=0.18`.
- [ ] Выполнить `cd pipeline && uv sync`.
- [ ] Проверить `uv run python -c "from ruamel.yaml import YAML"`.

### Задача 3 — b24-toc parser + structure snapshot

**Файлы:**

- Создать: `pipeline/src/yaml/parser.py`
- Создать: `pipeline/src/yaml/models.py`

**Шаги:**

- [ ] Реализовать `YamlDocument` с `raw_content`, `tree`, `source_path`, `suffix`.
- [ ] Реализовать `YamlStructureSnapshot`.
- [ ] Реализовать обход tree с path tuples.
- [ ] Добавить проверку имени файла: поддерживается только `b24-toc.yaml`.
- [ ] Добавить явную TOC-схему: root mapping, обязательный `title`, опциональный root `href`, рекурсивный `items`.
- [ ] Тест: пример `b24-toc.yaml` парсится, paths включают `("title",)`, `("items", 0, "name")`, `("items", 0, "href")`.

### Задача 4 — YAML extractor

**Файлы:**

- Создать: `pipeline/src/yaml/extractor.py`
- Создать: `pipeline/data/yaml/config.json`

**Шаги:**

- [ ] Реализовать whitelist ключей из config.
- [ ] Извлекать только translatable string values.
- [ ] Пропускать строки без кириллицы.
- [ ] Пропускать технические значения по key denylist и value patterns.
- [ ] Тест: `title/name` извлечены, `href/include.path/mode` не извлечены.

### Задача 5 — YAML dictionary + TM

**Файлы:**

- Создать: `pipeline/src/yaml/dictionary.py`
- Создать: `pipeline/data/yaml/dictionary.json`
- Создать: `pipeline/data/yaml/glossary.json`
- Создать: `pipeline/data/yaml/tm/cache.json`

**Шаги:**

- [ ] Реализовать exact dictionary lookup.
- [ ] Реализовать YAML-specific normalization для placeholders/method names.
- [ ] До LLM помечать units, закрытые dictionary/TM.
- [ ] Логировать `YAML TM: N строк из кэша`.
- [ ] Тест: `"Календарь" -> "Calendar"` не уходит в translator.

### Задача 6 — YAML protector

**Файлы:**

- Создать: `pipeline/src/yaml/protector.py`

**Шаги:**

- [ ] Защищать inline code, method names, placeholders, URLs, product identifiers.
- [ ] Восстанавливать markers после LLM.
- [ ] Проверять missing markers.
- [ ] Тест: `Метод calendar.section.add` переводит только `Метод`, method name сохраняется.

### Задача 7 — YAML LLM batcher

**Файлы:**

- Создать: `pipeline/src/yaml/batcher.py`
- Создать: `pipeline/data/yaml/prompt.txt`

**Шаги:**

- [ ] Реализовать wrapper protocol `[[YAML_ITEM_N]]`.
- [ ] Реализовать batch split по `max_batch_chars`.
- [ ] Реализовать strict response parser.
- [ ] Реализовать one retry при missing wrappers/items.
- [ ] После второго invalid response — raise `YamlTranslationResponseError`.
- [ ] Тест: successful response маппится по indexes.
- [ ] Тест: missing item вызывает retry.
- [ ] Тест: invalid retry raises.

### Задача 8 — YAML fixers

**Файлы:**

- Создать: `pipeline/src/yaml/fixers/base.py`
- Создать: `pipeline/src/yaml/fixers/untranslated.py`
- Создать: `pipeline/src/yaml/fixers/artifacts.py`
- Создать: `pipeline/src/yaml/fixers/glossary.py`
- Создать: `pipeline/src/yaml/fixers/casing.py`

**Шаги:**

- [ ] Сделать общий `YamlFixResult`.
- [ ] `YamlUntranslatedFixer`: допереводит только values с кириллицей.
- [ ] `YamlArtifactFixer`: удаляет wrappers/fences/extra quotes внутри values.
- [ ] `YamlGlossaryFixer`: применяет безопасные обязательные замены.
- [ ] `YamlCasingFixer`: нормализует очевидные navigation casing issues.
- [ ] Логировать каждый fixer так же, как markdown fixers: имя, count, details.
- [ ] Тесты на каждый fixer отдельно.

### Задача 9 — YAML validators

**Файлы:**

- Создать: `pipeline/src/yaml/validators/structure.py`
- Создать: `pipeline/src/yaml/validators/content.py`
- Создать: `pipeline/src/yaml/validators/links.py`

**Шаги:**

- [ ] `YamlStructureValidator`: paths/types/count/order.
- [ ] `YamlProtectedValuesValidator`: protected keys unchanged.
- [ ] `YamlContentValidator`: no leaked markers, no Cyrillic in translatable values.
- [ ] `YamlLinksValidator`: `href`, `include.path`, `include.mode` unchanged.
- [ ] Ошибки структуры делают pipeline failed.
- [ ] Warnings пишутся в лог.
- [ ] Тест: изменение `href` ловится как error.

### Задача 10 — YAML writer

**Файлы:**

- Создать: `pipeline/src/yaml/writer.py`

**Шаги:**

- [ ] Dump через `ruamel.yaml` в строку.
- [ ] Сохранять `output/input_file.name`.
- [ ] Сохранять `.yaml` и `.yml` suffix.
- [ ] Тест: `b24-toc.yml` пишет `output/b24-toc.yml`.

### Задача 11 — YamlTranslationPipeline

**Файлы:**

- Создать: `pipeline/src/yaml/pipeline.py`
- Изменить: `pipeline/src/yaml/__init__.py`

**Стадии:**

```text
load
extract
pre_translate
protect
translate
restore
apply_fixers
validate
save
```

**Шаги:**

- [ ] Собрать stages в `YamlTranslationPipeline.run()`.
- [ ] Использовать отдельный prompt/dictionary/glossary/tm.
- [ ] Логировать stage summary:
  - размер YAML
  - extracted units
  - dictionary/TM hits
  - LLM units
  - fixers
  - validation result
- [ ] Подключить pipeline в `src/pipeline.py` dispatch.
- [ ] End-to-end test: `b24-toc.yaml` -> translated YAML with unchanged structure.

---

## Изменения в docflow-web backend

### Задача 12 — Расширить merged pipeline data

**Файлы:**

- Изменить: `backend/app/services/dictionary_merger.py`
- Изменить: `backend/app/services/pipeline_runner.py`
- Изменить: `backend/app/api/routes/dictionaries.py` при необходимости
- Изменить: `backend/app/schemas/dictionary.py` при необходимости

**Проблема:** сейчас `MergedPipelineData` содержит только markdown `dictionary`, `glossary`, `prompt`, `pre_translator_files`. YAML data не попадёт в pipeline из DocFlow Web.

**Шаги:**

- [ ] Добавить `yaml_dictionary`, `yaml_glossary`, `yaml_prompt`, `yaml_config`.
- [ ] Поддержать `dict_type`: `yaml_dictionary`, `yaml_glossary`, `yaml_prompt`.
- [ ] В `_run_pipeline_sync()` передавать YAML data в `pipeline.run(...)` через расширенный config/API.
- [ ] Если API `pipeline.run()` не хочется расширять позиционными аргументами, добавить dataclass `RunData` в pipeline и принимать keyword-only аргумент.
- [ ] Тест: YAML task получает yaml prompt, а markdown task старый prompt.

### Задача 13 — Поддерживаемые file formats

**Файлы:**

- Создать: `backend/app/services/file_formats.py`
- Изменить: `backend/app/api/routes/webhook.py`
- Изменить: `backend/app/services/tasks.py`
- Изменить: `backend/app/services/github.py`

**Шаги:**

- [ ] `TRANSLATABLE_SUFFIXES = {".md", ".yaml", ".yml"}`.
- [ ] `_collect_markdown_files` переименовать в `_collect_translatable_files`.
- [ ] `GitHubClient.get_repo_tree()` возвращает `.md/.yaml/.yml`.
- [ ] Upload/manual validation разрешает `.yaml/.yml`.
- [ ] Error text заменить с `Only .md files are allowed` на `Only .md, .yaml and .yml files are allowed`.
- [ ] Тесты webhook/manual/upload/repo tree.

### Задача 14 — Runner contract и stages

**Файлы:**

- Изменить: `backend/app/services/pipeline_runner.py`

**Шаги:**

- [ ] Для YAML не строить markdown incremental context.
- [ ] Логировать `Формат: yaml`.
- [ ] Убедиться, что output читается из `output_dir / input_file.name`.
- [ ] Если output отсутствует — понятный `FileNotFoundError`.
- [ ] SSE stages оставить `prepare/pipeline/persist` на уровне web; внутренние YAML stages идут строками в task log.
- [ ] Тест: YAML не вызывает `incremental_translate.build_translation_context`.

---

## Изменения во frontend

### Задача 15 — UI форматов

**Файлы:**

- Изменить: `frontend/src/features/tasks/ui/TriggerTranslationDialog/TriggerTranslationDialog.tsx`
- Изменить: `frontend/src/features/tasks/lib/downloadMd.ts`
- Изменить: `frontend/src/features/tasks/ui/TaskTypeIcon/TaskTypeIcon.tsx`
- Изменить: `frontend/src/locales/ru/tasks.json`

**Шаги:**

- [ ] Upload accept: `.md,.yaml,.yml,text/markdown,text/yaml,application/yaml,application/x-yaml`.
- [ ] Тексты заменить с “.md” на “.md, .yaml или .yml”.
- [ ] Download MIME выбирать по suffix.
- [ ] YAML task icon/label добавить в `TaskTypeIcon`.
- [ ] Тесты upload/download/list row.

---

## Документация

### Задача 16 — Обновить docs

**Файлы:**

- Изменить: `docs/api.md`
- Изменить: `docs/architecture.md`
- Изменить: `docs/pipeline-integration.md`
- Изменить: `backend/README.md`
- Изменить: `frontend/docs/pages.md`

**Шаги:**

- [ ] Описать supported formats: `.md`, `.yaml`, `.yml`.
- [ ] Описать YAML-pipeline как отдельную ветку.
- [ ] Описать YAML data files.
- [ ] Описать ограничения первого релиза: YAML full translation, без incremental.

---

## Порядок реализации

```text
1. pipeline/src/document_format.py + dispatch skeleton
2. pipeline/src/yaml/parser.py + snapshot
3. pipeline/src/yaml/extractor.py + config
4. pipeline/src/yaml/dictionary.py + data/yaml/*
5. pipeline/src/yaml/protector.py
6. pipeline/src/yaml/batcher.py + prompt
7. pipeline/src/yaml/fixers/*
8. pipeline/src/yaml/validators/*
9. pipeline/src/yaml/writer.py
10. pipeline/src/yaml/pipeline.py + E2E tests
11. backend dictionary_merger + pipeline_runner data contract
12. backend supported suffixes in webhook/manual/upload/tree
13. frontend upload/download/labels/icons
14. docs update
15. full regression
```

Так как `pipeline/` — git submodule, шаги 1–10 коммитятся в репозитории DocFlowAI. Затем в `docflow-web` обновляется pointer submodule и выполняются шаги 11–14.

---

## Тестовая матрица

### Pipeline unit

- YAML parser сохраняет paths и типы.
- Extractor берёт `title/name`, пропускает `href/path/mode`.
- Dictionary/TM закрывает exact matches.
- Protector сохраняет method names и placeholders.
- Batcher retry при missing wrappers.
- Fixers удаляют LLM artifacts и допереводят кириллицу.
- Validators ловят изменение protected values.
- Writer сохраняет suffix.

### Pipeline E2E

Input:

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

Expected:

```yaml
title: Calendar
href: index.md
items:
  - name: Methods overview
    href: index.md
  - name: Calendar events
    include:
      path: calendar-event/b24-toc.yaml
      mode: link
```

### Backend

- Webhook creates task for `.yaml`.
- Webhook ignores unsupported `.json`.
- Manual repo trigger accepts `.yml`.
- Upload accepts `.yaml`.
- YAML runner skips incremental context.
- Publish writes YAML path unchanged.

### Frontend

- Upload dialog accepts YAML.
- Repo picker lists YAML.
- Download YAML uses `text/yaml`.
- Task list/detail does not say markdown-only for YAML tasks.

---

## Риски

| Риск                                     | Решение                                             |
| ---------------------------------------- | --------------------------------------------------- |
| YAML needs many special rules            | Separate `src/yaml/` package, not a small processor |
| Markdown regression                      | Dispatch tests and minimal edits to markdown branch |
| LLM breaks item count/order              | Wrapper protocol + retry + fail closed              |
| Structure changes silently               | Snapshot validators before/after                    |
| Protected values change                  | Dedicated protected values validator                |
| Prompt/dictionary mixing                 | Separate `data/yaml/*` and backend merger fields    |
| Incremental markdown logic corrupts YAML | Explicit guard: no incremental for YAML v1          |
| UI/backend still says markdown-only      | Central `file_formats.py` and frontend text update  |

---

## Definition of Done

- `pipeline.run("b24-toc.yaml", ...)` writes `output/b24-toc.yaml`.
- LLM payload contains only YAML text values, not YAML keys/structure.
- `title/name` translated; `href/include.path/mode` unchanged.
- YAML validators fail closed on structure/protected value changes.
- Webhook/manual/upload support `.yaml` and `.yml`.
- Publishing YAML writes to target repo with same path.
- Existing `.md` translation tests and flows remain green.
