#!/bin/sh
set -eu

config=/etc/nginx/qjudge-addons.conf
upgrade=/etc/nginx/conf.d/15-qjudge-livekit-upgrade.conf
: > "$config"
: > "$upgrade"

if [ "${STORAGE_MODE:-}" = bundled ]; then
  bucket="${OBJECT_STORAGE_BUCKET:-}"
  case "$bucket" in
    ''|*[!a-z0-9.-]*|[!a-z0-9]*|*[!a-z0-9]|*..*|*.-*|*-.*)
      echo 'OBJECT_STORAGE_BUCKET must be a valid S3 bucket name' >&2; exit 1 ;;
    api|admin|django-admin|static|media|mcp|assets|livekit|docs|dev|system|dashboard|classrooms|question-banks|chat|login|register|auth|onboarding|invite|oauth|error|not-found|brand|fonts|illustrations|logos|videos|index.html|robots.txt|manifest.json|sitemap.xml|pwa-192x192.png|pwa-512x512.png|example-1.png|example-2.png)
      echo 'OBJECT_STORAGE_BUCKET conflicts with a QJudge route; use qjudge' >&2; exit 1 ;;
  esac
  [ "${#bucket}" -ge 3 ] && [ "${#bucket}" -le 63 ] || {
    echo 'OBJECT_STORAGE_BUCKET must be 3-63 characters' >&2; exit 1
  }

  # S3 signatures cover the original bucket path, query and Host (including port).
  for location in "= /$bucket" "^~ /$bucket/"; do
    cat >> "$config" <<EOF
    location $location {
        set \$qjudge_storage http://minio:9000;
        proxy_pass \$qjudge_storage;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header Connection "";
        proxy_set_header Cookie "";
        client_max_body_size 0;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Serve uploaded HTML/scripts as downloads on the application origin.
        proxy_hide_header Content-Type;
        proxy_hide_header Content-Disposition;
        proxy_hide_header X-Content-Type-Options;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Cache-Control;
        add_header Content-Type application/octet-stream always;
        add_header Content-Disposition attachment always;
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "private, no-store" always;
    }
EOF
  done
fi

if [ "${MEDIA_MODE:-}" = bundled ]; then
  cat > "$upgrade" <<'EOF'
map $http_upgrade $qjudge_upgrade_connection {
    default upgrade;
    ""      "";
}
EOF
  cat >> "$config" <<'EOF'
    location ~ ^/livekit(/|$) {
        set $qjudge_livekit http://livekit:7880;
        rewrite ^/livekit/?(.*)$ /$1 break;
        proxy_pass $qjudge_livekit;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $qjudge_forwarded_proto;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $qjudge_upgrade_connection;
        proxy_set_header Cookie "";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
EOF
fi
