#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
CONTEST_ID=""
CONFIRMED=0

usage() {
  cat <<'EOF'
Dev-only anti-cheat cleanup (DB + object storage objects).

Usage:
  scripts/dev/cleanup-anticheat-dev.sh --yes [--contest-id <id>]

Options:
  --yes               Required safety flag to execute deletion.
  --contest-id <id>   Optional. Only clean one contest's evidence data.

Environment:
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

compose=("$ROOT_DIR/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh" dev)

if ! "${compose[@]}" ps --services >/dev/null 2>&1; then
  echo "[error] Unable to read compose services. Is Docker running?" >&2
  exit 1
fi

if ! "${compose[@]}" ps --services --status running | grep -qx "$BACKEND_SERVICE"; then
  echo "[error] Backend service '$BACKEND_SERVICE' is not running in the dev stack" >&2
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
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

env = (getattr(settings, "DJANGO_ENV", "") or "").strip().lower()
if env in {"production", "prod"}:
    raise SystemExit(f"Refusing to run in DJANGO_ENV={env}")

contest_id_raw = (os.getenv("CLEANUP_CONTEST_ID", "") or "").strip()
contest_id = int(contest_id_raw) if contest_id_raw else None

print("[db] skipped: legacy exam evidence video/job tables have been dropped")

endpoint = (getattr(settings, "OBJECT_STORAGE_ENDPOINT_URL", "") or "").strip()
access_key = (getattr(settings, "OBJECT_STORAGE_ACCESS_KEY", "") or "").strip()
secret_key = (getattr(settings, "OBJECT_STORAGE_SECRET_KEY", "") or "").strip()
region = (getattr(settings, "OBJECT_STORAGE_REGION", "us-east-1") or "us-east-1").strip()
bucket = (getattr(settings, "OBJECT_STORAGE_BUCKET", "") or "").strip()

if not endpoint or not access_key or not secret_key or not bucket:
    print("[object-storage] skipped: missing OBJECT_STORAGE_* settings in env")
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
                print(f"[object-storage] bucket not found, skip: {bucket}")
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

# The bucket also holds markdown images and AI artifacts; delete only evidence.
if contest_id is not None:
    from apps.contests.models import ExamIntegrityRun

    run_ids = ExamIntegrityRun.objects.filter(contest_id=contest_id).values_list("id", flat=True)
    # Integrity archives are keyed by run, not contest.
    prefixes = [f"contest_{contest_id}/", f"integrity/{contest_id}/", *(f"runs/{run_id}/" for run_id in run_ids)]
else:
    prefixes = ["contest_", "integrity/", "runs/"]
for prefix in prefixes:
    deleted = purge_bucket(bucket, prefix=prefix)
    print(f"[object-storage] deleted_objects={deleted} bucket={bucket} prefix={prefix}")
PY

echo "[done] Anti-cheat cleanup completed."
