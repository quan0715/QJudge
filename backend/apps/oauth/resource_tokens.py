"""Short-lived, audience-scoped resource tokens issued by QJudge."""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from django.conf import settings

RESOURCE_TOKEN_KID = "qjudge-ai-ed25519-v1"
RESOURCE_TOKEN_ALGORITHM = "EdDSA"


def canonical_oauth_issuer() -> str:
    return str(settings.OAUTH_ISSUER_URL).rstrip("/")


def _private_key() -> Ed25519PrivateKey:
    key_data = Path(settings.AI_OAUTH_SIGNING_PRIVATE_KEY_FILE).read_bytes()
    key = serialization.load_pem_private_key(key_data, password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("AI OAuth signing key must be an Ed25519 private key")
    return key


def _public_key() -> Ed25519PublicKey:
    return _private_key().public_key()


def issue_resource_token(
    user,
    audience: str,
    scopes: frozenset[str],
    lifetime_seconds: int = 300,
) -> str:
    now = datetime.now(UTC)
    payload = {
        "iss": canonical_oauth_issuer(),
        "sub": str(user.pk),
        "aud": audience,
        "scope": " ".join(sorted(scopes)),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(seconds=lifetime_seconds),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(
        payload,
        _private_key(),
        algorithm=RESOURCE_TOKEN_ALGORITHM,
        headers={"kid": RESOURCE_TOKEN_KID},
    )


def decode_resource_token(
    token: str,
    *,
    audience: str,
    required_scopes: frozenset[str],
) -> dict[str, Any]:
    header = jwt.get_unverified_header(token)
    if (
        header.get("alg") != RESOURCE_TOKEN_ALGORITHM
        or header.get("kid") != RESOURCE_TOKEN_KID
    ):
        raise jwt.InvalidTokenError("Not a QJudge resource token")
    claims = jwt.decode(
        token,
        _public_key(),
        algorithms=[RESOURCE_TOKEN_ALGORITHM],
        issuer=canonical_oauth_issuer(),
        audience=audience,
        options={
            "require": [
                "iss",
                "sub",
                "aud",
                "scope",
                "iat",
                "nbf",
                "exp",
                "jti",
            ]
        },
    )
    scopes = frozenset(str(claims["scope"]).split())
    if not required_scopes.issubset(scopes):
        raise jwt.InvalidTokenError("Required scope is missing")
    return claims


def resource_jwks() -> dict[str, list[dict[str, str]]]:
    raw_public_key = _public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    encoded_key = base64.urlsafe_b64encode(raw_public_key).rstrip(b"=").decode()
    return {
        "keys": [
            {
                "kty": "OKP",
                "crv": "Ed25519",
                "x": encoded_key,
                "use": "sig",
                "alg": RESOURCE_TOKEN_ALGORITHM,
                "kid": RESOURCE_TOKEN_KID,
            }
        ]
    }
