"""Server-only provider connection configuration for QAuth federation."""

from __future__ import annotations

import json
import os

from django.conf import settings

from .contracts import QAuthProviderConnection


def load_provider_connections(raw: str | None = None) -> dict[str, QAuthProviderConnection]:
    source = raw
    if source is None:
        source = getattr(settings, "QAUTH_PROVIDER_CONNECTIONS_JSON", None)
    if source is None:
        source = os.getenv("QAUTH_PROVIDER_CONNECTIONS_JSON", "[]")

    try:
        items = json.loads(source or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError("QAUTH_PROVIDER_CONNECTIONS_JSON must be valid JSON") from exc

    if not isinstance(items, list):
        raise RuntimeError("QAUTH_PROVIDER_CONNECTIONS_JSON must be a JSON array")

    return {
        item["key"]: QAuthProviderConnection(
            key=item["key"],
            type=item.get("type", "oauth2"),
            issuer_url=item.get("issuer_url", ""),
            authorization_url=item.get("authorization_url", ""),
            token_url=item.get("token_url", ""),
            userinfo_url=item.get("userinfo_url", ""),
            jwks_url=item.get("jwks_url", ""),
            scope=item.get("scope", "openid email profile"),
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
