"""Shared availability of the platform's mail capability."""

from django.conf import settings


def mail_enabled() -> bool:
    """Enable application mail only for a supported, explicitly selected mode."""
    # bundled (self-hosted Postal) and external both deliver through SMTP settings.
    return getattr(settings, "EMAIL_MODE", "disabled") in {"external", "bundled"}
