#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/db/refresh_local_from_prod.sh [--env dev|main] [--dump-file PATH] [--yes] [--skip-build]
                                         [--remote SSH_TARGET] [--remote-path PATH]
                                         [--remote-postgres-service SERVICE]

Description:
  1. SSH into the production host and dump the postgres Docker service.
  2. Replace the local Docker Compose PostgreSQL database.
  3. Run Django migrations in the backend container.
  4. Purge local anti-cheat evidence metadata and MinIO anti-cheat buckets.

Options:
  --env         Compose environment to refresh. Default: dev
  --dump-file   Use this dump file path instead of generating a timestamped one.
  --yes         Skip the destructive confirmation prompt.
  --skip-build  Reuse existing images when bringing services back up.
  --remote      SSH target for production. Default: quan338.tailc351c1.ts.net
  --remote-path Production deploy path. Default: ~/deploy/QJudge
  --remote-postgres-service
                Production postgres compose service name. Default: postgres
  -h, --help    Show this help text.
USAGE
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DC_WRAPPER="$ROOT_DIR/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
ENV_NAME="dev"
DUMP_FILE=""
ASSUME_YES=0
SKIP_BUILD=0
BACKUP_DIR="$ROOT_DIR/artifacts/db_backups"
REMOTE_SSH_TARGET="quan338.tailc351c1.ts.net"
REMOTE_DEPLOY_PATH="~/deploy/QJudge"
REMOTE_POSTGRES_SERVICE="postgres"

for dir in /usr/local/bin /opt/homebrew/bin /Applications/Docker.app/Contents/Resources/bin; do
  if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then
    PATH="$dir:$PATH"
  fi
done

compose_file_for_env() {
  case "$1" in
    main)
      printf '%s\n' "$ROOT_DIR/docker-compose.yml"
      ;;
    dev)
      printf '%s\n' "$ROOT_DIR/docker-compose.dev.yml"
      ;;
    test)
      printf '%s\n' "$ROOT_DIR/docker-compose.test.yml"
      ;;
    *)
      die "unsupported env: $1"
      ;;
  esac
}

