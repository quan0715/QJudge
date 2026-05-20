from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

try:
    from platformdirs import user_config_dir
except Exception:  # pragma: no cover - fallback for constrained environments
    user_config_dir = None


DEFAULT_SCOPE = "qjudge.paper"
TOKEN_EXPIRY_SKEW_SECONDS = 60


def create_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def create_state() -> str:
    return secrets.token_urlsafe(24)


def default_token_cache_path() -> Path:
    override = os.environ.get("QJUDGE_PAPER_TOKEN_CACHE")
    if override:
        return Path(override).expanduser()
    if user_config_dir is not None:
        return Path(user_config_dir("qjudge-paper-cli")) / "auth.json"
    return Path.home() / ".config" / "qjudge-paper-cli" / "auth.json"


@dataclass(frozen=True)
class OAuthConfig:
    issuer: str
    client_id: str
    redirect_uri: str
    scope: str = DEFAULT_SCOPE

    def authorization_url(self, *, code_challenge: str, state: str) -> str:
        issuer = self.issuer.rstrip("/")
        query = urlencode(
            {
                "response_type": "code",
                "client_id": self.client_id,
                "redirect_uri": self.redirect_uri,
                "scope": self.scope,
                "state": state,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
            }
        )
        return f"{issuer}/o/authorize/?{query}"


class TokenCache:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_token_cache_path()

    def load(self) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.chmod(self.path, 0o600)

    def delete(self) -> None:
        if self.path.exists():
            self.path.unlink()

    def access_token(self) -> str | None:
        payload = self.load()
        if not payload:
            return None
        token = payload.get("access_token")
        return token if isinstance(token, str) and token else None

    def refresh_token(self) -> str | None:
        payload = self.load()
        if not payload:
            return None
        token = payload.get("refresh_token")
        return token if isinstance(token, str) and token else None

    def is_access_token_fresh(self) -> bool:
        payload = self.load()
        if not payload:
            return False
        expires_at = payload.get("expires_at")
        return isinstance(expires_at, (int, float)) and (
            expires_at - TOKEN_EXPIRY_SKEW_SECONDS > time.time()
        )


def normalize_issuer(base_url: str) -> str:
    return base_url.rstrip("/")


def register_public_client(
    *,
    issuer: str,
    redirect_uri: str,
    client_name: str = "QJudge Paper CLI",
    http_client: httpx.Client | None = None,
) -> str:
    close_client = http_client is None
    client = http_client or httpx.Client(timeout=15.0)
    try:
        response = client.post(
            f"{normalize_issuer(issuer)}/o/register/",
            json={
                "client_name": client_name,
                "grant_types": ["authorization_code", "refresh_token"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": [redirect_uri],
            },
        )
        response.raise_for_status()
        data = response.json()
        client_id = data.get("client_id")
        if not isinstance(client_id, str) or not client_id:
            raise RuntimeError("OAuth registration response did not include client_id")
        return client_id
    finally:
        if close_client:
            client.close()


def exchange_authorization_code(
    *,
    issuer: str,
    client_id: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
    http_client: httpx.Client | None = None,
) -> dict[str, Any]:
    close_client = http_client is None
    client = http_client or httpx.Client(timeout=15.0)
    try:
        response = client.post(
            f"{normalize_issuer(issuer)}/o/token/",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()
    finally:
        if close_client:
            client.close()


def refresh_access_token(
    *,
    issuer: str,
    client_id: str,
    refresh_token: str,
    http_client: httpx.Client | None = None,
) -> dict[str, Any]:
    close_client = http_client is None
    client = http_client or httpx.Client(timeout=15.0)
    try:
        response = client.post(
            f"{normalize_issuer(issuer)}/o/token/",
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "refresh_token": refresh_token,
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()
    finally:
        if close_client:
            client.close()


class _OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib hook
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        self.server.oauth_result = {  # type: ignore[attr-defined]
            key: values[0] for key, values in params.items() if values
        }
        body = (
            "<html><body><h1>QJudge Paper CLI login complete</h1>"
            "<p>You can close this window and return to the terminal.</p>"
            "</body></html>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        return


def create_loopback_server() -> tuple[HTTPServer, str]:
    server = HTTPServer(("127.0.0.1", 0), _OAuthCallbackHandler)
    host, port = server.server_address
    return server, f"http://{host}:{port}/callback"


def wait_for_oauth_callback(
    server: HTTPServer,
    *,
    expected_state: str,
    timeout_seconds: int = 300,
) -> str:
    server.timeout = timeout_seconds
    server.handle_request()
    result = getattr(server, "oauth_result", None)
    if not isinstance(result, dict):
        raise TimeoutError("Timed out waiting for OAuth callback")
    if result.get("state") != expected_state:
        raise RuntimeError("OAuth state mismatch")
    if result.get("error"):
        raise RuntimeError(str(result.get("error_description") or result["error"]))
    code = result.get("code")
    if not isinstance(code, str) or not code:
        raise RuntimeError("OAuth callback did not include code")
    return code


def token_payload_with_expiry(
    *,
    issuer: str,
    client_id: str,
    token_response: dict[str, Any],
) -> dict[str, Any]:
    expires_in = token_response.get("expires_in")
    expires_at = time.time() + int(expires_in or 3600)
    return {
        "issuer": issuer,
        "client_id": client_id,
        "access_token": token_response.get("access_token"),
        "refresh_token": token_response.get("refresh_token"),
        "expires_at": int(expires_at),
        "scope": token_response.get("scope", DEFAULT_SCOPE),
        "token_type": token_response.get("token_type", "Bearer"),
    }
