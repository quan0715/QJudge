"""Regression coverage for the trusted backend authentication hop."""

from main import _jwks_client


def test_jwks_client_marks_the_internal_backend_hop_as_https() -> None:
    client = _jwks_client("http://backend:8000/.well-known/jwks.json")

    assert client.headers == {"X-Forwarded-Proto": "https"}
