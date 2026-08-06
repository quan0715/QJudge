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

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for OAuth key bootstrap" >&2
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
  POSTGRES_ADMIN_USER
  POSTGRES_ADMIN_PASSWORD
  DB_NAME
  DB_USER
  DB_PASSWORD
  AI_DB_NAME
  AI_DB_USER
  AI_DB_PASSWORD
  AI_DATABASE_URL
  GLITCHTIP_DB_NAME
  GLITCHTIP_DB_USER
  GLITCHTIP_DB_PASSWORD
  AI_REDIS_URL
  AI_QUEUE_NAME
  AI_QUEUE_KEY_PREFIX
  CREDENTIAL_LEASE_SECRET
  DB_SSLMODE
  SECRET_KEY
  FRONTEND_URL
  ALLOWED_HOSTS
  CORS_ALLOWED_ORIGINS
  CSRF_TRUSTED_ORIGINS
  REDIS_URL
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
reject_env_placeholder "POSTGRES_ADMIN_PASSWORD"
reject_env_placeholder "DB_PASSWORD"
reject_env_placeholder "AI_DB_PASSWORD"
reject_env_placeholder "AI_DATABASE_URL"
reject_env_placeholder "GLITCHTIP_DB_PASSWORD"
reject_env_placeholder "CREDENTIAL_LEASE_SECRET"
reject_env_placeholder "TUNNEL_TOKEN"
reject_env_placeholder "GLITCHTIP_SECRET_KEY"
reject_env_placeholder "OBJECT_STORAGE_ENDPOINT_URL"
reject_env_values "DB_PASSWORD" "postgres" "password"
reject_env_values "POSTGRES_ADMIN_PASSWORD" "postgres" "password"
reject_env_values "AI_DB_PASSWORD" "postgres" "password"
reject_env_values "GRAFANA_PASSWORD" "admin" "password"

postgres_admin_user="$(get_env_value POSTGRES_ADMIN_USER)"
django_db_user="$(get_env_value DB_USER)"
ai_db_user="$(get_env_value AI_DB_USER)"
glitchtip_db_user="$(get_env_value GLITCHTIP_DB_USER)"
if [ "$postgres_admin_user" = "$django_db_user" ] || \
   [ "$postgres_admin_user" = "$ai_db_user" ] || \
   [ "$postgres_admin_user" = "$glitchtip_db_user" ] || \
   [ "$django_db_user" = "$ai_db_user" ] || \
   [ "$django_db_user" = "$glitchtip_db_user" ] || \
   [ "$ai_db_user" = "$glitchtip_db_user" ]; then
  echo "POSTGRES_ADMIN_USER, DB_USER, AI_DB_USER, and GLITCHTIP_DB_USER must be distinct" >&2
  exit 1
fi
for application_user in "$django_db_user" "$ai_db_user" "$glitchtip_db_user"; do
  case "$application_user" in
    postgres|root|rds_superuser|cloudsqlsuperuser)
      echo "application database role ${application_user} must not be a superuser" >&2
      exit 1
      ;;
  esac
done

export AI_DATABASE_URL="$(get_env_value AI_DATABASE_URL)"
export AI_DB_USER="$ai_db_user"
export AI_DB_NAME="$(get_env_value AI_DB_NAME)"
export AI_DB_PASSWORD="$(get_env_value AI_DB_PASSWORD)"
python3 - <<'PY'
import os
from urllib.parse import unquote, urlsplit

url = os.environ["AI_DATABASE_URL"].replace(
    "postgresql+psycopg://", "postgresql://", 1
)
parsed = urlsplit(url)
checks = {
    "username": (unquote(parsed.username or ""), os.environ["AI_DB_USER"]),
    "password": (unquote(parsed.password or ""), os.environ["AI_DB_PASSWORD"]),
    "database": (unquote(parsed.path.lstrip("/")), os.environ["AI_DB_NAME"]),
}
for label, (actual, expected) in checks.items():
    if actual != expected:
        raise SystemExit(f"AI_DATABASE_URL {label} does not match AI database configuration")
PY
unset AI_DATABASE_URL AI_DB_USER AI_DB_NAME AI_DB_PASSWORD

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

echo "[deploy] bootstrap AI OAuth signing key"
python3 scripts/bootstrap_ai_oauth_keys.py

echo "[deploy] validate rendered Compose"
docker compose "${COMPOSE_FILES[@]}" config --quiet

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

echo "[deploy] verify application database roles"
export PGPASSWORD="$(get_env_value POSTGRES_ADMIN_PASSWORD)"
unsafe_role_count="$({
  docker compose "${COMPOSE_FILES[@]}" exec -T \
    -e PGPASSWORD \
    postgres \
    psql --no-psqlrc --quiet --tuples-only --no-align \
      --username "$postgres_admin_user" \
      --dbname postgres \
      --set "django_db_user=$django_db_user" \
      --set "ai_db_user=$ai_db_user" \
      --set "glitchtip_db_user=$glitchtip_db_user" <<'SQL'
SELECT count(*)
FROM pg_roles
WHERE rolname IN (:'django_db_user', :'ai_db_user', :'glitchtip_db_user')
  AND (rolsuper OR rolcreatedb OR rolcreaterole);
SQL
} | tr -d '[:space:]')"
unset PGPASSWORD
if [ "$unsafe_role_count" != "0" ]; then
  echo "Application database roles must be non-superusers without role/database creation privileges" >&2
  exit 1
fi

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
