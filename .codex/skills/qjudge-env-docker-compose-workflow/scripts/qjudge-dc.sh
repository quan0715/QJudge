#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  qjudge-dc.sh <env> <docker compose args...>

Envs:
  main | dev | test

Examples:
  qjudge-dc.sh dev up -d --build
  qjudge-dc.sh dev exec -T backend python manage.py migrate
  qjudge-dc.sh test exec -T backend-test pytest -q
USAGE
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

ENV_NAME="$1"
shift

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

case "$ENV_NAME" in
  main)
    COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
    ;;
  dev)
    COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
    ;;
  test)
    COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"
    ;;
  *)
    echo "Unknown env: $ENV_NAME (allowed: main|dev|test)" >&2
    usage
    exit 1
    ;;
esac

exec docker compose -f "$COMPOSE_FILE" "$@"
