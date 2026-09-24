#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DC_SCRIPT="$ROOT_DIR/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh"

if [[ ! -x "$DC_SCRIPT" ]]; then
  echo "missing compose wrapper: $DC_SCRIPT" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for health checks" >&2
  exit 127
fi

check_service_running() {
  local service="$1"
  local container_id
  container_id="$("$DC_SCRIPT" dev ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "[FAIL] service '$service' is not created" >&2
    exit 1
  fi
  local running
  running="$("$DC_SCRIPT" dev ps --status running -q "$service")"
  if [[ -z "$running" ]]; then
    echo "[FAIL] service '$service' is not running" >&2
    exit 1
  fi
  echo "[OK] service '$service' is running"
}

check_http() {
  local label="$1"
  local url="$2"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$code" != "200" ]]; then
    echo "[FAIL] $label returned HTTP $code ($url)" >&2
    exit 1
  fi
  echo "[OK] $label returned HTTP 200"
}

check_service_running frontend
check_service_running storybook

check_http "Frontend" "http://localhost:5173/"
check_http "Storybook direct" "http://localhost:6006/"
check_http "Storybook via frontend proxy" "http://localhost:5173/dev/storybook/"

echo "dev services check passed"
