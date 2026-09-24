"""Describe the entry points a deployment needs outside QJudge."""

from __future__ import annotations

from urllib.parse import urlsplit

from .schema import Env

MINIO_PORT = 9000


def _bind_address(env: Env) -> str:
    return env.get("FRONTEND_BIND_ADDRESS", "").strip() or "127.0.0.1"


def _frontend(env: Env) -> str:
    port = env.get("FRONTEND_PORT", "").strip() or "8080"
    return f"http://{_bind_address(env)}:{port}"


def _bundled_storage(env: Env) -> str:
    """Public storage URL when QJudge runs MinIO itself, else ''."""
    if env.get("STORAGE_MODE", "").strip() != "bundled":
        return ""
    return env.get("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "").strip().rstrip("/")


def _bundled_media(env: Env) -> str:
    """Public LiveKit URL when QJudge runs its media addon, else ''."""
    if env.get("MEDIA_MODE", "").strip() != "bundled":
        return ""
    return env.get("LIVEKIT_PUBLIC_URL", "").strip().rstrip("/")


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
    # Tunnel routes match by hostname; a port here would never match.
    routes = [(origin_parts.hostname, "http://frontend:80")]
    storage = _bundled_storage(env)
    if storage:
        lines += [
            "",
            f"Storage  {storage}",
            f"  Reverse proxy -> http://{_bind_address(env)}:{MINIO_PORT} "
            "(MinIO; pass Host unchanged, no body size limit, buffering off)",
        ]
        routes.append((urlsplit(storage).hostname, f"http://minio:{MINIO_PORT}"))
    media = _bundled_media(env)
    if media:
        media_host = urlsplit(media).hostname
        turn_host = env.get("LIVEKIT_TURN_HOST", "").strip()
        lines += [
            "",
            f"LiveKit  {media}",
            f"  Reverse proxy -> http://{_bind_address(env)}:7880 (LiveKit HTTP/WebSocket signaling)",
            "  Open TCP 7881 and UDP 50000-50099 directly to LiveKit.",
            "  Open TURN UDP/TCP 3478 and relay UDP 50300-50399 directly to coturn.",
            f"  TURN/TLS: public TCP 443 for {turn_host} -> existing HAProxy SNI -> 127.0.0.1:5349",
            "  Coturn TLS 5349 remains host-loopback only, private to HAProxy.",
        ]
        if media_host:
            routes.append((media_host, "http://livekit:7880"))
    profiles = [item.strip() for item in env.get("COMPOSE_PROFILES", "").split(",")]
    if "tunnel" in profiles:
        lines += ["", "Cloudflare Tunnel"]
        lines += [f"  route {name} -> {target}" for name, target in routes]
    lines += ["", "Run `deploy/qjudge ingress --nginx` for reverse proxy server blocks."]
    return "\n".join(lines) + "\n"


def _server_block(host: str, upstream: str, extra: str = "", websocket: bool = False) -> str:
    websocket_headers = (
        "        proxy_set_header Upgrade $http_upgrade;\n"
        '        proxy_set_header Connection "upgrade";'
        if websocket
        else '        proxy_set_header Connection "";'
    )
    return f"""server {{
    listen 443 ssl;
    server_name {host};
    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;
{extra}
    location / {{
        proxy_pass {upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
{websocket_headers}
        proxy_buffering off;
        proxy_read_timeout 300s;
    }}
}}
"""


def render_nginx(env: Env) -> str:
    host = urlsplit(env.get("QJUDGE_PUBLIC_ORIGIN", "")).hostname or "_"
    blocks = [_server_block(host, _frontend(env))]
    storage = _bundled_storage(env)
    if storage:
        blocks.append(
            _server_block(
                urlsplit(storage).hostname or "_",
                f"http://{_bind_address(env)}:{MINIO_PORT}",
                "    client_max_body_size 0;\n",
            )
        )
    media = _bundled_media(env)
    if media:
        blocks.append(
            _server_block(
                urlsplit(media).hostname or "_",
                f"http://{_bind_address(env)}:7880",
                websocket=True,
            )
        )
    return "\n".join(blocks)
