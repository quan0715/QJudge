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

if [[ "$ENV_NAME" == "test" && $# -ge 2 ]]; then
  case "$1" in
    exec)
      if [[ "${2:-}" == "-T" && $# -ge 4 ]]; then
        case "$3" in
          backend) set -- exec -T backend-test "${@:4}" ;;
          frontend) set -- exec -T frontend-test "${@:4}" ;;
          postgres) set -- exec -T postgres-test "${@:4}" ;;
          redis) set -- exec -T redis-test "${@:4}" ;;
          celery) set -- exec -T celery-test "${@:4}" ;;
        esac
      elif [[ $# -ge 3 ]]; then
        case "$2" in
          backend) set -- exec backend-test "${@:3}" ;;
          frontend) set -- exec frontend-test "${@:3}" ;;
          postgres) set -- exec postgres-test "${@:3}" ;;
          redis) set -- exec redis-test "${@:3}" ;;
          celery) set -- exec celery-test "${@:3}" ;;
        esac
      fi
      ;;
    logs|ps|start|stop|restart|up|down|build|run|kill|rm)
      case "$2" in
        backend) set -- "$1" backend-test "${@:3}" ;;
        frontend) set -- "$1" frontend-test "${@:3}" ;;
        postgres) set -- "$1" postgres-test "${@:3}" ;;
        redis) set -- "$1" redis-test "${@:3}" ;;
        celery) set -- "$1" celery-test "${@:3}" ;;
      esac
      ;;
  esac
fi

exec "$DOCKER_BIN" compose -f "$COMPOSE_FILE" "$@"