load_env_file() {
  local env_file="$1"
  local line key value
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line#export }"
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      value="${value#"${value%%[![:space:]]*}"}"
      if [[ "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "$key=$value"
    fi
  done < "$env_file"
}

log() {
  printf '[refresh-db] %s\n' "$*"
}

die() {
  printf '[refresh-db] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

dc() {
  "$DC_WRAPPER" "$ENV_NAME" "$@"
}

wait_for_service_running() {
  local service="$1"
  local retries="${2:-60}"
  local sleep_seconds="${3:-2}"
  local attempt
  for (( attempt=1; attempt<=retries; attempt++ )); do
    if dc ps --status running "$service" | grep -q "$service"; then
      return 0
    fi
    sleep "$sleep_seconds"
  done
  die "service did not become running in time: $service"
}

remote_path_for_shell() {
  if [[ "$1" == "~/"* ]]; then
    local suffix="${1#\~/}"
    printf '$HOME/%s\n' "$suffix"
    return 0
  fi
  printf '%s\n' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      [[ $# -ge 2 ]] || die "--env requires a value"
      ENV_NAME="$2"
      shift 2
      ;;
    --dump-file)
      [[ $# -ge 2 ]] || die "--dump-file requires a value"
      DUMP_FILE="$2"
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --remote)
      [[ $# -ge 2 ]] || die "--remote requires a value"
      REMOTE_SSH_TARGET="$2"
      shift 2
      ;;
    --remote-path)
      [[ $# -ge 2 ]] || die "--remote-path requires a value"
      REMOTE_DEPLOY_PATH="$2"
      shift 2
      ;;
    --remote-postgres-service)
      [[ $# -ge 2 ]] || die "--remote-postgres-service requires a value"
      REMOTE_POSTGRES_SERVICE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

require_cmd docker
require_cmd ssh
[[ -x "$DC_WRAPPER" ]] || die "compose wrapper not found: $DC_WRAPPER"

load_env_file "$ENV_FILE"

LOCAL_DB_NAME="${DB_NAME:-online_judge}"
LOCAL_DB_USER="${DB_USER:-postgres}"
LOCAL_DB_PASSWORD="${DB_PASSWORD:-postgres}"
LOCAL_DB_PORT="${DB_PORT:-5432}"
ANTICHEAT_RAW_BUCKET="${ANTICHEAT_RAW_BUCKET:-anticheat-raw}"

mkdir -p "$BACKUP_DIR"
if [[ -z "$DUMP_FILE" ]]; then
  DUMP_FILE="$BACKUP_DIR/prod_${ENV_NAME}_$(date +%Y%m%d_%H%M%S).dump"
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  cat <<EOF
This will:
  1. SSH to ${REMOTE_SSH_TARGET}
  2. Dump postgres service ${REMOTE_POSTGRES_SERVICE} under ${REMOTE_DEPLOY_PATH}
  2. Replace local ${ENV_NAME} DB ${LOCAL_DB_NAME}
  3. Run Django migrations
  4. Delete local anti-cheat evidence metadata and MinIO bucket contents

Dump file:
  $DUMP_FILE
EOF
  read -r -p "Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    log "aborted"
    exit 1
  fi
fi

APP_SERVICES=(frontend backend celery celery-beat ai-service redis pgbouncer)
BUILD_ARGS=(-d)
if [[ "$SKIP_BUILD" -ne 1 ]]; then
  BUILD_ARGS=( -d --build )
fi

COMPOSE_FILE="$(compose_file_for_env "$ENV_NAME")"
REMOTE_DEPLOY_PATH_SHELL="$(remote_path_for_shell "$REMOTE_DEPLOY_PATH")"

log "starting postgres and minio"
dc up -d postgres minio
wait_for_service_running postgres

log "stopping app services to release database connections"
dc stop "${APP_SERVICES[@]}" >/dev/null 2>&1 || true

log "waiting for postgres"
dc exec -T postgres pg_isready -h localhost -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" -d postgres >/dev/null

log "dumping production database to $DUMP_FILE"
ssh "$REMOTE_SSH_TARGET" \
  "cd \"$REMOTE_DEPLOY_PATH_SHELL\" && docker compose exec -T \"$REMOTE_POSTGRES_SERVICE\" sh -lc 'PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --format=custom --no-owner --no-privileges --compress=6'" \
  > "$DUMP_FILE"

[[ -s "$DUMP_FILE" ]] || die "dump file was not created or is empty: $DUMP_FILE"

log "terminating remaining local connections"
dc exec -T \
  -e PGPASSWORD="$LOCAL_DB_PASSWORD" \
  postgres \
  psql \
    -h localhost \
    -p "$LOCAL_DB_PORT" \
    -U "$LOCAL_DB_USER" \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB_NAME' AND pid <> pg_backend_pid();"

log "recreating local database $LOCAL_DB_NAME"
dc exec -T -e PGPASSWORD="$LOCAL_DB_PASSWORD" postgres dropdb --if-exists -h localhost -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" "$LOCAL_DB_NAME"
dc exec -T -e PGPASSWORD="$LOCAL_DB_PASSWORD" postgres createdb -h localhost -p "$LOCAL_DB_PORT" -U "$LOCAL_DB_USER" "$LOCAL_DB_NAME"

log "restoring dump into local database"
cat "$DUMP_FILE" | dc exec -T \
  -e PGPASSWORD="$LOCAL_DB_PASSWORD" \
  postgres \
  pg_restore \
    -h localhost \
    -p "$LOCAL_DB_PORT" \
    -U "$LOCAL_DB_USER" \
    -d "$LOCAL_DB_NAME" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --verbose

log "bringing compose stack back up"
dc up "${BUILD_ARGS[@]}"
wait_for_service_running backend

log "running migrations in backend container"
dc exec -T backend python manage.py migrate

log "clearing local MinIO anti-cheat bucket"
dc exec -T minio sh -lc "rm -rf '/data/${ANTICHEAT_RAW_BUCKET}' && mkdir -p '/data/${ANTICHEAT_RAW_BUCKET}'"

log "re-initializing MinIO buckets and policies"
"$ROOT_DIR/scripts/minio/run-init.sh" "$COMPOSE_FILE"

log "completed"
log "dump saved at: $DUMP_FILE"
