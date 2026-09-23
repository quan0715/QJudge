import os

DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8000")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "9000"))
MCP_PUBLIC_URL = os.getenv("MCP_PUBLIC_URL", "http://localhost:9000")
QJUDGE_PUBLIC_ORIGIN = os.getenv("QJUDGE_PUBLIC_ORIGIN", "").strip().rstrip("/")
# The public origin is the OAuth issuer; OAUTH_ISSUER_URL is read only when the
# origin is unset (legacy compose).
OAUTH_ISSUER_URL = (
    QJUDGE_PUBLIC_ORIGIN or os.getenv("OAUTH_ISSUER_URL", "http://localhost:8000")
).rstrip("/")
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
