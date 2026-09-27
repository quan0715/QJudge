import os

DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8000")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "9000"))
QJUDGE_PUBLIC_ORIGIN = os.getenv("QJUDGE_PUBLIC_ORIGIN", "").strip().rstrip("/")
# Base URL of this server behind the frontend and the OAuth issuer; both are
# the public origin.
MCP_PUBLIC_URL = QJUDGE_PUBLIC_ORIGIN or "http://localhost:9000"
OAUTH_ISSUER_URL = QJUDGE_PUBLIC_ORIGIN or "http://localhost:8000"
OAUTH_JWKS_URL = os.getenv(
    "OAUTH_JWKS_URL",
    f"{OAUTH_ISSUER_URL.rstrip('/')}/.well-known/jwks.json",
)
DJANGO_FORWARDED_PROTO = os.getenv(
    "DJANGO_FORWARDED_PROTO",
    "https" if (
        OAUTH_ISSUER_URL.startswith("https://") or
        MCP_PUBLIC_URL.startswith("https://")
    ) else "http",
)
