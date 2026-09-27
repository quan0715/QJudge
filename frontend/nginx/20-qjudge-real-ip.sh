#!/bin/sh
# Trust X-Forwarded-For only from QJUDGE_TRUSTED_PROXIES (comma-separated IPs or
# CIDRs). Unset trusts every peer, which is safe only while the frontend port is
# bound to 127.0.0.1 or reachable only through a local tunnel.
set -eu

proxies="${QJUDGE_TRUSTED_PROXIES:-}"
{
  echo "real_ip_header X-Forwarded-For;"
  if [ -n "$proxies" ]; then
    # Trusted proxies are configured: walk back through any of them to find
    # the real client.
    echo "real_ip_recursive on;"
  else
    # Trust-all mode: take only the last X-Forwarded-For entry (the one the
    # immediate proxy appended), since earlier entries are client-supplied.
    echo "real_ip_recursive off;"
    proxies="0.0.0.0/0,::/0"
  fi
  echo "$proxies" | tr ',' '\n' | while read -r proxy; do
    if [ -n "$proxy" ]; then
      echo "set_real_ip_from $proxy;"
    fi
  done
} > /etc/nginx/conf.d/10-real-ip.conf
