#!/bin/sh
set -eu

MINIO_ALIAS_NAME="local"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
RAW_BUCKET="${ANTICHEAT_RAW_BUCKET:-anticheat-raw}"
VIDEO_BUCKET="${ANTICHEAT_VIDEO_BUCKET:-anticheat-videos}"
CORS_ALLOWED_ORIGINS="${ANTICHEAT_CORS_ALLOWED_ORIGINS:-http://localhost:5173}"
MINIO_INIT_MAX_ATTEMPTS="${MINIO_INIT_MAX_ATTEMPTS:-120}"

build_mc_host() {
  endpoint="${MINIO_ENDPOINT%/}"
  scheme="http"
  case "$endpoint" in
    https://*) scheme="https" ;;
    http://*) scheme="http" ;;
    *) endpoint="http://$endpoint" ;;
  esac
  endpoint_no_scheme="${endpoint#http://}"
  endpoint_no_scheme="${endpoint_no_scheme#https://}"
  echo "${scheme}://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@${endpoint_no_scheme}"
}

build_cors_xml() {
  cors_file="$1"
  {
    echo "<CORSConfiguration>"
    echo "  <CORSRule>"
    IFS=','
    for origin in $CORS_ALLOWED_ORIGINS; do
      [ -n "$origin" ] && echo "    <AllowedOrigin>$origin</AllowedOrigin>"
    done
    unset IFS
    echo "    <AllowedMethod>GET</AllowedMethod>"
    echo "    <AllowedMethod>PUT</AllowedMethod>"
    echo "    <AllowedMethod>HEAD</AllowedMethod>"
    echo "    <AllowedHeader>*</AllowedHeader>"
    echo "    <ExposeHeader>ETag</ExposeHeader>"
    echo "    <ExposeHeader>x-amz-request-id</ExposeHeader>"
    echo "    <ExposeHeader>x-amz-id-2</ExposeHeader>"
    echo "    <MaxAgeSeconds>3000</MaxAgeSeconds>"
    echo "  </CORSRule>"
    echo "</CORSConfiguration>"
  } > "$cors_file"
}

MC_HOST_ENV_KEY="MC_HOST_${MINIO_ALIAS_NAME}"
MC_HOST_VALUE="$(build_mc_host)"
export "${MC_HOST_ENV_KEY}=${MC_HOST_VALUE}"

attempt=1
until mc ls "$MINIO_ALIAS_NAME" >/dev/null 2>&1; do
  if [ "$attempt" -ge "$MINIO_INIT_MAX_ATTEMPTS" ]; then
    echo "MinIO is not reachable after ${MINIO_INIT_MAX_ATTEMPTS} attempts." >&2
    echo "endpoint=${MINIO_ENDPOINT}" >&2
    exit 1
  fi
  echo "Waiting for MinIO to be ready... (${attempt}/${MINIO_INIT_MAX_ATTEMPTS})"
  attempt=$((attempt + 1))
  sleep 2
done

mc mb -p "$MINIO_ALIAS_NAME/$RAW_BUCKET" >/dev/null 2>&1 || true
mc mb -p "$MINIO_ALIAS_NAME/$VIDEO_BUCKET" >/dev/null 2>&1 || true

tmp_cors_file="/tmp/minio-cors.xml"
build_cors_xml "$tmp_cors_file"

if ! mc cors set "$MINIO_ALIAS_NAME/$RAW_BUCKET" "$tmp_cors_file" >/dev/null 2>&1; then
  echo "Bucket-level CORS unsupported; relying on global MinIO CORS config."
fi
if ! mc cors set "$MINIO_ALIAS_NAME/$VIDEO_BUCKET" "$tmp_cors_file" >/dev/null 2>&1; then
  echo "Bucket-level CORS unsupported; relying on global MinIO CORS config."
fi

mc ilm import "$MINIO_ALIAS_NAME/$RAW_BUCKET" < /config/lifecycle-raw.json
mc ilm import "$MINIO_ALIAS_NAME/$VIDEO_BUCKET" < /config/lifecycle-videos.json

echo "MinIO anti-cheat buckets initialized."
