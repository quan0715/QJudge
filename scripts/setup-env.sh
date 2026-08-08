#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET=""
STORAGE=""
PUBLIC_ORIGIN=""
OUTPUT_PATH="${REPOSITORY_ROOT}/.env"
FORCE=false
TEMP_ENV=""

usage() {
  echo "Usage: setup-env.sh --target <cloud-vm|self-hosted> --storage <r2> --origin <http(s)://host> [--output <path>] [--force]" >&2
}

cleanup() {
  if [ -n "$TEMP_ENV" ] && [ -f "$TEMP_ENV" ]; then
    rm -f -- "$TEMP_ENV"
  fi
}
trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      TARGET="$2"
      shift 2
      ;;
    --storage)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      STORAGE="$2"
      shift 2
      ;;
    --origin)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      PUBLIC_ORIGIN="$2"
      shift 2
      ;;
    --output)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --force)
      FORCE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

case "$TARGET" in
  cloud-vm|self-hosted) ;;
  *)
    echo "--target must be cloud-vm or self-hosted" >&2
    exit 2
    ;;
esac

case "$STORAGE" in
  r2) ;;
  minio)
    echo "MinIO setup is not implemented yet" >&2
    exit 2
    ;;
  *)
    echo "--storage must be r2" >&2
    exit 2
    ;;
esac

if [ -z "$PUBLIC_ORIGIN" ]; then
  echo "--origin is required" >&2
  exit 2
fi

if [ -e "$OUTPUT_PATH" ] && [ "$FORCE" != true ]; then
  echo "Refusing to overwrite existing env file: $OUTPUT_PATH" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required" >&2
  exit 1
fi

NORMALIZED_ORIGIN="$(python3 - "$PUBLIC_ORIGIN" <<'PY'
import sys
from urllib.parse import urlsplit

value = sys.argv[1].strip()
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
print(f"{parsed.scheme.lower()}://{parsed.netloc}")
PY
)"

read_if_missing() {
  local variable_name="$1"
  local prompt="$2"
  local silent="${3:-false}"
  local value="${!variable_name:-}"
  if [ -n "$value" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    echo "$variable_name is required for non-interactive setup" >&2
    exit 1
  fi
  if [ "$silent" = true ]; then
    read -r -s -p "$prompt" value
    echo >&2
  else
    read -r -p "$prompt" value
  fi
  if [ -z "$value" ]; then
    echo "$variable_name must not be empty" >&2
    exit 1
  fi
  printf -v "$variable_name" '%s' "$value"
  export "$variable_name"
}

read_if_missing OBJECT_STORAGE_ENDPOINT_URL "R2 S3 endpoint: "
if [ -z "${OBJECT_STORAGE_PUBLIC_ENDPOINT_URL:-}" ]; then
  OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
  export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
fi
read_if_missing OBJECT_STORAGE_ACCESS_KEY "R2 access key: " true
read_if_missing OBJECT_STORAGE_SECRET_KEY "R2 secret key: " true

case "$OBJECT_STORAGE_ENDPOINT_URL" in
  https://*) ;;
  *)
    echo "R2 OBJECT_STORAGE_ENDPOINT_URL must use HTTPS" >&2
    exit 1
    ;;
esac
case "$OBJECT_STORAGE_PUBLIC_ENDPOINT_URL" in
  https://*) ;;
  *)
    echo "R2 OBJECT_STORAGE_PUBLIC_ENDPOINT_URL must use HTTPS" >&2
    exit 1
    ;;
esac

require_pair() {
  local label="$1"
  local first_name="$2"
  local second_name="$3"
  local first_value="${!first_name:-}"
  local second_value="${!second_name:-}"
  if { [ -n "$first_value" ] && [ -z "$second_value" ]; } || \
     { [ -z "$first_value" ] && [ -n "$second_value" ]; }; then
    echo "$label credentials must be configured together" >&2
    exit 1
  fi
}

require_pair "NYCU OAuth" NYCU_OAUTH_CLIENT_ID NYCU_OAUTH_CLIENT_SECRET
require_pair "GitHub OAuth" GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET
require_pair "Google OAuth" GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET
require_pair "SMTP" EMAIL_HOST_USER EMAIL_HOST_PASSWORD
require_pair \
  "Cloudflare Realtime" \
  CLOUDFLARE_REALTIME_APP_ID \
  CLOUDFLARE_REALTIME_APP_SECRET

