#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

load_env_file "$ENV_FILE"

MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
ANTICHEAT_RAW_BUCKET="${ANTICHEAT_RAW_BUCKET:-anticheat-raw}"
ANTICHEAT_VIDEO_BUCKET="${ANTICHEAT_VIDEO_BUCKET:-anticheat-videos}"

log() {
  printf '[smoke] %s\n' "$1"
}

dc() {
  docker compose -f "$PROJECT_ROOT/$COMPOSE_FILE" "$@"
}

assert_running() {
  local service="$1"
  local state
  state="$(dc ps --format json "$service" | python3 -c 'import json,sys; data=[json.loads(l) for l in sys.stdin if l.strip()]; print(data[0].get("State","") if data else "")')"
  if [[ "$state" != "running" ]]; then
    log "service '$service' is not running (state=$state)"
    exit 1
  fi
}

log "Running MinIO init script"
ENV_FILE="$ENV_FILE" "$PROJECT_ROOT/scripts/minio/run-init.sh" "$COMPOSE_FILE"

log "Checking required services"
for svc in backend minio celery-video; do
  assert_running "$svc"
done

log "Checking ffmpeg in backend image"
dc exec -T backend ffmpeg -version >/dev/null

minio_cid="$(dc ps -q minio)"
if [[ -z "$minio_cid" ]]; then
  log "unable to resolve minio container id"
  exit 1
fi

network_name="$(docker inspect "$minio_cid" --format '{{range $k, $_ := .NetworkSettings.Networks}}{{println $k}}{{end}}' | head -n1)"
if [[ -z "$network_name" ]]; then
  log "unable to resolve minio docker network"
  exit 1
fi

buckets_output="$(mktemp)"
lifecycle_output="$(mktemp)"
trap 'rm -f "$buckets_output" "$lifecycle_output"' EXIT

log "Checking MinIO buckets"
docker run --rm --network "$network_name" \
  --entrypoint /bin/sh \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  minio/mc -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ls local' >"$buckets_output"

grep -q "${ANTICHEAT_RAW_BUCKET}/" "$buckets_output"
grep -q "${ANTICHEAT_VIDEO_BUCKET}/" "$buckets_output"

log "Checking MinIO lifecycle policies"
docker run --rm --network "$network_name" \
  --entrypoint /bin/sh \
  -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
  -e ANTICHEAT_RAW_BUCKET="$ANTICHEAT_RAW_BUCKET" \
  minio/mc -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ilm export "local/$ANTICHEAT_RAW_BUCKET"' >"$lifecycle_output"

grep -q '"Days":3' "$lifecycle_output"
grep -q '"cleanup"' "$lifecycle_output"

log "Running Django anti-cheat API smoke scenario"
dc exec -T backend python manage.py shell <<'PY'
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from apps.contests.models import Contest, ContestParticipant

User = get_user_model()
now = timezone.now()
ts = int(now.timestamp())

owner = User.objects.create_user(
    username=f"smoke_owner_{ts}",
    email=f"smoke_owner_{ts}@example.com",
    password="SmokePass123!",
)
student = User.objects.create_user(
    username=f"smoke_student_{ts}",
    email=f"smoke_student_{ts}@example.com",
    password="SmokePass123!",
)

contest = Contest.objects.create(
    name=f"smoke-anticheat-{ts}",
    description="smoke",
    rules="smoke",
    owner=owner,
    status="published",
    visibility="public",
    contest_type="paper_exam",
    cheat_detection_enabled=True,
    allow_multiple_joins=True,
    start_time=now - timedelta(minutes=5),
    end_time=now + timedelta(hours=2),
)
ContestParticipant.objects.create(
    contest=contest,
    user=student,
    nickname=student.username,
)

client = APIClient()
client.force_authenticate(user=student)
headers = {
    "HTTP_X_DEVICE_ID": f"smoke-device-{ts}",
    "HTTP_HOST": "localhost",
}

start = client.post(f"/api/v1/contests/{contest.id}/exam/start/", {}, format="json", **headers)
assert start.status_code == 200, start.content
start_data = start.json()
assert start_data.get("exam_status") == "in_progress", start_data

urls = client.get(f"/api/v1/contests/{contest.id}/exam/anticheat-urls/?count=3", **headers)
assert urls.status_code == 200, urls.content
urls_data = urls.json()
assert urls_data.get("upload_session_id"), urls_data
assert len(urls_data.get("items", [])) == 3, urls_data

end = client.post(
    f"/api/v1/contests/{contest.id}/exam/end/",
    {"upload_session_id": urls_data["upload_session_id"]},
    format="json",
    **headers,
)
assert end.status_code == 200, end.content
end_data = end.json()
assert end_data.get("exam_status") == "submitted", end_data

print("SMOKE_OK", contest.id, urls_data["upload_session_id"])
PY

log "Smoke checks passed"
