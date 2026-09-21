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
LIVE_MONITORING_ENABLED="${LIVE_MONITORING_ENABLED:-false}"
LIVEKIT_ENVIRONMENT="${LIVEKIT_ENVIRONMENT:-main}"
LIVEKIT_PUBLIC_URL="${LIVEKIT_PUBLIC_URL:-}"
LIVEKIT_INTERNAL_URL="${LIVEKIT_INTERNAL_URL:-}"
LIVEKIT_API_KEY="${LIVEKIT_API_KEY:-}"
LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:-}"
LIVEKIT_NODE_IP="${LIVEKIT_NODE_IP:-}"
LIVEKIT_STUN_HOST="${LIVEKIT_STUN_HOST:-}"
LIVEKIT_ADVERTISE_INTERNAL_IP="${LIVEKIT_ADVERTISE_INTERNAL_IP:-false}"
LIVEKIT_IMAGE="${LIVEKIT_IMAGE:-livekit/livekit-server:v1.13.7@sha256:6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3}"
LIVEKIT_CONFIG_FILE="${LIVEKIT_CONFIG_FILE:-./.tmp/livekit/${LIVEKIT_ENVIRONMENT}.json}"
LIVEKIT_TURN_ENABLED="${LIVEKIT_TURN_ENABLED:-false}"
LIVEKIT_TURN_HOST="${LIVEKIT_TURN_HOST:-}"
LIVEKIT_TURN_PORT="${LIVEKIT_TURN_PORT:-3478}"
LIVEKIT_TURN_PROTOCOLS="${LIVEKIT_TURN_PROTOCOLS:-udp,tcp}"
LIVEKIT_TURN_SECRET="${LIVEKIT_TURN_SECRET:-}"
LIVEKIT_TURN_TTL_SECONDS="${LIVEKIT_TURN_TTL_SECONDS:-300}"
LIVEKIT_TURN_REALM="${LIVEKIT_TURN_REALM:-}"
LIVEKIT_TURN_RELAY_PORT_START="${LIVEKIT_TURN_RELAY_PORT_START:-50300}"
LIVEKIT_TURN_RELAY_PORT_END="${LIVEKIT_TURN_RELAY_PORT_END:-50399}"
COTURN_CONFIG_FILE="${COTURN_CONFIG_FILE:-./.tmp/livekit/coturn.conf}"
COTURN_UID="${COTURN_UID:-$(id -u)}"
COTURN_GID="${COTURN_GID:-$(id -g)}"

is_truthy() {
  case "${1:-}" in
    1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|[Oo][Nn]) return 0 ;;
    *) return 1 ;;
  esac
}

usage() {
  echo "Usage: setup-env.sh --target <cloud-vm|self-hosted> --storage <r2|minio> --origin <http(s)://host> [--output <path>] [--force]" >&2
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
  r2|minio) ;;
  *)
    echo "--storage must be r2 or minio" >&2
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

if [ "$STORAGE" = r2 ]; then
  read_if_missing OBJECT_STORAGE_ENDPOINT_URL "R2 S3 endpoint: "
  if [ -z "${OBJECT_STORAGE_PUBLIC_ENDPOINT_URL:-}" ]; then
    OBJECT_STORAGE_PUBLIC_ENDPOINT_URL="$OBJECT_STORAGE_ENDPOINT_URL"
    export OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
  fi
  read_if_missing OBJECT_STORAGE_ACCESS_KEY "R2 access key: " true
  read_if_missing OBJECT_STORAGE_SECRET_KEY "R2 secret key: " true
  OBJECT_STORAGE_REGION=auto
  OBJECT_STORAGE_AUTO_CREATE_BUCKETS=false
  OBJECT_STORAGE_OBJECT_TAGGING_ENABLED=false
else
  read_if_missing OBJECT_STORAGE_ENDPOINT_URL "MinIO endpoint used by QJudge containers: "
  read_if_missing OBJECT_STORAGE_PUBLIC_ENDPOINT_URL "MinIO endpoint opened by users' browsers: "
  read_if_missing OBJECT_STORAGE_ACCESS_KEY "MinIO access key: " true
  read_if_missing OBJECT_STORAGE_SECRET_KEY "MinIO secret key: " true
  OBJECT_STORAGE_REGION=us-east-1
  OBJECT_STORAGE_AUTO_CREATE_BUCKETS=true
  OBJECT_STORAGE_OBJECT_TAGGING_ENABLED=true
fi

