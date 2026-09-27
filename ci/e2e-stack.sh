#!/usr/bin/env bash
# Install QJudge from scratch the way a self-hoster does, then switch it to
# the E2E overrides and seed test data. Extra `--set KEY=VALUE` arguments are
# passed to `deploy/qjudge init` and win over the defaults below.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

deploy/qjudge init --non-interactive \
  --set QJUDGE_PUBLIC_ORIGIN=http://localhost:8080 \
  --set STORAGE_MODE=bundled \
  --set OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=http://minio:9000 \
  --set HOST_PROJECT_ROOT="$ROOT" \
  "$@"

if grep -q '^STORAGE_MODE=bundled$' deploy/.env; then
  deploy/qjudge addon storage up
  deploy/qjudge addon storage init
fi

deploy/qjudge upgrade "$(git rev-parse HEAD)"

version="sha-$(sed -n 's/^current=//p' deploy/.version | cut -c1-12)"
project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' deploy/.env)"
port="$(sed -n 's/^FRONTEND_PORT=//p' deploy/.env)"
base="http://localhost:${port:-8080}"
# `env` keeps the printed command usable as `$QJ_DC <args>`.
dc=(env QJUDGE_VERSION="$version" docker compose --project-name "${project:-qjudge}"
    --project-directory "$ROOT/deploy" --env-file "$ROOT/deploy/.env"
    -f "$ROOT/deploy/compose.yml" -f "$ROOT/deploy/compose.build.yml" -f "$ROOT/ci/compose.e2e.yml")

"${dc[@]}" up -d --remove-orphans
# nginx resolves `backend` once at start; the overlay recreated backend.
"${dc[@]}" restart frontend
for attempt in $(seq 90); do
  if curl --fail --silent --output /dev/null "$base/api/health/" \
    && curl --fail --silent --output /dev/null "$base/"; then
    break
  fi
  if [ "$attempt" = 90 ]; then
    "${dc[@]}" ps
    exit 1
  fi
  sleep 2
done
"${dc[@]}" exec -T backend python manage.py seed_e2e_data

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "QJ_DC=${dc[*]}" >> "$GITHUB_ENV"
else
  echo "${dc[*]}"
fi
