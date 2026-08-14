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

docker_socket_gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"
case "$docker_socket_gid" in
  ''|*[!0-9]*)
    echo "Cannot determine the Docker socket group id" >&2
    exit 1
    ;;
esac
configured_docker_gid="$(get_env_value DOCKER_GID)"
if [ -n "$configured_docker_gid" ] && [ "$configured_docker_gid" != "$docker_socket_gid" ]; then
  echo ".env DOCKER_GID does not match /var/run/docker.sock" >&2
  exit 1
fi
export DOCKER_GID="$docker_socket_gid"

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

previous_git_ref="$(git rev-parse HEAD)"

echo "[deploy] fetch and checkout ${GIT_REF}"
git fetch --all --tags --prune
git checkout --force "${GIT_REF}"

echo "[deploy] bootstrap AI OAuth signing key"
python3 scripts/bootstrap_ai_oauth_keys.py

echo "[deploy] bootstrap Integrity credentials"
python3 scripts/bootstrap_integrity_secrets.py

echo "[deploy] validate rendered Compose"
docker compose "${COMPOSE_FILES[@]}" config --quiet

backup_file=""
running_services="$(docker compose "${COMPOSE_FILES[@]}" ps --status running --services)"
if printf '%s\n' "$running_services" | grep -qx postgres; then
  backup_dir="${DEPLOY_PATH}/artifacts/db_backups"
  backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="${backup_dir}/production_${backup_timestamp}_${previous_git_ref:0:12}.dump"
  backup_tmp="${backup_file}.tmp"
  umask 077
  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"
  echo "[deploy] create pre-deploy database backup"
  if ! docker compose "${COMPOSE_FILES[@]}" exec -T postgres sh -lc \
    'exec pg_dump --username "$POSTGRES_USER" --dbname online_judge --format=custom --no-owner --no-privileges --compress=6' \
    > "$backup_tmp"; then
    rm -f -- "$backup_tmp"
    echo "Pre-deploy database backup failed" >&2
    exit 1
  fi
  if [ ! -s "$backup_tmp" ]; then
    rm -f -- "$backup_tmp"
    echo "Pre-deploy database backup is empty" >&2
    exit 1
  fi
  if ! docker compose "${COMPOSE_FILES[@]}" exec -T postgres \
    pg_restore --list < "$backup_tmp" >/dev/null; then
    rm -f -- "$backup_tmp"
    echo "Pre-deploy database backup validation failed" >&2
    exit 1
  fi
  mv -- "$backup_tmp" "$backup_file"
  sha256sum "$backup_file" > "${backup_file}.sha256"
  echo "[deploy] backup ready: ${backup_file}"

  echo "[deploy] prepare production database administrator"
  export QJUDGE_BOOTSTRAP_ADMIN_PASSWORD="$(get_env_value POSTGRES_ADMIN_PASSWORD)"
  docker compose "${COMPOSE_FILES[@]}" exec -T \
    -e QJUDGE_BOOTSTRAP_ADMIN_PASSWORD \
    postgres \
    sh -lc 'psql --username "$POSTGRES_USER" --dbname postgres --no-psqlrc --quiet --set ON_ERROR_STOP=1' <<'SQL'
\getenv admin_password QJUDGE_BOOTSTRAP_ADMIN_PASSWORD
SELECT format(
  'CREATE ROLE qjudge_admin LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD %L',
  :'admin_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qjudge_admin')
\gexec
SELECT format(
  'ALTER ROLE qjudge_admin LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD %L',
  :'admin_password'
)
\gexec
SQL
  unset QJUDGE_BOOTSTRAP_ADMIN_PASSWORD
else
  echo "[deploy] backup skipped: postgres is not running (fresh installation)"
fi

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

echo "[deploy] build Integrity worker image"
docker compose "${COMPOSE_FILES[@]}" --profile build build integrity-worker-image

echo "[deploy] start services"
if ! docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans; then
  echo "Deployment start failed. Previous SHA: ${previous_git_ref}" >&2
  if [ -n "$backup_file" ]; then
    echo "Validated database backup: ${backup_file}" >&2
  fi
  exit 1
fi

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

# ── smoke check ────────────────────────────────────────────────

wait_for_http() {
  local label="$1"
  local url="$2"
  local attempt=1
  local max_attempts=30
  while [ "$attempt" -le "$max_attempts" ]; do
    if curl --fail --silent --show-error --max-time 8 "$url" >/dev/null 2>&1; then
      echo "[deploy] smoke ok: ${label}"
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  echo "[deploy] smoke failed: ${label} did not respond within 60s" >&2
  return 1
}

echo "[deploy] smoke check"
if ! wait_for_http "frontend" "http://localhost:80" || \
   ! wait_for_http "backend" "http://localhost:8000/api/health/" || \
   ! wait_for_http "AI service" "http://localhost:8001/health/ready" || \
   ! wait_for_http "Integrity controller" "http://localhost:8010/health"; then
  echo "Deployment health checks failed. Previous SHA: ${previous_git_ref}" >&2
  if [ -n "$backup_file" ]; then
    echo "Validated database backup: ${backup_file}" >&2
  fi
  exit 1
fi

echo "[deploy] prune old images"
docker image prune -f

echo "[deploy] success"