python3 - \
  "$STORAGE" \
  "$NORMALIZED_ORIGIN" \
  "$OBJECT_STORAGE_ENDPOINT_URL" \
  "$OBJECT_STORAGE_PUBLIC_ENDPOINT_URL" <<'PY'
import sys
from urllib.parse import urlsplit

storage, origin_value, endpoint_value, public_endpoint_value = sys.argv[1:]


def parse_endpoint(label: str, value: str):
    try:
        parsed = urlsplit(value.strip())
        parsed.port
    except ValueError as exc:
        raise SystemExit(f"{label} is not a valid URL") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise SystemExit(f"{label} must use HTTP or HTTPS and include a host")
    if parsed.username is not None or parsed.password is not None:
        raise SystemExit(f"{label} must not include user information")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise SystemExit(f"{label} must not include a path, query, or fragment")
    return parsed


origin = urlsplit(origin_value)
endpoint = parse_endpoint("object storage endpoint", endpoint_value)
public_endpoint = parse_endpoint("object storage public endpoint", public_endpoint_value)

if storage == "r2" and (
    endpoint.scheme.lower() != "https" or public_endpoint.scheme.lower() != "https"
):
    raise SystemExit("R2 endpoints must use HTTPS")
if origin.scheme.lower() == "https" and public_endpoint.scheme.lower() != "https":
    raise SystemExit("object storage public endpoint must use HTTPS when QJudge uses HTTPS")
PY

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

