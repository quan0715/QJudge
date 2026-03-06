#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"

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

if [[ $# -ge 1 && -n "${1:-}" ]]; then
  COMPOSE_FILE="$1"
fi

if [[ "$COMPOSE_FILE" != /* ]]; then
  COMPOSE_FILE="$PROJECT_ROOT/$COMPOSE_FILE"
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[minio-init] compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

load_env_file "$ENV_FILE"

dc() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

echo "[minio-init] ensuring minio service is running"
if ! dc ps --status running minio | grep -q minio; then
  dc up -d minio
fi

minio_cid="$(dc ps -q minio)"
if [[ -z "$minio_cid" ]]; then
  echo "[minio-init] unable to resolve minio container id" >&2
  exit 1
fi

network_name="$(docker inspect "$minio_cid" --format '{{range $k, $_ := .NetworkSettings.Networks}}{{println $k}}{{end}}' | head -n1)"
if [[ -z "$network_name" ]]; then
  echo "[minio-init] unable to resolve minio docker network" >&2
  exit 1
fi

echo "[minio-init] running init-minio.sh in ephemeral minio/mc container"
docker run --rm \
  --network "$network_name" \
  --entrypoint /bin/sh \
  -v "$PROJECT_ROOT/scripts/minio:/config:ro" \
  -e MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}" \
  -e MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}" \
  -e MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}" \
  -e ANTICHEAT_RAW_BUCKET="${ANTICHEAT_RAW_BUCKET:-anticheat-raw}" \
  -e ANTICHEAT_VIDEO_BUCKET="${ANTICHEAT_VIDEO_BUCKET:-anticheat-videos}" \
  -e ANTICHEAT_CORS_ALLOWED_ORIGINS="${ANTICHEAT_CORS_ALLOWED_ORIGINS:-http://localhost:5173}" \
  minio/mc:latest /config/init-minio.sh

echo "[minio-init] completed"
