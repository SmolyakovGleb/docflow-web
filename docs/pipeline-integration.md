# DocFlow Web — Интеграция с пайплайном

## Подход

DocFlow AI pipeline подключается как **git submodule** в директорию `pipeline/`.

Backend импортирует пайплайн напрямую:
```python
from src.pipeline import run
```

Логика перевода не копируется и не модифицируется.

---

## Git submodule

### Подключение

```bash
# Из корня docflow-web
git submodule add https://github.com/gs-bitrix-doc/DocFlowAI pipeline
git commit -m "feat: add DocFlowAI pipeline as submodule"
```

После этого в репо появится файл `.gitmodules`:
```ini
[submodule "pipeline"]
    path = pipeline
    url = https://github.com/gs-bitrix-doc/DocFlowAI
```

### Клонирование с submodule

```bash
# Клонировать и сразу инициализировать submodule
git clone --recursive https://github.com/.../docflow-web

# Или для уже склонированного репо
git submodule update --init
```

### Обновление пайплайна

```bash
cd pipeline && git pull origin main && cd ..
git add pipeline
git commit -m "chore: update pipeline submodule"
```

---

## PYTHONPATH

В Dockerfile backend:
```dockerfile
ENV PYTHONPATH=/app/pipeline
```

В docker-compose для локальной разработки (если запускать backend без Docker):
```bash
# .env или в команде
PYTHONPATH=/path/to/docflow-web/pipeline python -m uvicorn app.main:app
```

После установки PYTHONPATH импорт работает:
```python
from src.pipeline import run           # основной пайплайн
from src.processors.translator import Translator
from config import load_config         # конфигурация пайплайна
```

---

## Переменные окружения пайплайна

Пайплайн читает конфигурацию через `os.getenv()` после `load_dotenv()`.

В Docker `load_dotenv()` не находит `.env`-файл (его нет в контейнере), но переменные уже установлены через `env_file` в compose — `os.getenv()` их видит.

Переменные, которые нужны пайплайну:

| Переменная | Описание |
|------------|----------|
| `API_KEY` | Ключ Bitrix GPT |
| `BASE_URL` | Endpoint Bitrix GPT |
| `MODEL` | Название модели (`bitrixgpt-5.5`) |

Все три прописываются в `.env` и передаются в backend-контейнер через `env_file: .env` в docker-compose.

---

## Pipeline Runner

`backend/app/services/pipeline_runner.py` — сервисный слой между FastAPI и пайплайном.

### Задача runner-а

1. Получить `task_id`
2. Загрузить задачу из БД
3. Подготовить временную рабочую директорию
4. Записать оригинальный контент в файл
5. Вызвать `pipeline.run()`
6. Прочитать результат из output
7. Захватить логи
8. Обновить задачу в БД

### Схема вызова пайплайна

```
task.original_content (str)
         │
         ▼ записать во временный файл
/tmp/docflow/{task_id}/input/{filename}.md
         │
         ▼ вызов
pipeline.run(file_path, logger=capture_logger)
         │
         ▼ читать результат
/tmp/docflow/{task_id}/output/{filename}.md
         │
         ▼ сохранить в БД
task.translated_content = result_content
task.log = captured_log
task.status = "done"
```

### Захват логов

Пайплайн пишет логи через стандартный `logging`. Runner добавляет кастомный `Handler`, который накапливает строки в буфер, затем сохраняет в `task.log`.

```python
class LogCapture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records: list[str] = []

    def emit(self, record):
        self.records.append(self.format(record))

    def get_log(self) -> str:
        return "\n".join(self.records)
```

### Рабочая директория пайплайна

Пайплайн пишет результат в `output/` относительно пути файла. Runner создаёт временную структуру:

```
/tmp/docflow/{task_id}/
├── input/
│   └── crm-deal-get.md    ← original_content
└── output/
    └── crm-deal-get.md    ← translated_content (после run)
```

После выполнения `run()` читает файл из `output/`, сохраняет в БД, удаляет временную директорию.

### Примерная реализация

```python
import tempfile
import shutil
import logging
from pathlib import Path

from src.pipeline import run as pipeline_run

async def run_task(task_id: str, db: Session) -> None:
    task = db.get(Task, task_id)
    task.status = "running"
    db.commit()

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"docflow_{task_id}_"))
    input_dir = tmp_dir / "input"
    input_dir.mkdir()

    filename = Path(task.file_path).name
    input_file = input_dir / filename
    input_file.write_text(task.original_content, encoding="utf-8")

    log_capture = LogCapture()
    logger = logging.getLogger(f"pipeline.task.{task_id}")
    logger.addHandler(log_capture)

    try:
        pipeline_run(
            str(input_file),
            output_dir=str(tmp_dir / "output"),
            logger=logger
        )
        output_file = tmp_dir / "output" / filename
        task.translated_content = output_file.read_text(encoding="utf-8")
        task.status = "done"
    except Exception as e:
        task.status = "failed"
        task.error = traceback.format_exc()
    finally:
        task.log = log_capture.get_log()
        db.commit()
        shutil.rmtree(tmp_dir, ignore_errors=True)
```

> **Примечание:** точная сигнатура `pipeline.run()` и поведение с `output_dir` уточняется при реализации. Возможно, потребуется лёгкий адаптер, который не меняет логику пайплайна, но позволяет передавать output-директорию.

---

## Данные пайплайна (data/)

`pipeline/data/` содержит:

| Файл | Назначение |
|------|-----------|
| `prompt.txt` | Системный промпт LLM |
| `dictionary.json` | Основной словарь RU→EN |
| `glossary.json` | Расширенный словарь (валидатор) |
| `pre_translator/*.json` | Словари статичных замен |

В контейнере путь: `/app/pipeline/data/`.
Пайплайн находит `data/` относительно своего `config.py` → дополнительных mount не нужно.

---

## Независимость версий

`pipeline/` — отдельный репозиторий. docflow-web фиксирует конкретный коммит пайплайна.

```bash
# Посмотреть какой коммит пайплайна зафиксирован
git submodule status

# Обновить пайплайн до последней версии main
git submodule update --remote pipeline
git add pipeline
git commit -m "chore: update pipeline to latest"
```

Это гарантирует воспроизводимость: разные деплои используют одну и ту же версию пайплайна, пока не сделан явный апдейт.
