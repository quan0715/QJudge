"""DRF authentication for locally verifiable QJudge resource tokens."""

from __future__ import annotations

import jwt
from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .resource_tokens import (
    RESOURCE_TOKEN_ALGORITHM,
    RESOURCE_TOKEN_KID,
    decode_resource_token,
)


class ResourceTokenAuthentication(BaseAuthentication):
    """Authenticate MCP resource JWTs while leaving legacy tokens to DRF."""

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if len(parts) != 2 or parts[0].lower() != b"bearer":
            return None
        try:
            token = parts[1].decode("ascii")
        except UnicodeDecodeError:
            return None

        if token.count(".") != 2:
            return None
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            return None
        if (
            header.get("alg") != RESOURCE_TOKEN_ALGORITHM
            or header.get("kid") != RESOURCE_TOKEN_KID
        ):
            return None

        try:
            claims = decode_resource_token(
                token,
                audience="qjudge-mcp",
                required_scopes=frozenset({"mcp"}),
            )
        except jwt.PyJWTError as exc:
            raise exceptions.AuthenticationFailed("Invalid resource token") from exc

        User = get_user_model()
        try:
            user = User.objects.get(pk=claims["sub"], is_active=True)
        except (User.DoesNotExist, ValueError, TypeError) as exc:
            raise exceptions.AuthenticationFailed("Invalid resource token subject") from exc
        return user, claims

    def authenticate_header(self, request):
        return "Bearer"
