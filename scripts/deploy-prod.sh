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

require_env_key() {
  local key="$1"
  if ! grep -Eq "^${key}=.+" .env; then
    echo ".env is missing required key: ${key}" >&2
    exit 1
  fi
}

require_env_key "DB_PASSWORD"
require_env_key "SECRET_KEY"

# ── deploy ─────────────────────────────────────────────────────

echo "[deploy] fetch and checkout ${GIT_REF}"
git fetch --all --tags --prune
git checkout --force "${GIT_REF}"

echo "[deploy] build images"
docker compose "${COMPOSE_FILES[@]}" build

echo "[deploy] start services"
docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans

echo "[deploy] initialize MinIO anti-cheat buckets/policies"
if [ ! -x "./scripts/minio/run-init.sh" ]; then
  echo "[deploy] scripts/minio/run-init.sh not found or not executable" >&2
  exit 1
fi
ENV_FILE="${DEPLOY_PATH}/.env" ./scripts/minio/run-init.sh docker-compose.yml

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
