"""Describe the entry points a deployment needs outside QJudge."""

from __future__ import annotations

from urllib.parse import urlsplit

from .schema import Env


def _frontend(env: Env) -> str:
    address = env.get("FRONTEND_BIND_ADDRESS", "").strip() or "127.0.0.1"
    port = env.get("FRONTEND_PORT", "").strip() or "8080"
    return f"http://{address}:{port}"


def render_ingress(env: Env) -> str:
    origin = env.get("QJUDGE_PUBLIC_ORIGIN", "").rstrip("/")
    origin_parts = urlsplit(origin)
    host = origin_parts.netloc
    frontend = _frontend(env)
    proxies = env.get("QJUDGE_TRUSTED_PROXIES", "").strip()
    lines = [
        f"Main site  {origin}",
        f"  Reverse proxy -> {frontend} (frontend; serves the site, /api, /o, /.well-known and /mcp)",
        "  The proxy must set Host, X-Forwarded-For and X-Forwarded-Proto, and disable buffering.",
    ]
    if proxies:
        lines.append(f"  Frontend trusts forwarded headers only from: {proxies}")
    lines += [
        "  Check from the proxy host:",
        f"    curl -H 'Host: {host}' {frontend}/api/health/",
        f"  Remote MCP clients connect to {origin}/mcp",
    ]
    profiles = [item.strip() for item in env.get("COMPOSE_PROFILES", "").split(",")]
    if "tunnel" in profiles:
        # Tunnel routes match by hostname; a port here would never match.
        lines += ["", f"Cloudflare Tunnel  route {origin_parts.hostname} -> http://frontend:80"]
    lines += ["", "Run `deploy/qjudge ingress --nginx` for a reverse proxy server block."]
    return "\n".join(lines) + "\n"


def render_nginx(env: Env) -> str:
    host = urlsplit(env.get("QJUDGE_PUBLIC_ORIGIN", "")).hostname or "_"
    frontend = _frontend(env)
    return f"""server {{
    listen 443 ssl;
    server_name {host};
    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;

    location / {{
        proxy_pass {frontend};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
    }}
}}
"""
