from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from infrastructure.oauth.jwt_verifier import AuthError, JwtVerifier


class StaticJwksClient:
    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return type("SigningKey", (), {"key": self._public_key})()


@pytest.fixture
def private_key():
    return Ed25519PrivateKey.generate()


@pytest.fixture
def verifier(private_key):
    return JwtVerifier(
        "https://issuer.test",
        StaticJwksClient(private_key.public_key()),
    )


def make_token(private_key, **claims_override):
    now = datetime.now(UTC)
    claims = {
        "iss": "https://issuer.test",
        "sub": "teacher-42",
        "aud": "ai-service",
        "scope": "ai:chat",
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(claims_override)
    return jwt.encode(
        claims,
        private_key,
        algorithm="EdDSA",
        headers={"kid": "qjudge-ai-ed25519-v1"},
    )


def test_verifier_returns_issuer_subject_principal(private_key, verifier):
    token = make_token(private_key)

    principal = verifier.verify(token, "ai-service", frozenset({"ai:chat"}))

    assert principal.issuer == "https://issuer.test"
    assert principal.subject == "teacher-42"


@pytest.mark.parametrize(
    ("claims_override", "error_code"),
    [
        ({"iss": "https://wrong.test"}, "AI_AUTH_INVALID"),
        ({"aud": "qjudge-mcp"}, "AI_AUTH_INVALID"),
        ({"scope": "mcp"}, "AI_SCOPE_DENIED"),
        ({"exp": 1}, "AI_AUTH_INVALID"),
    ],
)
def test_verifier_rejects_invalid_claims(
    private_key, verifier, claims_override, error_code
):
    token = make_token(private_key, **claims_override)

    with pytest.raises(AuthError) as raised:
        verifier.verify(token, "ai-service", frozenset({"ai:chat"}))

    assert raised.value.code == error_code


def test_verifier_maps_malformed_token_without_exposing_it(verifier):
    token = "secret-malformed-token"

    with pytest.raises(AuthError) as raised:
        verifier.verify(token, "ai-service", frozenset({"ai:chat"}))

    assert raised.value.code == "AI_AUTH_INVALID"
    assert token not in str(raised.value)
