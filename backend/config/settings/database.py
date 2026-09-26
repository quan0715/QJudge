"""Build Django's PostgreSQL settings from DATABASE_URL."""

from config.env import env
from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured


def build_database_config(default_options):
    """Return a PostgreSQL config parsed from the required DATABASE_URL."""
    database_url = env("DATABASE_URL", "")
    if not database_url:
        raise ImproperlyConfigured("DATABASE_URL must be set")

    try:
        parsed = urlsplit(database_url)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ImproperlyConfigured(
            "DATABASE_URL is malformed; expected a PostgreSQL URL"
        ) from exc

    database_name = unquote(parsed.path.lstrip("/"))
    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or not hostname
        or not database_name
        or parsed.fragment
    ):
        raise ImproperlyConfigured(
            "DATABASE_URL must include a PostgreSQL host and database name"
        )

    url_options = dict(parse_qsl(parsed.query, keep_blank_values=True))
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": database_name,
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": hostname,
        "PORT": str(port or 5432),
        # PgBouncer pools server connections; Django closes its own after each request.
        "CONN_MAX_AGE": 0,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {**default_options, **url_options},
    }
