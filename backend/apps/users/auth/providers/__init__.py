"""OAuth provider services."""

from .base import BaseOAuthService
from .github import GitHubOAuthService
from .google import GoogleOAuthService
from .nycu import NYCUOAuthService

__all__ = [
    "BaseOAuthService",
    "GitHubOAuthService",
    "GoogleOAuthService",
    "NYCUOAuthService",
]
