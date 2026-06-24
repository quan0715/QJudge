"""Compatibility exports for older users.services OAuth imports."""

from .provider_registry import OAUTH_PROVIDERS, get_oauth_service
from .providers import (
    BaseOAuthService,
    GitHubOAuthService,
    GoogleOAuthService,
    NYCUOAuthService,
)

__all__ = [
    "BaseOAuthService",
    "GitHubOAuthService",
    "GoogleOAuthService",
    "NYCUOAuthService",
    "OAUTH_PROVIDERS",
    "get_oauth_service",
]
