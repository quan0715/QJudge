#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QJUDGE_DC="$PROJECT_ROOT/.codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh"

usage() {
  cat <<'USAGE' >&2
Usage:
  scripts/r2/migrate-dev-minio-to-r2.sh [--dry-run|--apply] [--prefix PREFIX] [--only raw|markdown|artifacts]

Copies local dev MinIO objects into the currently configured dev R2 buckets.
This script never deletes source or target objects.

Defaults:
  mode: dry-run
  source endpoint: http://minio:9000
  source buckets: anticheat-raw, markdown-images, ai-artifacts
  target buckets: current Django settings / .env values

Examples:
  scripts/r2/migrate-dev-minio-to-r2.sh --dry-run
  scripts/r2/migrate-dev-minio-to-r2.sh --apply
  scripts/r2/migrate-dev-minio-to-r2.sh --apply --only raw --prefix contest_1/
USAGE
}

MODE="dry-run"
PREFIX=""
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --apply)
      MODE="apply"
      shift
      ;;
    --prefix)
      PREFIX="${2:-}"
      if [[ -z "$PREFIX" ]]; then
        echo "--prefix requires a value" >&2
        exit 2
      fi
      shift 2
      ;;
    --only)
      ONLY="${2:-}"
      case "$ONLY" in
        raw|markdown|artifacts) ;;
        *)
          echo "--only must be one of: raw, markdown, artifacts" >&2
          exit 2
          ;;
      esac
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ ! -x "$QJUDGE_DC" ]]; then
  echo "qjudge compose wrapper not found or not executable: $QJUDGE_DC" >&2
  exit 1
fi

"$QJUDGE_DC" dev exec -T \
  -e R2_MIGRATION_MODE="$MODE" \
  -e R2_MIGRATION_PREFIX="$PREFIX" \
  -e R2_MIGRATION_ONLY="$ONLY" \
  backend python - <<'PY'
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.exceptions import ClientError

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django

django.setup()

from django.conf import settings


@dataclass(frozen=True)
class BucketPair:
    label: str
    source_bucket: str
    target_bucket: str


MODE = os.environ.get("R2_MIGRATION_MODE", "dry-run")
PREFIX = os.environ.get("R2_MIGRATION_PREFIX", "")
ONLY = os.environ.get("R2_MIGRATION_ONLY", "")

SOURCE_ENDPOINT = os.environ.get("MINIO_MIGRATION_SOURCE_ENDPOINT", "http://minio:9000")
SOURCE_ACCESS_KEY = os.environ.get("MINIO_ROOT_USER", "minioadmin")
SOURCE_SECRET_KEY = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")
SOURCE_REGION = os.environ.get("MINIO_MIGRATION_SOURCE_REGION", "us-east-1")

SOURCE_RAW_BUCKET = os.environ.get("MINIO_MIGRATION_SOURCE_RAW_BUCKET", "anticheat-raw")
SOURCE_MARKDOWN_BUCKET = os.environ.get("MINIO_MIGRATION_SOURCE_MARKDOWN_BUCKET", "markdown-images")
SOURCE_ARTIFACT_BUCKET = os.environ.get("MINIO_MIGRATION_SOURCE_ARTIFACT_BUCKET", "ai-artifacts")

if MODE not in {"dry-run", "apply"}:
    raise SystemExit(f"unsupported mode: {MODE}")


def make_client(*, endpoint_url: str, access_key: str, secret_key: str, region: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
    )


source = make_client(
    endpoint_url=SOURCE_ENDPOINT,
    access_key=SOURCE_ACCESS_KEY,
    secret_key=SOURCE_SECRET_KEY,
    region=SOURCE_REGION,
)
target = make_client(
    endpoint_url=settings.OBJECT_STORAGE_ENDPOINT_URL,
    access_key=settings.OBJECT_STORAGE_ACCESS_KEY,
    secret_key=settings.OBJECT_STORAGE_SECRET_KEY,
    region=settings.OBJECT_STORAGE_REGION,
)

pairs = [
    BucketPair("raw", SOURCE_RAW_BUCKET, settings.ANTICHEAT_RAW_BUCKET),
    BucketPair("markdown", SOURCE_MARKDOWN_BUCKET, settings.MARKDOWN_IMAGE_S3_BUCKET),
    BucketPair("artifacts", SOURCE_ARTIFACT_BUCKET, settings.AI_ARTIFACT_S3_BUCKET),
]
if ONLY:
    pairs = [pair for pair in pairs if pair.label == ONLY]


def object_exists(client: Any, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def iter_objects(client: Any, bucket: str, prefix: str):
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item.get("Key")
            if key:
                yield item


def copy_object(pair: BucketPair, item: dict[str, Any]) -> str:
    key = item["Key"]
    if object_exists(target, pair.target_bucket, key):
        return "skipped-existing"
    if MODE == "dry-run":
        return "would-copy"

    response = source.get_object(Bucket=pair.source_bucket, Key=key)
    body = response["Body"]
    try:
        payload = body.read()
        put_kwargs: dict[str, Any] = {
            "Bucket": pair.target_bucket,
            "Key": key,
            "Body": payload,
        }
        content_type = response.get("ContentType")
        if content_type:
            put_kwargs["ContentType"] = content_type
        metadata = response.get("Metadata")
        if metadata:
            put_kwargs["Metadata"] = metadata
        cache_control = response.get("CacheControl")
        if cache_control:
            put_kwargs["CacheControl"] = cache_control
        target.put_object(**put_kwargs)
    finally:
        body.close()
    return "copied"


print(f"mode={MODE}")
print(f"prefix={PREFIX or '(all)'}")
print(f"target_endpoint_is_r2={'.r2.cloudflarestorage.com' in settings.OBJECT_STORAGE_ENDPOINT_URL}")

total = {"seen": 0, "would-copy": 0, "copied": 0, "skipped-existing": 0, "errors": 0}
for pair in pairs:
    print(f"bucket_pair={pair.label} source={pair.source_bucket} target={pair.target_bucket}")
    stats = {"seen": 0, "would-copy": 0, "copied": 0, "skipped-existing": 0, "errors": 0}
    for item in iter_objects(source, pair.source_bucket, PREFIX):
        stats["seen"] += 1
        total["seen"] += 1
        key = item["Key"]
        try:
            outcome = copy_object(pair, item)
            stats[outcome] += 1
            total[outcome] += 1
        except Exception as exc:  # pragma: no cover - operational script
            stats["errors"] += 1
            total["errors"] += 1
            print(f"error bucket={pair.label} key={key} type={type(exc).__name__} message={exc}")
    print(
        "bucket_summary "
        f"{pair.label} seen={stats['seen']} would_copy={stats['would-copy']} "
        f"copied={stats['copied']} skipped_existing={stats['skipped-existing']} errors={stats['errors']}"
    )

print(
    "total_summary "
    f"seen={total['seen']} would_copy={total['would-copy']} copied={total['copied']} "
    f"skipped_existing={total['skipped-existing']} errors={total['errors']}"
)

if total["errors"]:
    raise SystemExit(1)
PY
