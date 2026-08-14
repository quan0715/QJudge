#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qjudge-compose-check.XXXXXX")"
CHECK_ENV="${TEMP_DIR}/compose.env"
PROJECT_ENV="${PROJECT_ROOT}/.env"
CREATED_PROJECT_ENV="false"

cleanup() {
  if [[ "$CREATED_PROJECT_ENV" == "true" && -f "$PROJECT_ENV" ]]; then
    rm -f -- "$PROJECT_ENV"
  fi
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

cd "$PROJECT_ROOT"

cp .env.example "$CHECK_ENV"
cat >> "$CHECK_ENV" <<'ENV'
QJUDGE_PUBLIC_ORIGIN=https://qjudge-compose-check.invalid
SECRET_KEY=compose-check-secret-key
POSTGRES_ADMIN_PASSWORD=compose-check-admin-password
DB_PASSWORD=compose-check-web-password
AI_DB_PASSWORD=compose-check-ai-password
CREDENTIAL_LEASE_SECRET=compose-check-credential-lease-secret
DOCKER_GID=999
DOCKER_SOCKET_UID=1000
OBJECT_STORAGE_ENDPOINT_URL=https://storage-compose-check.invalid
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://storage-compose-check.invalid
OBJECT_STORAGE_ACCESS_KEY=compose-check-storage-access-key
OBJECT_STORAGE_SECRET_KEY=compose-check-storage-secret-key
LOADTEST_OBJECT_STORAGE_ENDPOINT_URL=https://loadtest-storage-compose-check.invalid
LOADTEST_OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=https://loadtest-storage-compose-check.invalid
LOADTEST_OBJECT_STORAGE_ACCESS_KEY=compose-check-loadtest-storage-access-key
LOADTEST_OBJECT_STORAGE_SECRET_KEY=compose-check-loadtest-storage-secret-key
LOADTEST_ANTICHEAT_RAW_BUCKET=compose-check-anticheat-raw
ENV

# Compose service env_file entries require a physical project-root .env.
# Preserve an existing developer/production file; create and remove one only when absent.
if [[ ! -e "$PROJECT_ENV" ]]; then
  cp "$CHECK_ENV" "$PROJECT_ENV"
  CREATED_PROJECT_ENV="true"
fi

compose=(docker compose --env-file "$CHECK_ENV")
"${compose[@]}" -f docker-compose.yml config --quiet
"${compose[@]}" -f docker-compose.dev.yml config --quiet
"${compose[@]}" -f docker-compose.test.yml config --quiet
"${compose[@]}" -f docker-compose.yml -f docker-compose.monitoring.yml config --quiet
"${compose[@]}" -f docker-compose.dev.yml -f docker-compose.monitoring.yml config --quiet
"${compose[@]}" -f docker-compose.test.yml -f loadtest/docker-compose.loadtest.yml config --quiet
