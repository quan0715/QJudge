#!/bin/sh
set -eu

MINIO_ALIAS_NAME="local"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
RAW_BUCKET="${ANTICHEAT_RAW_BUCKET:-anticheat-raw}"
VIDEO_BUCKET="${ANTICHEAT_VIDEO_BUCKET:-anticheat-videos}"
CORS_ALLOWED_ORIGINS="${ANTICHEAT_CORS_ALLOWED_ORIGINS:-http://localhost:5173}"

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

until mc alias set "$MINIO_ALIAS_NAME" "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "Waiting for MinIO to be ready..."
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
