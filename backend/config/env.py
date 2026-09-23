"""Read environment variables, treating empty values as unset."""

import os


def env(name: str, default: str | None = None) -> str | None:
    """Return the stripped value of ``name``; empty or missing returns ``default``.

    Compose passes unset optional keys as empty strings, so an empty value must
    not override the application's default.
    """
    value = os.environ.get(name, "").strip()
    return value if value else default
