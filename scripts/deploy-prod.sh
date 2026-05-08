#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${1:?Usage: deploy-prod.sh <deploy_path> <git_ref>}"
GIT_REF="${2:?Usage: deploy-prod.sh <deploy_path> <git_ref>}"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.monitoring.yml)

# ── prerequisites ──────────────────────────────────────────────

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required" >&2
  exit 1
fi

if [ ! -d "${DEPLOY_PATH}/.git" ]; then
  echo "${DEPLOY_PATH} is not a git repository. Clone the repo first." >&2
  exit 1
fi

cd "${DEPLOY_PATH}"

# ── validate .env ──────────────────────────────────────────────

if [ ! -f ".env" ]; then
  echo "Missing .env file at ${DEPLOY_PATH}/.env" >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" .env | tail -n1 || true)"
  if [ -z "$line" ]; then
    return 0
  fi
  line="${line#*=}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s\n' "$line"
}

require_env_key() {
  local key="$1"
  local value
  value="$(get_env_value "$key")"
  if [ -z "$value" ]; then
    echo ".env is missing required key: ${key}" >&2
    exit 1
  fi
}

reject_env_placeholder() {
  local key="$1"
  local value
  value="$(get_env_value "$key")"
  case "$value" in
    change-me*|*change-me*|replace-*|*replace-*|replace_with*|*replace_with*|REPLACE_*|*REPLACE_*|example|example-*|*example*|dev-*|test-*|*"<"*|*">"*)
      echo ".env key ${key} still contains a placeholder value" >&2
      exit 1
      ;;
  esac
}

reject_env_values() {
  local key="$1"
  shift
  local value
  value="$(get_env_value "$key")"
  for disallowed in "$@"; do
    if [ "$value" = "$disallowed" ]; then
      echo ".env key ${key} contains an unsafe production value" >&2
      exit 1
    fi
  done
}

required_env_keys=(
  DB_NAME
  DB_USER
  DB_PASSWORD
  DB_SSLMODE
  SECRET_KEY
  FRONTEND_URL
  ALLOWED_HOSTS
  CORS_ALLOWED_ORIGINS
  CSRF_TRUSTED_ORIGINS
  REDIS_URL
  AI_SERVICE_INTERNAL_TOKEN
  RECUR_PUBLISHABLE_KEY
  TUNNEL_TOKEN
  MCP_PUBLIC_URL
  OAUTH_ISSUER_URL
  GLITCHTIP_SECRET_KEY
  GRAFANA_PASSWORD
  OBJECT_STORAGE_ENDPOINT_URL
)

for key in "${required_env_keys[@]}"; do
  require_env_key "$key"
done

reject_env_placeholder "SECRET_KEY"
reject_env_placeholder "AI_SERVICE_INTERNAL_TOKEN"
reject_env_placeholder "TUNNEL_TOKEN"
reject_env_placeholder "GLITCHTIP_SECRET_KEY"
reject_env_placeholder "OBJECT_STORAGE_ENDPOINT_URL"
reject_env_values "DB_PASSWORD" "postgres" "password"
reject_env_values "GRAFANA_PASSWORD" "admin" "password"

for key in \
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL \
  OBJECT_STORAGE_REGION \
  OBJECT_STORAGE_ACCESS_KEY \
  OBJECT_STORAGE_SECRET_KEY \
  ANTICHEAT_RAW_BUCKET \
  MARKDOWN_IMAGE_S3_BUCKET \
  MARKDOWN_IMAGE_PUBLIC_BASE_URL \
  AI_ARTIFACT_S3_BUCKET
do
  require_env_key "$key"
  reject_env_placeholder "$key"
done

object_storage_endpoint="$(get_env_value "OBJECT_STORAGE_ENDPOINT_URL")"
case "$object_storage_endpoint" in
  http://*)
    echo ".env key OBJECT_STORAGE_ENDPOINT_URL must use HTTPS in production" >&2
    exit 1
    ;;
esac

# ── deploy ─────────────────────────────────────────────────────

echo "[deploy] fetch and checkout ${GIT_REF}"
git fetch --all --tags --prune
git checkout --force "${GIT_REF}"

echo "[deploy] pull judge image from GHCR"
if docker pull ghcr.io/quan0715/qjudge/judge:latest; then
  docker tag ghcr.io/quan0715/qjudge/judge:latest oj-judge:latest
  echo "[deploy] judge image updated from GHCR"
else
  echo "[deploy] GHCR pull failed — checking local fallback"
  if ! docker image inspect oj-judge:latest >/dev/null 2>&1; then
    echo "[deploy] no local judge image, building from Dockerfile" >&2
    docker build -t oj-judge:latest \
      -f backend/judge/Dockerfile.judge backend/judge
  fi
fi

echo "[deploy] build images"
docker compose "${COMPOSE_FILES[@]}" build

echo "[deploy] start services"
docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans

echo "[deploy] prune old images"
docker image prune -f

# ── smoke check ────────────────────────────────────────────────

echo "[deploy] smoke check"
max_attempts=30
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  if curl -sf http://localhost:80 >/dev/null 2>&1; then
    echo "[deploy] smoke ok: http://localhost:80"
    break
  fi
  sleep 2
  attempt=$((attempt + 1))
done

if [ "$attempt" -gt "$max_attempts" ]; then
  echo "[deploy] smoke failed: http://localhost:80 did not respond within 60s" >&2
  exit 1
fi

echo "[deploy] monitoring smoke check"
if ! docker inspect oj_grafana >/dev/null 2>&1; then
  echo "[deploy] monitoring smoke failed: oj_grafana container not found" >&2
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' oj_grafana)" != "true" ]; then
  echo "[deploy] monitoring smoke failed: oj_grafana is not running" >&2
  exit 1
fi

echo "[deploy] success"
