# DocFlow Web — Логирование

## Архитектура

Стандартный `logging` из stdlib + JSON-форматтер. Конфигурация — `app/core/logging.py`,
вызывается один раз в `lifespan` приложения.

```
Каждое сообщение → JSON-строка в stdout контейнера → docker logs / promtail → Loki / Grafana
```

## Контекст запроса

`app/core/request_context.py` — `contextvars` для `request_id` и `user_id`.
`_LoggingMiddleware` в `main.py`:
- Берёт `X-Request-ID` из заголовка или генерирует UUID
- Кладёт в contextvar
- Логирует `request` (method, path, status, duration_ms)
- Возвращает `X-Request-ID` в response для frontend

`get_current_user` дополнительно кладёт `user_id` в contextvar.
Все логи в обработке запроса автоматически содержат оба поля.

## События, которые логируются

| Логгер | Событие | Уровень | Поля |
|--------|---------|---------|------|
| `app.access` | `request` | INFO/WARNING(5xx) | method, path, status, duration_ms |
| `app.access` | `request_failed` | ERROR | method, path, duration_ms, exception |
| `app.api.routes.auth` | `login_success` | INFO | user_id |
| `app.api.routes.auth` | `login_failed` | INFO | reason, user_id? |
| `app.api.routes.auth` | `user_registered` | INFO | user_id |
| `app.api.routes.auth` | `password_changed` | INFO | user_id |
| `app.api.routes.auth` | `logout` | INFO | user_id |
| `app.api.routes.auth` | `github_linked` | INFO | user_id, github_login |
| `app.api.routes.webhook` | `webhook_invalid_signature` | WARNING | project_id |
| `app.api.routes.webhook` | `webhook_processed` | INFO | project_id, created, skipped |
| `app.api.routes.projects` | `project_created` / `project_deleted` | INFO | project_id |
| `app.services.tasks` | `task_published` | INFO | task_id, target_repo, commit_sha |
| `app.services.pipeline_runner` | `task_started` / `task_completed` / `task_failed` | INFO/ERROR | task_id |
| `app.main` | `github_api_error` | WARNING | path, status, detail |
| `app.main` | `startup_reset_running_tasks` | INFO | count |

## Формат сообщений

```json
{
  "ts": "2026-05-08T10:15:32.123456+00:00",
  "level": "INFO",
  "logger": "app.api.routes.auth",
  "message": "login_success",
  "request_id": "9f3c4a2e-1b8d-4f7a-9e6b-2c5d8f1a3e7b",
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Уровень `WARNING` и выше — для ошибок и подозрительных событий.
`INFO` — нормальные бизнес-события.
`DEBUG` включается при `DEBUG=true` в env.

## Где смотреть в dev

```powershell
# Все логи
docker compose logs backend -f

# Только ошибки
docker compose logs backend | jq 'select(.level=="ERROR")'

# Все события одного запроса
docker compose logs backend | jq 'select(.request_id=="9f3c4a2e-...")'

# События одного пользователя
docker compose logs backend | jq 'select(.user_id=="550e8400-...")'
```

## Где смотреть в проде

### Минимум (без зависимостей)

`stdout` контейнера → `docker logs` → `journald` хоста.
Поиск через `journalctl -u docker -f | jq`.
Минусы: нет UI, нет алертов, ротация только через `daemon.json` Docker.

### Рекомендуется: Loki + Grafana

Добавить в `docker-compose.yml` три сервиса (~30 строк):

```yaml
  loki:
    image: grafana/loki:latest
    ports: ["3100:3100"]
    volumes:
      - loki_data:/loki

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - ./promtail-config.yml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=false
```

В `promtail-config.yml` указать docker-driver, чтобы автоматом собирать stdout всех контейнеров.
Grafana → Add data source → Loki (`http://loki:3100`) → готово.

Поиск в Grafana Explore:
```
{container="docflow-web-backend-1"} |= "task_failed"
{container="docflow-web-backend-1"} | json | request_id="9f3c..."
{container="docflow-web-backend-1"} | json | level="ERROR" | rate[5m]
```

Алерты Grafana — при `rate({level="ERROR"}[5m]) > 0.1` уведомлять в Bitrix24/email.

### Альтернативы

| Решение | Цена | Плюсы | Минусы |
|---------|------|-------|--------|
| Loki + Grafana | Бесплатно | Self-hosted, JSON из коробки | Надо настроить |
| Datadog | от $15/host/мес | Zero-config | Платно, vendor lock-in |
| Better Stack / Axiom | $0–10/мес для small | Простой setup | Платно после порога |
| ELK | Бесплатно | Богатый поиск | Тяжёлый, ~2GB RAM |

## Что НЕ логируется

- Пароли, токены, `webhook_secret` — никогда не должны попадать в логи
- `task.translated_content` / `original_content` — слишком большие
- SQL-запросы (`sqlalchemy.engine` на уровне WARNING) — включить только при отладке

`pipeline_runner._sanitize_error()` маскирует `settings.api_key` и `settings.session_secret`
в `task.error` и `task.log` перед записью в БД.
