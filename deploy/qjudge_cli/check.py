"""Validate a deployment env against the schema."""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit

from .schema import KEYS, KEYS_BY_NAME, Env

ENUMS = {
    "STORAGE_MODE": ("bundled", "external"),
    "MEDIA_MODE": ("disabled", "bundled", "external"),
}
HTTP_URL_KEYS = {
    "OBJECT_STORAGE_ENDPOINT_URL",
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "OPENAI_BASE_URL",
    "DEEPSEEK_BASE_URL",
    "VLLM_BASE_URL",
}
URL_SAFE_PASSWORD_KEYS = {"POSTGRES_ADMIN_PASSWORD", "DB_PASSWORD", "AI_DB_PASSWORD"}
URL_SAFE = re.compile(r"[A-Za-z0-9._~-]+")


def check_env(env: Env) -> list[str]:
    """Return one message per problem; an empty list means the env is valid."""
    errors: list[str] = []
    for name in sorted(set(env) - set(KEYS_BY_NAME)):
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
    return errors


def _value_problem(name: str, value: str, env: Env) -> str | None:
    if name == "QJUDGE_TRUSTED_PROXIES":
        for item in value.split(","):
            try:
                ipaddress.ip_network(item.strip(), strict=False)
            except ValueError:
                return f"'{item.strip()}' is not an IP address or CIDR"
        return None
    if name in ENUMS and value not in ENUMS[name]:
        return "must be one of " + ", ".join(ENUMS[name])
    if name == "QJUDGE_PUBLIC_ORIGIN":
        return _url_problem(value, ("http", "https"), origin_only=True)
    if name == "LIVEKIT_PUBLIC_URL":
        return _url_problem(value, ("ws", "wss", "http", "https"))
    if name in HTTP_URL_KEYS:
        problem = _url_problem(value, ("http", "https"))
        if problem:
            return problem
        if (
            name == "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL"
            and env.get("QJUDGE_PUBLIC_ORIGIN", "").startswith("https://")
            and not value.startswith("https://")
        ):
            return "must use https when QJUDGE_PUBLIC_ORIGIN uses https"
        return None
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
    if origin_only and (parts.path not in ("", "/") or parts.query or parts.fragment):
        return "must not include a path, query, or fragment"
    return None