OUTPUT_DIR="$(dirname "$OUTPUT_PATH")"
if [ ! -d "$OUTPUT_DIR" ]; then
  echo "Output directory does not exist: $OUTPUT_DIR" >&2
  exit 1
fi

if [ ! -S /var/run/docker.sock ] && [ ! -e /var/run/docker.sock ]; then
  echo "Cannot inspect /var/run/docker.sock; start Docker before setup" >&2
  exit 1
fi
DOCKER_GID="$(python3 - <<'PY'
import os

print(os.stat("/var/run/docker.sock").st_gid)
PY
)"
DOCKER_SOCKET_UID="$(python3 - <<'PY'
import os

print(os.stat("/var/run/docker.sock").st_uid)
PY
)"

random_token() {
  python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
}

random_password() {
  python3 -c 'import secrets, string; alphabet = string.ascii_letters + string.digits; print("".join(secrets.choice(alphabet) for _ in range(48)))'
}

SECRET_KEY="$(random_token)"
POSTGRES_ADMIN_PASSWORD="$(random_password)"
DB_PASSWORD="$(random_password)"
AI_DB_PASSWORD="$(random_password)"
CREDENTIAL_LEASE_SECRET="$(random_token)"

OPTIONAL_ENV_KEYS=(
  OPENAI_API_KEY
  OPENAI_BASE_URL
  DEEPSEEK_API_KEY
  DEEPSEEK_BASE_URL
  MCP_PUBLIC_URL
  TUNNEL_TOKEN
  NYCU_OAUTH_CLIENT_ID
  NYCU_OAUTH_CLIENT_SECRET
  GITHUB_OAUTH_CLIENT_ID
  GITHUB_OAUTH_CLIENT_SECRET
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
  EMAIL_HOST_USER
  EMAIL_HOST_PASSWORD
  CLOUDFLARE_REALTIME_APP_ID
  CLOUDFLARE_REALTIME_APP_SECRET
)

TEMP_ENV="$(mktemp "${OUTPUT_DIR}/.qjudge-env.XXXXXX")"
chmod 600 "$TEMP_ENV"
{
  printf 'QJUDGE_PUBLIC_ORIGIN=%s\n' "$NORMALIZED_ORIGIN"
  printf 'SECRET_KEY=%s\n' "$SECRET_KEY"
  printf 'POSTGRES_ADMIN_PASSWORD=%s\n' "$POSTGRES_ADMIN_PASSWORD"
  printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
  printf 'AI_DB_PASSWORD=%s\n' "$AI_DB_PASSWORD"
  printf 'CREDENTIAL_LEASE_SECRET=%s\n' "$CREDENTIAL_LEASE_SECRET"
  printf 'OBJECT_STORAGE_ENDPOINT_URL=%s\n' "$OBJECT_STORAGE_ENDPOINT_URL"
  printf 'OBJECT_STORAGE_PUBLIC_ENDPOINT_URL=%s\n' "$OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"
  printf 'OBJECT_STORAGE_ACCESS_KEY=%s\n' "$OBJECT_STORAGE_ACCESS_KEY"
  printf 'OBJECT_STORAGE_SECRET_KEY=%s\n' "$OBJECT_STORAGE_SECRET_KEY"
  printf 'HOST_PROJECT_ROOT=%s\n' "$REPOSITORY_ROOT"
  printf 'DOCKER_GID=%s\n' "$DOCKER_GID"
  printf 'DOCKER_SOCKET_UID=%s\n' "$DOCKER_SOCKET_UID"
  for optional_key in "${OPTIONAL_ENV_KEYS[@]}"; do
    optional_value="${!optional_key:-}"
    if [ -n "$optional_value" ]; then
      printf '%s=%s\n' "$optional_key" "$optional_value"
    fi
  done
} > "$TEMP_ENV"

docker compose \
  --env-file "$TEMP_ENV" \
  -f "${REPOSITORY_ROOT}/docker-compose.yml" \
  config --quiet

mv -f -- "$TEMP_ENV" "$OUTPUT_PATH"
TEMP_ENV=""
chmod 600 "$OUTPUT_PATH"
echo "Environment ready: $OUTPUT_PATH"
