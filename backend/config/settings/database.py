"""Build Django's PostgreSQL settings from a URL or legacy DB_* values."""

from config.env import env
from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured


def build_database_config(defaults, default_options):
    """Return a PostgreSQL config, preferring a standard PostgreSQL URL."""
    values = dict(defaults)
    url_options = {}
    database_url = env("DATABASE_URL", "").strip()

    if database_url:
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

        values.update(
            NAME=database_name,
            USER=unquote(parsed.username or ""),
            PASSWORD=unquote(parsed.password or ""),
            HOST=hostname,
            PORT=str(port or 5432),
        )
        url_options = dict(parse_qsl(parsed.query, keep_blank_values=True))

    options = {**default_options, **url_options}
    return {
        "ENGINE": "django.db.backends.postgresql",
        **values,
        "CONN_MAX_AGE": int(env("DB_CONN_MAX_AGE", "0")),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": options,
    }
