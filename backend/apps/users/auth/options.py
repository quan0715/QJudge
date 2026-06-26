"""Public authentication option metadata for frontend rendering."""

from django.conf import settings

from .provider_registry import get_oauth_provider_options


def is_email_password_auth_enabled() -> bool:
    """Return whether email/password authentication endpoints are enabled."""
    return bool(getattr(settings, "AUTH_EMAIL_PASSWORD_ENABLED", True))


def get_auth_options() -> dict:
    """Return public login method metadata for frontend rendering."""
    return {
        "email_password_enabled": is_email_password_auth_enabled(),
        "providers": get_oauth_provider_options(),
    }


__all__ = [
    "get_auth_options",
    "is_email_password_auth_enabled",
]
