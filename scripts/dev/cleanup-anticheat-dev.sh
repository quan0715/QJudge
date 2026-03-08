#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
CONTEST_ID=""
CONFIRMED=0

usage() {
  cat <<'EOF'
Dev-only anti-cheat cleanup (DB + MinIO objects).

Usage:
  scripts/dev/cleanup-anticheat-dev.sh --yes [--contest-id <id>]

Options:
  --yes               Required safety flag to execute deletion.
  --contest-id <id>   Optional. Only clean one contest's evidence data.

Environment:
  COMPOSE_FILE        docker compose file path (default: docker-compose.dev.yml)
  BACKEND_SERVICE     compose backend service name (default: backend)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      CONFIRMED=1
      shift
      ;;
    --contest-id)
      if [[ $# -lt 2 ]]; then
        echo "[error] --contest-id requires a value" >&2
        exit 1
      fi
      CONTEST_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[error] Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$CONFIRMED" -ne 1 ]]; then
  echo "[error] Missing required flag: --yes" >&2
  usage
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[error] Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

compose=(docker compose -f "$COMPOSE_FILE")

if ! "${compose[@]}" ps --services >/dev/null 2>&1; then
  echo "[error] Unable to read compose services. Is Docker running?" >&2
  exit 1
fi

if ! "${compose[@]}" ps --services --status running | grep -qx "$BACKEND_SERVICE"; then
  echo "[error] Backend service '$BACKEND_SERVICE' is not running in $COMPOSE_FILE" >&2
  exit 1
fi

DJANGO_ENV="$("${compose[@]}" exec -T "$BACKEND_SERVICE" bash -lc "cd /app && python manage.py shell -c \"from django.conf import settings; print((getattr(settings, 'DJANGO_ENV', '') or '').strip().lower())\"")"

case "$DJANGO_ENV" in
  production|prod)
    echo "[error] Refusing to run cleanup in DJANGO_ENV=$DJANGO_ENV" >&2
    exit 1
    ;;
  *)
    ;;
esac

echo "[info] Running anti-cheat cleanup in DJANGO_ENV='${DJANGO_ENV:-unknown}'"
if [[ -n "$CONTEST_ID" ]]; then
  echo "[info] Scope: contest_id=$CONTEST_ID"
else
  echo "[info] Scope: all contests"
fi

export CLEANUP_CONTEST_ID="$CONTEST_ID"

"${compose[@]}" exec -T -e CLEANUP_CONTEST_ID "$BACKEND_SERVICE" bash -lc "cd /app && python manage.py shell" <<'PY'
import os
from django.conf import settings
from django.db import transaction

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from apps.contests.models import ExamEvidenceJob, ExamEvidenceVideo

env = (getattr(settings, "DJANGO_ENV", "") or "").strip().lower()
if env in {"production", "prod"}:
    raise SystemExit(f"Refusing to run in DJANGO_ENV={env}")

contest_id_raw = (os.getenv("CLEANUP_CONTEST_ID", "") or "").strip()
contest_id = int(contest_id_raw) if contest_id_raw else None

jobs_qs = ExamEvidenceJob.objects.all()
videos_qs = ExamEvidenceVideo.objects.all()
if contest_id is not None:
    jobs_qs = jobs_qs.filter(contest_id=contest_id)
    videos_qs = videos_qs.filter(contest_id=contest_id)

jobs_before = jobs_qs.count()
videos_before = videos_qs.count()

with transaction.atomic():
    deleted_videos, _ = videos_qs.delete()
    deleted_jobs, _ = jobs_qs.delete()

print(f"[db] deleted_exam_evidence_videos={deleted_videos}")
print(f"[db] deleted_exam_evidence_jobs={deleted_jobs}")
print(f"[db] before_videos={videos_before} before_jobs={jobs_before}")

endpoint = (getattr(settings, "ANTICHEAT_S3_ENDPOINT_URL", "") or "").strip()
access_key = (getattr(settings, "ANTICHEAT_S3_ACCESS_KEY", "") or "").strip()
secret_key = (getattr(settings, "ANTICHEAT_S3_SECRET_KEY", "") or "").strip()
region = (getattr(settings, "ANTICHEAT_S3_REGION", "us-east-1") or "us-east-1").strip()
raw_bucket = (getattr(settings, "ANTICHEAT_RAW_BUCKET", "anticheat-raw") or "anticheat-raw").strip()
video_bucket = (getattr(settings, "ANTICHEAT_VIDEO_BUCKET", "anticheat-videos") or "anticheat-videos").strip()

if not endpoint or not access_key or not secret_key:
    print("[minio] skipped: missing ANTICHEAT_S3_* credentials/endpoint in env")
    raise SystemExit(0)

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key,
    region_name=region,
    config=Config(signature_version="s3v4"),
)

def purge_bucket(bucket: str, prefix: str = "") -> int:
    total_deleted = 0
    token = None
    while True:
        req = {"Bucket": bucket, "MaxKeys": 1000}
        if prefix:
            req["Prefix"] = prefix
        if token:
            req["ContinuationToken"] = token

        try:
            resp = s3.list_objects_v2(**req)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "Unknown")
            if code in {"NoSuchBucket", "404"}:
                print(f"[minio] bucket not found, skip: {bucket}")
                return 0
            raise

        objects = resp.get("Contents", [])
        if objects:
            keys = [{"Key": item["Key"]} for item in objects]
            for idx in range(0, len(keys), 1000):
                chunk = keys[idx : idx + 1000]
                s3.delete_objects(Bucket=bucket, Delete={"Objects": chunk, "Quiet": True})
                total_deleted += len(chunk)

        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")

    return total_deleted

prefix = f"contest_{contest_id}/" if contest_id is not None else ""
raw_deleted = purge_bucket(raw_bucket, prefix=prefix)
video_deleted = purge_bucket(video_bucket, prefix=prefix)
print(f"[minio] deleted_raw_objects={raw_deleted} bucket={raw_bucket} prefix={prefix or '(all)'}")
print(f"[minio] deleted_video_objects={video_deleted} bucket={video_bucket} prefix={prefix or '(all)'}")
PY

echo "[done] Anti-cheat cleanup completed."
