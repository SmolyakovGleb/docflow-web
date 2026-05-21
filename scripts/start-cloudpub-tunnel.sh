#!/usr/bin/env bash
set -euo pipefail

FRONTEND=false
PORT=0
TUNNEL_NAME=""

for arg in "$@"; do
  case "$arg" in
    --frontend) FRONTEND=true ;;
    --name=*) TUNNEL_NAME="${arg#--name=}" ;;
    [0-9]*) PORT="$arg" ;;
  esac
done

if $FRONTEND; then
  [[ $PORT -eq 0 ]] && PORT=3000
  [[ -z "$TUNNEL_NAME" ]] && TUNNEL_NAME="docflow-frontend"
else
  [[ $PORT -eq 0 ]] && PORT=8080
  [[ -z "$TUNNEL_NAME" ]] && TUNNEL_NAME="docflow-webhook"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL_PATH="$REPO_ROOT/.env.local"
FRONTEND_ENV_LOCAL_PATH="$REPO_ROOT/frontend/.env.development.local"

get_env_value_from_file() {
  local file_path="$1"
  local variable_name="$2"

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  grep -E "^${variable_name}=" "$file_path" | tail -n 1 | cut -d '=' -f 2-
}

if ! command -v clo >/dev/null 2>&1; then
  echo "CloudPub CLI 'clo' not found. Install it first." >&2
  exit 1
fi

CLOUDPUB_TOKEN="${CLOUDPUB_TOKEN:-}"
if [[ -z "$CLOUDPUB_TOKEN" ]]; then
  CLOUDPUB_TOKEN="$(get_env_value_from_file "$ENV_LOCAL_PATH" "CLOUDPUB_TOKEN" || true)"
fi

if [[ -z "$CLOUDPUB_TOKEN" ]]; then
  echo "CLOUDPUB_TOKEN not found. Put it into '$ENV_LOCAL_PATH' or export it in the current shell." >&2
  exit 1
fi

if $FRONTEND; then
  HEALTH_URL="http://localhost:${PORT}/"
  HEALTH_ERROR="Frontend is not reachable on http://localhost:${PORT}/. Start containers before opening the tunnel."
else
  HEALTH_URL="http://localhost:${PORT}/health"
  HEALTH_ERROR="Backend is not reachable on http://localhost:${PORT}/health. Start backend before opening the tunnel."
fi

if ! curl --silent --fail "$HEALTH_URL" >/dev/null; then
  echo "$HEALTH_ERROR" >&2
  exit 1
fi

echo "==> Saving CloudPub token in CLI profile..."
clo set token "$CLOUDPUB_TOKEN"

echo "==> Starting CloudPub tunnel ($TUNNEL_NAME -> localhost:$PORT)..."

if $FRONTEND; then
  echo "When CloudPub prints the public URL, you can share it to access the full app."
else
  echo "When CloudPub prints the public URL, update:"
  echo "  - $REPO_ROOT/.env -> APP_BASE_URL=https://<your-subdomain>.cloudpub.ru"
  echo "  - $FRONTEND_ENV_LOCAL_PATH -> VITE_TUNNEL_URL=https://<your-subdomain>.cloudpub.ru"
  echo "Then restart backend so project.webhook_url uses the public domain."
fi
echo

clo publish http "$PORT" --name "$TUNNEL_NAME"
