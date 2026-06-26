"""Public authentication option metadata for frontend rendering."""

from django.conf import settings

from .provider_registry import OAUTH_PROVIDERS


PUBLIC_AUTH_PROVIDER_FIELDS = (
    "key",
    "type",
    "category",
    "display_name",
    "display_name_i18n_key",
    "logo_url",
)


def is_email_password_auth_enabled() -> bool:
    """Return whether email/password authentication endpoints are enabled."""
    return bool(getattr(settings, "AUTH_EMAIL_PASSWORD_ENABLED", True))


def get_auth_options() -> dict:
    """Return public login method metadata for frontend rendering."""
    providers = []
    for option in getattr(settings, "AUTH_PROVIDER_OPTIONS", []):
        key = option.get("key")
        if not key or key not in OAUTH_PROVIDERS:
            continue
        providers.append(
            {
                field: option[field]
                for field in PUBLIC_AUTH_PROVIDER_FIELDS
                if field in option
            }
        )

    return {
        "email_password_enabled": is_email_password_auth_enabled(),
        "providers": providers,
    }


__all__ = [
    "PUBLIC_AUTH_PROVIDER_FIELDS",
    "get_auth_options",
    "is_email_password_auth_enabled",
]
