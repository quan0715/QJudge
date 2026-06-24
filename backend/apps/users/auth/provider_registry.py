"""Provider registry used by authentication views and public auth options."""

from .providers import BaseOAuthService, GitHubOAuthService, GoogleOAuthService, NYCUOAuthService


OAUTH_PROVIDERS: dict[str, type[BaseOAuthService]] = {
    "nycu": NYCUOAuthService,
    "github": GitHubOAuthService,
    "google": GoogleOAuthService,
}


def get_oauth_service(provider: str) -> type[BaseOAuthService] | None:
    """Return the service class for a public provider key."""
    return OAUTH_PROVIDERS.get(provider)


def is_registered_auth_provider(provider: str) -> bool:
    return provider in OAUTH_PROVIDERS


__all__ = [
    "OAUTH_PROVIDERS",
    "get_oauth_service",
    "is_registered_auth_provider",
]
