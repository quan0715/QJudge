"""Shared availability of the platform's mail capability."""

from django.conf import settings


def mail_enabled() -> bool:
    """Enable application mail only for a supported, explicitly selected mode."""
    return getattr(settings, "EMAIL_MODE", "disabled") == "external"
