"""Public authentication option metadata for frontend rendering."""

from django.conf import settings

from .provider_registry import get_oauth_provider_options


PASSWORD_PROVIDER_OPTION = {
    "key": "password",
    "type": "credentials",
    "category": "password",
    "display_name": "Password credentials",
    "display_name_i18n_key": "auth.providers.password",
}


def is_password_auth_enabled() -> bool:
    """Return whether password credential authentication endpoints are enabled."""
    return bool(getattr(settings, "AUTH_EMAIL_PASSWORD_ENABLED", True))


def get_auth_options() -> dict:
    """Return public login method metadata for frontend rendering."""
    password_enabled = is_password_auth_enabled()
    providers = []
    if password_enabled:
        providers.append(PASSWORD_PROVIDER_OPTION.copy())
    providers.extend(get_oauth_provider_options())

    return {
        "password_enabled": password_enabled,
        "providers": providers,
    }


__all__ = [
    "get_auth_options",
    "is_password_auth_enabled",
]
