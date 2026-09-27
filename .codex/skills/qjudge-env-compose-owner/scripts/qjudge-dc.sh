#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  qjudge-dc.sh <env> <docker compose args...>

Envs:
  dev   local interactive development (keeps its data; never add -v to down)

E2E and database tests run in CI on a fresh install made by ci/e2e-stack.sh.
Production is managed with deploy/qjudge.

Examples:
  qjudge-dc.sh dev up -d --build
  qjudge-dc.sh dev exec -T backend python manage.py migrate
USAGE
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

ENV_NAME="$1"
shift

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

for dir in /usr/local/bin /opt/homebrew/bin /Applications/Docker.app/Contents/Resources/bin; do
  if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then
    PATH="$dir:$PATH"
  fi
done

DOCKER_BIN="${DOCKER_BIN:-$(command -v docker || true)}"

if [[ -z "$DOCKER_BIN" ]]; then
  echo "docker binary not found in PATH: $PATH" >&2
  exit 127
fi

case "$ENV_NAME" in
  dev)
    COMPOSE_ARGS=(
      --project-directory "$ROOT_DIR/deploy"
      -f "$ROOT_DIR/deploy/compose.yml"
      -f "$ROOT_DIR/deploy/compose.build.yml"
      -f "$ROOT_DIR/compose.dev.yml"
    )
    export QJUDGE_VERSION=dev QJUDGE_BUILD_ENV=development
    ;;
  *)
    echo "Unknown env: $ENV_NAME (allowed: dev)" >&2
    usage
    exit 1
    ;;
esac

exec "$DOCKER_BIN" compose "${COMPOSE_ARGS[@]}" "$@"
