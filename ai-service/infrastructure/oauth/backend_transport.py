"""Headers for trusted authentication calls over the private Docker network."""


def backend_auth_headers() -> dict[str, str]:
    """Preserve the public HTTPS scheme across the private HTTP hop."""

    return {"X-Forwarded-Proto": "https"}
