"""Provider registry used by authentication views and public auth options."""

from __future__ import annotations

from dataclasses import dataclass

from .providers import BaseOAuthService, GitHubOAuthService, GoogleOAuthService, NYCUOAuthService


@dataclass(frozen=True)
class RegisteredOAuthProvider:
    key: str
    service: type[BaseOAuthService]
    type: str
    category: str
    display_name: str
    display_name_i18n_key: str = ""
    logo_url: str = ""

    def public_option(self) -> dict:
        option = {
            "key": self.key,
            "type": self.type,
            "category": self.category,
            "display_name": self.display_name,
        }
        if self.display_name_i18n_key:
            option["display_name_i18n_key"] = self.display_name_i18n_key
        if self.logo_url:
            option["logo_url"] = self.logo_url
        return option


REGISTERED_OAUTH_PROVIDERS: dict[str, RegisteredOAuthProvider] = {}


def register_oauth_provider(
    *,
    key: str,
    service: type[BaseOAuthService],
    type: str,
    category: str,
    display_name: str,
    display_name_i18n_key: str = "",
    logo_url: str = "",
) -> None:
    """Register one OAuth provider service and its public metadata."""
    if service.provider_key != key:
        raise ValueError(f"{service.__name__}.provider_key must match registered key {key!r}")
    if key in REGISTERED_OAUTH_PROVIDERS:
        raise ValueError(f"OAuth provider {key!r} is already registered")

    registration = RegisteredOAuthProvider(
        key=key,
        service=service,
        type=type,
        category=category,
        display_name=display_name,
        display_name_i18n_key=display_name_i18n_key,
        logo_url=logo_url,
    )
    REGISTERED_OAUTH_PROVIDERS[key] = registration


register_oauth_provider(
    key="nycu",
    service=NYCUOAuthService,
    type="oidc",
    category="campus",
    display_name="NYCU 國立陽明交通大學",
    display_name_i18n_key="auth.providers.nycu",
    logo_url="/illustrations/nycu-logo.png",
)
register_oauth_provider(
    key="github",
    service=GitHubOAuthService,
    type="oauth2",
    category="social",
    display_name="GitHub",
    display_name_i18n_key="auth.providers.github",
)
register_oauth_provider(
    key="google",
    service=GoogleOAuthService,
    type="oidc",
    category="social",
    display_name="Google",
    display_name_i18n_key="auth.providers.google",
    logo_url="/illustrations/google-icon.svg",
)


def get_oauth_service(provider: str) -> type[BaseOAuthService] | None:
    """Return the service class for a public provider key."""
    registration = REGISTERED_OAUTH_PROVIDERS.get(provider)
    return registration.service if registration is not None else None


def get_oauth_provider_options() -> list[dict]:
    return [registration.public_option() for registration in REGISTERED_OAUTH_PROVIDERS.values()]


def is_registered_auth_provider(provider: str) -> bool:
    return provider in REGISTERED_OAUTH_PROVIDERS


__all__ = [
    "REGISTERED_OAUTH_PROVIDERS",
    "RegisteredOAuthProvider",
    "get_oauth_provider_options",
    "get_oauth_service",
    "is_registered_auth_provider",
    "register_oauth_provider",
]
