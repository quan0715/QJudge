"""Validate a deployment env against the schema."""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

from .schema import KEYS, KEYS_BY_NAME, Env, uses_public_origin

ENUMS = {
    "EMAIL_MODE": ("disabled", "external"),
    "STORAGE_MODE": ("bundled", "external"),
    "MEDIA_MODE": ("disabled", "bundled", "external"),
}
HTTP_URL_KEYS = {
    "OBJECT_STORAGE_ENDPOINT_URL",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
}
MOVED_AI_KEYS = {
    "OPENAI_API_KEY", "OPENAI_BASE_URL",
    "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL",
    "VLLM_API_KEY", "VLLM_BASE_URL",
}
URL_SAFE_PASSWORD_KEYS = {"POSTGRES_ADMIN_PASSWORD", "DB_PASSWORD", "AI_DB_PASSWORD"}
URL_SAFE = re.compile(r"[A-Za-z0-9._~-]+")
HOST_LABEL = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?")
BUCKET_NAME = re.compile(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]")
# The bucket becomes a top-level path on the main site in bundled mode.
RESERVED_BUCKET_PATHS = {
    "api", "admin", "django-admin", "static", "media", "mcp", "assets", "livekit",
    "docs", "dev", "system", "dashboard", "classrooms", "question-banks", "chat",
    "forgot-password", "reset-password", "login", "register", "auth", "onboarding", "invite", "oauth", "error", "not-found",
    "brand", "fonts", "illustrations", "logos", "videos", "index.html", "robots.txt",
    "manifest.json", "sitemap.xml", "pwa-192x192.png", "pwa-512x512.png",
    "example-1.png", "example-2.png",
}


def check_env(env: Env) -> list[str]:
    """Return one message per problem; an empty list means the env is valid."""
    errors: list[str] = []
    for name in sorted(set(env) - set(KEYS_BY_NAME)):
        if name == "PASSWORD_RESET_ENABLED":
            errors.append(f"{name}: removed; delete this key and set EMAIL_MODE=disabled or external")
        elif name in MOVED_AI_KEYS:
            errors.append(
                f"{name}: moved; put API keys in deploy/ai/keys.env and base URLs in deploy/ai/models.yml"
            )
        else:
            errors.append(f"{name}: unknown key; see deploy/.env.example for supported keys")
    for key in KEYS:
        value = env.get(key.name, "").strip()
        if not value:
            if key.is_required(env):
                errors.append(f"{key.name}: required. {key.help}")
            continue
        problem = _value_problem(key.name, value, env)
        if problem:
            errors.append(f"{key.name}: {problem}")
    truthy = {"true", "1", "yes", "on"}
    tls = env.get("EMAIL_USE_TLS", "true").strip().lower() or "true"
    ssl = env.get("EMAIL_USE_SSL", "false").strip().lower()
    if tls in truthy and ssl in truthy:
        errors.append("EMAIL_USE_TLS / EMAIL_USE_SSL: choose STARTTLS or implicit TLS, not both")
    return errors


def _value_problem(name: str, value: str, env: Env) -> str | None:
    if name in {"EMAIL_USE_TLS", "EMAIL_USE_SSL"}:
        if value.lower() not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
            return "must be a boolean"
    if name in {"EMAIL_PORT", "EMAIL_TIMEOUT"}:
        if not value.isdigit() or not 1 <= int(value) <= (65535 if name == "EMAIL_PORT" else 120):
            return "must be a valid positive port or timeout (1–120 seconds)"
    # The sender is only used when mail is enabled; an unused value must not block upgrades.
    if name == "DEFAULT_FROM_EMAIL" and env.get("EMAIL_MODE", "").strip() == "external":
        address = _sender_address(value)
        domain = address.rpartition("@")[2] if address else ""
        labels = domain.split(".")
        if (len(labels) < 2 or not all(HOST_LABEL.fullmatch(label) for label in labels)
                or domain.lower() == "example.com"):
            return "must be a verified sender: noreply@mail.example.edu or QJudge <noreply@mail.example.edu>"
    if name == "QJUDGE_TRUSTED_PROXIES":
        for item in value.split(","):
            item = item.strip()
            if not item:
                continue
            try:
                network = ipaddress.ip_network(item, strict=False)
            except ValueError:
                return f"'{item}' is not an IP address or CIDR"
            if network.prefixlen == 0:
                return f"'{item}' trusts every client; list the reverse proxy addresses"
        return None
    if name in ENUMS and value not in ENUMS[name]:
        return "must be one of " + ", ".join(ENUMS[name])
    if name == "QJUDGE_PUBLIC_ORIGIN":
        return _url_problem(value, ("http", "https"), origin_only=True)
    if name == "LIVEKIT_PUBLIC_URL":
        problem = _url_problem(value, ("ws", "wss", "http", "https"))
        if problem:
            return problem
        parts = urlsplit(value)
        if env.get("MEDIA_MODE") == "bundled" and uses_public_origin(env, value):
            if parts.path.rstrip("/") != "/livekit" or parts.query or parts.fragment:
                return "must use /livekit on the main host, or leave unset to use the bundled default"
        return None
    if name in HTTP_URL_KEYS:
        problem = _url_problem(
            value, ("http", "https"),
            origin_only=name == "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"
            and env.get("STORAGE_MODE") == "bundled",
        )
        if problem:
            return problem
        if (
            name == "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"
            and env.get("QJUDGE_PUBLIC_ORIGIN", "").startswith("https://")
            and not value.startswith("https://")
        ):
            return "must use https when QJUDGE_PUBLIC_ORIGIN uses https"
        return None
    if name == "OBJECT_STORAGE_BUCKET" and env.get("STORAGE_MODE") == "bundled":
        if not BUCKET_NAME.fullmatch(value) or any(part in value for part in ("..", ".-", "-.")):
            return "must be a 3-63 character S3 bucket name (lowercase letters, digits, dots and hyphens)"
        if value in RESERVED_BUCKET_PATHS:
            return "conflicts with a QJudge route; use qjudge or another bucket name"
    if name == "OBJECT_STORAGE_SECRET_KEY" and env.get("STORAGE_MODE", "").strip() == "bundled" and len(value) < 8:
        return "must be at least 8 characters because it is the MinIO root password"
    if name in URL_SAFE_PASSWORD_KEYS and not URL_SAFE.fullmatch(value):
        return "may contain only letters, digits and -._~ because it is embedded in a database URL"
    return None


def _url_problem(value: str, schemes: tuple[str, ...], *, origin_only: bool = False) -> str | None:
    try:
        parts = urlsplit(value)
        parts.port
    except ValueError:
        return "is not a valid URL"
    if parts.scheme not in schemes or not parts.hostname:
        return f"must start with {' or '.join(s + '://' for s in schemes)} and include a host"
    if parts.username or parts.password:
        return "must not include a user name or password"
    if origin_only and (parts.path not in ("", "/") or parts.query or parts.fragment):
        return "must not include a path, query, or fragment"
    return None


def _sender_address(value: str) -> str | None:
    """Return the single mailbox in ``value``, parsed the way Django sends mail."""
    from email._header_value_parser import get_mailbox  # Django's sanitize_address uses it too
    from email.errors import HeaderParseError

    try:
        mailbox, rest = get_mailbox(value)
    except HeaderParseError:
        return None
    if rest.strip() or mailbox.all_defects or "@" not in mailbox.addr_spec:
        return None
    return mailbox.addr_spec
