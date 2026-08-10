#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${1:?Usage: deploy-prod.sh <deploy_path> <git_ref>}"
GIT_REF="${2:?Usage: deploy-prod.sh <deploy_path> <git_ref>}"
COMPOSE_FILES=(-f docker-compose.yml)

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
  POSTGRES_ADMIN_PASSWORD
  DB_PASSWORD
  AI_DB_PASSWORD
  CREDENTIAL_LEASE_SECRET
  SECRET_KEY
  QJUDGE_PUBLIC_ORIGIN
  OBJECT_STORAGE_ENDPOINT_URL
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
  OBJECT_STORAGE_ACCESS_KEY
  OBJECT_STORAGE_SECRET_KEY
)

for key in "${required_env_keys[@]}"; do
  require_env_key "$key"
done

reject_env_placeholder "SECRET_KEY"
reject_env_placeholder "POSTGRES_ADMIN_PASSWORD"
reject_env_placeholder "DB_PASSWORD"
reject_env_placeholder "AI_DB_PASSWORD"
reject_env_placeholder "CREDENTIAL_LEASE_SECRET"
reject_env_placeholder "QJUDGE_PUBLIC_ORIGIN"
reject_env_placeholder "OBJECT_STORAGE_ENDPOINT_URL"
reject_env_placeholder "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"
reject_env_placeholder "OBJECT_STORAGE_ACCESS_KEY"
reject_env_placeholder "OBJECT_STORAGE_SECRET_KEY"
reject_env_values "DB_PASSWORD" "postgres" "password"
reject_env_values "POSTGRES_ADMIN_PASSWORD" "postgres" "password"
reject_env_values "AI_DB_PASSWORD" "postgres" "password"

postgres_admin_user="qjudge_admin"
django_db_user="qjudge_web"
ai_db_user="qjudge_ai"

public_origin="$(get_env_value QJUDGE_PUBLIC_ORIGIN)"
export QJUDGE_PUBLIC_ORIGIN="$public_origin"
python3 - <<'PY'
import os
from urllib.parse import urlsplit

value = os.environ["QJUDGE_PUBLIC_ORIGIN"].strip()
try:
    parsed = urlsplit(value)
    parsed.port
except ValueError as exc:
    raise SystemExit("QJUDGE_PUBLIC_ORIGIN is not a valid origin") from exc
if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
    raise SystemExit("QJUDGE_PUBLIC_ORIGIN must use http or https and include a host")
if parsed.username is not None or parsed.password is not None:
    raise SystemExit("QJUDGE_PUBLIC_ORIGIN must not include user information")
if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
    raise SystemExit("QJUDGE_PUBLIC_ORIGIN must not include a path, query, or fragment")
PY
unset QJUDGE_PUBLIC_ORIGIN

object_storage_endpoint="$(get_env_value "OBJECT_STORAGE_ENDPOINT_URL")"
object_storage_public_endpoint="$(get_env_value "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL")"
python3 - \
  "$public_origin" \
  "$object_storage_endpoint" \
  "$object_storage_public_endpoint" <<'PY'
import sys
from urllib.parse import urlsplit

origin_value, endpoint_value, public_endpoint_value = sys.argv[1:]


def parse_endpoint(label: str, value: str):
    try:
        parsed = urlsplit(value.strip())
        parsed.port
    except ValueError as exc:
        raise SystemExit(f".env key {label} is not a valid URL") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise SystemExit(f".env key {label} must use HTTP or HTTPS and include a host")
    if parsed.username is not None or parsed.password is not None:
        raise SystemExit(f".env key {label} must not include user information")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise SystemExit(f".env key {label} must not include a path, query, or fragment")
    return parsed


origin = urlsplit(origin_value)
parse_endpoint("OBJECT_STORAGE_ENDPOINT_URL", endpoint_value)
public_endpoint = parse_endpoint(
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", public_endpoint_value
)
if origin.scheme.lower() == "https" and public_endpoint.scheme.lower() != "https":
    raise SystemExit(
        ".env key OBJECT_STORAGE_PUBLIC_ENDPOINT_URL must use HTTPS "
        "when QJUDGE_PUBLIC_ORIGIN uses HTTPS"
    )
PY

tunnel_token="$(get_env_value TUNNEL_TOKEN)"
if [ -n "$tunnel_token" ]; then
  reject_env_placeholder "TUNNEL_TOKEN"
  COMPOSE_FILES+=(--profile tunnel)
fi

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
      --set "ai_db_user=$ai_db_user" <<'SQL'
SELECT count(*)
FROM pg_roles
WHERE rolname IN (:'django_db_user', :'ai_db_user')
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

echo "[deploy] success"
