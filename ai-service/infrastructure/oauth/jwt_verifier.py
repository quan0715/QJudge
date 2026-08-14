"""Local verifier for QJudge audience-scoped resource tokens."""

from __future__ import annotations

from typing import Any

import jwt
from jwt import PyJWKClient

from domain.models import Principal


class AuthError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class JwtVerifier:
    def __init__(self, issuer: str, jwks_client: PyJWKClient) -> None:
        self._issuer = issuer.rstrip("/")
        self._jwks_client = jwks_client

    def verify(
        self,
        token: str,
        audience: str,
        required_scopes: frozenset[str],
    ) -> Principal:
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token).key
            claims: dict[str, Any] = jwt.decode(
                token,
                signing_key,
                algorithms=["EdDSA"],
                issuer=self._issuer,
                audience=audience,
                options={
                    "require": ["iss", "sub", "aud", "scope", "iat", "exp"]
                },
            )
        except Exception as exc:
            raise AuthError("AI_AUTH_INVALID", "Invalid access token") from exc

        scopes = frozenset(str(claims["scope"]).split())
        if not required_scopes.issubset(scopes):
            raise AuthError("AI_SCOPE_DENIED", "Required scope is missing")
        return Principal(issuer=str(claims["iss"]), subject=str(claims["sub"]))