if is_truthy "$LIVE_MONITORING_ENABLED"; then
  case "$LIVEKIT_ENVIRONMENT" in
    main|dev|test) ;;
    *)
      echo "LIVEKIT_ENVIRONMENT must be main, dev, or test" >&2
      exit 2
      ;;
  esac

  case "$LIVEKIT_ENVIRONMENT" in
    main) LIVEKIT_INTERNAL_URL="${LIVEKIT_INTERNAL_URL:-http://livekit:7880}" ;;
    dev) LIVEKIT_INTERNAL_URL="${LIVEKIT_INTERNAL_URL:-http://livekit:7883}" ;;
    test) LIVEKIT_INTERNAL_URL="${LIVEKIT_INTERNAL_URL:-http://livekit-test:7890}" ;;
  esac
  read_if_missing LIVEKIT_PUBLIC_URL "LiveKit public URL: "
  read_if_missing LIVEKIT_API_KEY "LiveKit API key: " true
  read_if_missing LIVEKIT_API_SECRET "LiveKit API secret: " true
  read_if_missing LIVEKIT_NODE_IP "LiveKit reachable node IP: "
  read_if_missing LIVEKIT_STUN_HOST "Local STUN/TURN host: "
  if [ "$LIVEKIT_ENVIRONMENT" = "main" ]; then
    read_if_missing LIVEKIT_TURN_ENABLED "Enable coturn TURN (true/false): "
  fi
  if is_truthy "$LIVEKIT_TURN_ENABLED"; then
    read_if_missing LIVEKIT_TURN_HOST "Public TURN host: "
    read_if_missing LIVEKIT_TURN_SECRET "TURN shared secret: " true
  fi

  LIVEKIT_CONFIG_PATH_ABS="$LIVEKIT_CONFIG_FILE"
  if [[ "$LIVEKIT_CONFIG_PATH_ABS" != /* ]]; then
    LIVEKIT_CONFIG_PATH_ABS="${REPOSITORY_ROOT}/${LIVEKIT_CONFIG_PATH_ABS#./}"
  fi
  mkdir -p -- "$(dirname "$LIVEKIT_CONFIG_PATH_ABS")"
  export LIVE_MONITORING_ENABLED LIVEKIT_ENVIRONMENT LIVEKIT_PUBLIC_URL
  export LIVEKIT_INTERNAL_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET
  export LIVEKIT_NODE_IP LIVEKIT_STUN_HOST LIVEKIT_ADVERTISE_INTERNAL_IP LIVEKIT_IMAGE
  export LIVEKIT_TURN_ENABLED LIVEKIT_TURN_HOST LIVEKIT_TURN_PORT LIVEKIT_TURN_PROTOCOLS
  export LIVEKIT_TURN_SECRET LIVEKIT_TURN_TTL_SECONDS LIVEKIT_TURN_REALM
  export LIVEKIT_TURN_RELAY_PORT_START LIVEKIT_TURN_RELAY_PORT_END
  export COTURN_UID COTURN_GID
  if is_truthy "$LIVEKIT_TURN_ENABLED"; then
    COTURN_CONFIG_PATH_ABS="$COTURN_CONFIG_FILE"
    if [[ "$COTURN_CONFIG_PATH_ABS" != /* ]]; then
      COTURN_CONFIG_PATH_ABS="${REPOSITORY_ROOT}/${COTURN_CONFIG_PATH_ABS#./}"
    fi
    mkdir -p -- "$(dirname "$COTURN_CONFIG_PATH_ABS")"
    python3 "${REPOSITORY_ROOT}/scripts/livekit/render-config.py" \
      --output "$LIVEKIT_CONFIG_PATH_ABS" \
      --coturn-output "$COTURN_CONFIG_PATH_ABS" >/dev/null
  else
    python3 "${REPOSITORY_ROOT}/scripts/livekit/render-config.py" \
      --output "$LIVEKIT_CONFIG_PATH_ABS" >/dev/null
  fi
fi

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
  VLLM_API_KEY
  VLLM_BASE_URL
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
  printf 'OBJECT_STORAGE_REGION=%s\n' "$OBJECT_STORAGE_REGION"
  printf 'OBJECT_STORAGE_AUTO_CREATE_BUCKETS=%s\n' "$OBJECT_STORAGE_AUTO_CREATE_BUCKETS"
  printf 'OBJECT_STORAGE_OBJECT_TAGGING_ENABLED=%s\n' "$OBJECT_STORAGE_OBJECT_TAGGING_ENABLED"
  printf 'HOST_PROJECT_ROOT=%s\n' "$REPOSITORY_ROOT"
  printf 'DOCKER_GID=%s\n' "$DOCKER_GID"
  printf 'DOCKER_SOCKET_UID=%s\n' "$DOCKER_SOCKET_UID"
  printf 'LIVE_MONITORING_ENABLED=%s\n' "$LIVE_MONITORING_ENABLED"
  if is_truthy "$LIVE_MONITORING_ENABLED"; then
    printf 'LIVE_MONITORING_PROVIDER=livekit\n'
    printf 'LIVEKIT_ENVIRONMENT=%s\n' "$LIVEKIT_ENVIRONMENT"
    printf 'LIVEKIT_PUBLIC_URL=%s\n' "$LIVEKIT_PUBLIC_URL"
    printf 'LIVEKIT_INTERNAL_URL=%s\n' "$LIVEKIT_INTERNAL_URL"
    printf 'LIVEKIT_API_KEY=%s\n' "$LIVEKIT_API_KEY"
    printf 'LIVEKIT_API_SECRET=%s\n' "$LIVEKIT_API_SECRET"
    printf 'LIVEKIT_NODE_IP=%s\n' "$LIVEKIT_NODE_IP"
    printf 'LIVEKIT_STUN_HOST=%s\n' "$LIVEKIT_STUN_HOST"
    printf 'LIVEKIT_ADVERTISE_INTERNAL_IP=%s\n' "$LIVEKIT_ADVERTISE_INTERNAL_IP"
    printf 'LIVEKIT_IMAGE=%s\n' "$LIVEKIT_IMAGE"
    printf 'LIVEKIT_CONFIG_FILE=%s\n' "$LIVEKIT_CONFIG_FILE"
    printf 'LIVEKIT_TURN_ENABLED=%s\n' "$LIVEKIT_TURN_ENABLED"
    if is_truthy "$LIVEKIT_TURN_ENABLED"; then
      printf 'LIVEKIT_TURN_HOST=%s\n' "$LIVEKIT_TURN_HOST"
      printf 'LIVEKIT_TURN_PORT=%s\n' "$LIVEKIT_TURN_PORT"
      printf 'LIVEKIT_TURN_PROTOCOLS=%s\n' "$LIVEKIT_TURN_PROTOCOLS"
      printf 'LIVEKIT_TURN_SECRET=%s\n' "$LIVEKIT_TURN_SECRET"
      printf 'LIVEKIT_TURN_TTL_SECONDS=%s\n' "$LIVEKIT_TURN_TTL_SECONDS"
      printf 'LIVEKIT_TURN_REALM=%s\n' "$LIVEKIT_TURN_REALM"
      printf 'LIVEKIT_TURN_RELAY_PORT_START=%s\n' "$LIVEKIT_TURN_RELAY_PORT_START"
      printf 'LIVEKIT_TURN_RELAY_PORT_END=%s\n' "$LIVEKIT_TURN_RELAY_PORT_END"
      printf 'COTURN_CONFIG_FILE=%s\n' "$COTURN_CONFIG_FILE"
      printf 'COTURN_UID=%s\n' "$COTURN_UID"
      printf 'COTURN_GID=%s\n' "$COTURN_GID"
    fi
  fi
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
