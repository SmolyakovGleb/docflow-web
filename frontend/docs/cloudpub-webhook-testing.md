# CloudPub Webhook Testing

Эта инструкция нужна для этапа `5a`, когда нужно проверить реальный флоу:

`push в GitHub -> webhook -> задача появилась в DocFlow`

## Что должно быть готово

- backend запущен локально на `http://localhost:8000`
- пользователь уже привязал GitHub
- проект создан или будет создан после запуска tunnel
- `CloudPub` CLI установлен и доступен как `clo`

## Локальные файлы

### `/.env.local`

Файл не коммитится. Нужен только для helper-скрипта.

```env
CLOUDPUB_TOKEN=your_cloudpub_token
```

### `/frontend/.env.development.local`

Файл не коммитится. Нужен только как локальная фиксация текущего tunnel URL.

```env
VITE_TUNNEL_URL=
```

### `/.env`

Backend читает `APP_BASE_URL` именно отсюда. Перед созданием проекта или перед проверкой webhook нужно подставить туда публичный URL tunnel.

```env
APP_BASE_URL=https://abc123.cloudpub.ru
```

После изменения `APP_BASE_URL` backend нужно перезапустить.

## Запуск

### Docker

```bash
docker compose up backend db
```

### Tunnel

PowerShell:

```powershell
./scripts/start-cloudpub-tunnel.ps1
```

Bash:

```bash
./scripts/start-cloudpub-tunnel.sh
```

Скрипт:

- проверяет, что backend отвечает на `http://localhost:8000/health`
- берёт `CLOUDPUB_TOKEN` из переменной окружения или из root `.env.local`
- вызывает `clo set token ...`
- запускает `clo publish http 8000 --name docflow-webhook`

Когда CloudPub покажет публичный URL:

1. Вставить его в root `.env` как `APP_BASE_URL`
2. Перезапустить backend
3. Вставить тот же URL в `frontend/.env.development.local` как `VITE_TUNNEL_URL`

## Проверка

Открыть:

```text
https://abc123.cloudpub.ru/health
```

Ожидаемый ответ:

```json
{ "status": "ok" }
```

## Настройка GitHub webhook

В source-репозитории:

- `Settings -> Webhooks -> Add webhook`
- `Payload URL`: `https://abc123.cloudpub.ru/webhook/{project_id}`
- `Content type`: `application/json`
- `Secret`: `webhook_secret` из модалки создания проекта или после regenerate
- `Which events`: `Just the push event`

## Проверка happy path

1. Сделать push `.md`-файла в `source_branch`
2. Проверить, что GitHub webhook получил `2xx`
3. Открыть `/tasks`
4. Убедиться, что новая задача появилась в списке

## Если tunnel сейчас не нужен

Можно проверить webhook локально через ручной `curl` на `http://localhost:8000/webhook/{project_id}` и корректную HMAC-подпись. Этот сценарий остаётся резервным и не зависит от CloudPub.
