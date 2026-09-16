"""Server-only provider connection configuration for QAuth federation.

The catalog holds endpoints, scopes and the names of the environment variables
that carry each provider's credentials; the credentials themselves never appear
here. It is therefore kept as a reviewable file in the repository, and
``QAUTH_PROVIDER_CONNECTIONS_JSON`` overrides that file for deployments needing
a different identity provider. An explicit empty array disables every provider.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from django.conf import settings

from .contracts import QAuthProviderConnection


def _read_connection_file() -> str:
    path = getattr(settings, "QAUTH_PROVIDER_CONNECTIONS_FILE", None)
    if path is None:
        path = os.getenv("QAUTH_PROVIDER_CONNECTIONS_FILE", "")
    if not path:
        return "[]"
    try:
        return Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"QAUTH_PROVIDER_CONNECTIONS_FILE cannot be read: {path}") from exc


def _connection_source() -> str:
    override = getattr(settings, "QAUTH_PROVIDER_CONNECTIONS_JSON", None)
    if override is None:
        override = os.getenv("QAUTH_PROVIDER_CONNECTIONS_JSON", "")
    if override.strip():
        return override
    return _read_connection_file()


def load_provider_connections(raw: str | None = None) -> dict[str, QAuthProviderConnection]:
    source = raw if raw is not None else _connection_source()

    try:
        items = json.loads(source or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError("QAUTH_PROVIDER_CONNECTIONS_JSON must be valid JSON") from exc

    if not isinstance(items, list):
        raise RuntimeError("QAUTH_PROVIDER_CONNECTIONS_JSON must be a JSON array")

    return {
        item["key"]: QAuthProviderConnection(
            key=item["key"],
            type=item.get("type", ""),
            issuer_url=item.get("issuer_url", ""),
            authorization_url=item.get("authorization_url", ""),
            token_url=item.get("token_url", ""),
            userinfo_url=item.get("userinfo_url", ""),
            jwks_url=item.get("jwks_url", ""),
            scope=item.get("scope", ""),
            client_id_env=item.get("client_id_env", ""),
            client_secret_env=item.get("client_secret_env", ""),
            claim_mapping=item.get("claim_mapping", {}),
        )
        for item in items
        if isinstance(item, dict) and item.get("key")
    }


def resolve_provider_credentials(connection: QAuthProviderConnection) -> tuple[str, str]:
    client_id = os.getenv(connection.client_id_env, "") if connection.client_id_env else ""
    client_secret = os.getenv(connection.client_secret_env, "") if connection.client_secret_env else ""
    return client_id, client_secret


__all__ = [
    "load_provider_connections",
    "resolve_provider_credentials",
]
