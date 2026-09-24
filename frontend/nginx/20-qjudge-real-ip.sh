#!/bin/sh
# Trust X-Forwarded-For only from QJUDGE_TRUSTED_PROXIES (comma-separated IPs or
# CIDRs). Unset trusts every peer, which is safe only while the gateway port is
# bound to 127.0.0.1 or reachable only through a local tunnel.
set -eu

proxies="${QJUDGE_TRUSTED_PROXIES:-0.0.0.0/0,::/0}"
{
  echo "real_ip_header X-Forwarded-For;"
  echo "real_ip_recursive on;"
  echo "$proxies" | tr ',' '\n' | while read -r proxy; do
    if [ -n "$proxy" ]; then
      echo "set_real_ip_from $proxy;"
    fi
  done
} > /etc/nginx/conf.d/10-real-ip.conf
