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

log "Checking required services"
for svc in backend celery; do
  assert_running "$svc"
done

log "Running Django healthcheck"
dc exec -T backend python manage.py healthcheck --json

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

upload_session_id = f"smoke-session-{ts}"
event = client.post(
    f"/api/v1/contests/{contest.id}/exam/events/",
    {
        "event_type": "capture_upload_degraded",
        "metadata": {
            "phase": "SMOKE",
            "upload_session_id": upload_session_id,
        },
    },
    format="json",
    **headers,
)
assert event.status_code == 200, event.content
event_data = event.json()
event_id = event_data.get("event_id")
assert event_id, event_data

base_ms = int(timezone.now().timestamp() * 1000)
intent = client.post(
    f"/api/v1/contests/{contest.id}/exam/evidence/upload-intents/",
    {
        "event_id": event_id,
        "source_module": "screen_share",
        "evidence_mode": "anchor_window",
        "upload_session_id": upload_session_id,
        "frames": [
            {"client_captured_at_ms": base_ms + seq * 1000, "seq": seq}
            for seq in range(1, 4)
        ],
    },
    format="json",
    **headers,
)
assert intent.status_code == 201, intent.content
intent_data = intent.json()
assert intent_data.get("upload_session_id") == upload_session_id, intent_data
assert len(intent_data.get("items", [])) == 3, intent_data

end = client.post(
    f"/api/v1/contests/{contest.id}/exam/end/",
    {"upload_session_id": upload_session_id},
    format="json",
    **headers,
)
assert end.status_code == 200, end.content
end_data = end.json()
assert end_data.get("exam_status") == "submitted", end_data

print("SMOKE_OK", contest.id, upload_session_id)
PY

log "Smoke checks passed"
