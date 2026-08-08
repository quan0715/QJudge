"""Small deployment-value parsers shared by Django settings."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class PublicOrigin:
    url: str
    hostname: str


def parse_public_origin(raw: str) -> PublicOrigin:
    value = raw.strip()
    try:
        parsed = urlsplit(value)
        parsed.port
    except ValueError as exc:
        raise ValueError("QJUDGE_PUBLIC_ORIGIN is not a valid origin") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ValueError(
            "QJUDGE_PUBLIC_ORIGIN must use http or https and include a host"
        )
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("QJUDGE_PUBLIC_ORIGIN must not include user information")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError(
            "QJUDGE_PUBLIC_ORIGIN must not include a path, query, or fragment"
        )
    return PublicOrigin(
        url=f"{parsed.scheme.lower()}://{parsed.netloc}",
        hostname=parsed.hostname,
    )
