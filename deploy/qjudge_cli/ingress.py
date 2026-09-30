"""Describe the entry points a deployment needs outside QJudge."""

from __future__ import annotations

from urllib.parse import urlsplit

from .media_config import TURN_TCP_PORT
from .schema import Env, uses_public_origin

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
    return (env.get("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "").strip()
            or env.get("QJUDGE_PUBLIC_ORIGIN", "").strip()).rstrip("/")


def _bundled_media(env: Env) -> str:
    """Public LiveKit URL when QJudge runs its media addon, else ''."""
    if env.get("MEDIA_MODE", "").strip() != "bundled":
        return ""
    public = env.get("LIVEKIT_PUBLIC_URL", "").strip().rstrip("/")
    if public:
        return public
    origin = env.get("QJUDGE_PUBLIC_ORIGIN", "").strip().rstrip("/")
    return origin.replace("http", "ws", 1) + "/livekit"


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
        f"    curl -H 'Host: {host}' -H 'X-Forwarded-Proto: {origin_parts.scheme or 'http'}' {frontend}/api/health/",
        f"  Remote MCP clients connect to {origin}/mcp",
    ]
    # Tunnel routes match by hostname; a port here would never match.
    routes = [(origin_parts.hostname, "http://frontend:80")]
    storage = _bundled_storage(env)
    if storage:
        if uses_public_origin(env, storage):
            bucket = env.get("OBJECT_STORAGE_BUCKET", "").strip()
            lines += [
                "", f"Storage  {storage}/{bucket}/",
                "  The frontend forwards this bucket path to MinIO automatically; no extra domain or tunnel route.",
                "  Preserve the original Host (including port) and URI; disable body size limits and request/response buffering.",
            ]
        else:
            lines += [
                "", f"Storage  {storage}",
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
        ]
        if uses_public_origin(env, media):
            lines += [
                "  The frontend forwards /livekit to LiveKit automatically; no extra signaling domain or tunnel route.",
                "  The main site's reverse proxy must forward WebSocket Upgrade and allow long connections (300s idle timeout).",
            ]
        else:
            lines.append(f"  Reverse proxy -> http://{_bind_address(env)}:7880 (LiveKit HTTP/WebSocket signaling)")
            if media_host:
                routes.append((media_host, "http://livekit:7880"))
        lines += [
            f"  Open directly on {env.get('LIVEKIT_NODE_IP', '').strip()}: TCP 7881, UDP 50000-50099, "
            "UDP 3478 and UDP 50300-50399 (media, TURN and TURN relay)",
            "",
            f"TURN  {turn_host}",
            f"  TLS termination on 443 -> tcp {_bind_address(env)}:{TURN_TCP_PORT} (LiveKit TURN; forward plain TCP)",
            f"  The proxy host manages the {turn_host} certificate; reload the proxy after renewal.",
        ]
    profiles = [item.strip() for item in env.get("COMPOSE_PROFILES", "").split(",")]
    if "tunnel" in profiles:
        lines += ["", "Cloudflare Tunnel"]
        lines += [f"  route {name} -> {target}" for name, target in routes]
    lines += ["", "Run `deploy/qjudge ingress --nginx` for reverse proxy server blocks."]
    return "\n".join(lines) + "\n"


def _server_block(public_url: str, upstream: str, extra: str = "", websocket: bool = False) -> str:
    parts = urlsplit(public_url)
    tls = parts.scheme in {"https", "wss"}
    port = parts.port or (443 if tls else 80)
    websocket_headers = (
        "        proxy_set_header Upgrade $http_upgrade;\n"
        '        proxy_set_header Connection $qjudge_upgrade_connection;'
        if websocket
        else '        proxy_set_header Connection "";'
    )
    return f"""server {{
    listen {port}{' ssl' if tls else ''};
    server_name {parts.hostname or '_'};
    # ssl_certificate     /path/to/fullchain.pem;
    # ssl_certificate_key /path/to/privkey.pem;
{extra}
    location / {{
        proxy_pass {upstream};
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
{websocket_headers}
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }}
}}
"""


def render_nginx(env: Env) -> str:
    origin = env.get("QJUDGE_PUBLIC_ORIGIN", "")
    storage = _bundled_storage(env)
    same_origin_storage = uses_public_origin(env, storage)
    media = _bundled_media(env)
    same_origin_media = uses_public_origin(env, media)
    blocks = []
    if media:
        blocks.append("""# Place the map and HTTP server blocks in the nginx http context.
map $http_upgrade $qjudge_upgrade_connection {
    default upgrade;
    ""      "";
}
""")
    blocks.append(_server_block(origin, _frontend(env),
                                "    client_max_body_size 0;\n" if same_origin_storage else "",
                                websocket=same_origin_media))
    if storage and not same_origin_storage:
        blocks.append(
            _server_block(
                storage,
                f"http://{_bind_address(env)}:{MINIO_PORT}",
                "    client_max_body_size 0;\n",
            )
        )
    if media:
        if not same_origin_media:
            blocks.append(
                _server_block(
                    media,
                    f"http://{_bind_address(env)}:7880",
                    websocket=True,
                )
            )
        blocks.append(_turn_stream_block(env))
    return "\n".join(blocks)


def _turn_stream_block(env: Env) -> str:
    turn_host = env.get("LIVEKIT_TURN_HOST", "").strip() or "_"
    return f"""# TURN/TLS for {turn_host}: top-level stream context (ngx_stream_module).
# LiveKit always advertises turns:{turn_host}:443. This assumes {turn_host}
# resolves to an address used only for TURN; bind the http servers to the
# host's other address so both can listen on 443.
stream {{
    server {{
        listen <TURN address>:443 ssl;
        # ssl_certificate     /path/to/{turn_host}/fullchain.pem;
        # ssl_certificate_key /path/to/{turn_host}/privkey.pem;
        proxy_pass {_bind_address(env)}:{TURN_TCP_PORT};
    }}
}}
"""
