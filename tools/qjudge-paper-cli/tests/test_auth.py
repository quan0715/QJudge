import base64
import hashlib
import json
import stat
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from qjudge_paper_cli.auth import (
    DEFAULT_SCOPE,
    OAuthConfig,
    TokenCache,
    create_pkce_pair,
)


def test_pkce_pair_uses_s256_without_padding():
    verifier, challenge = create_pkce_pair()

    expected = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")

    assert challenge == expected
    assert "=" not in challenge
    assert len(verifier) >= 43


def test_authorization_url_requests_qjudge_paper_scope():
    config = OAuthConfig(
        issuer="https://qjudge.example",
        client_id="paper-cli",
        redirect_uri="http://127.0.0.1:49152/callback",
        scope=DEFAULT_SCOPE,
    )

    url = config.authorization_url(
        code_challenge="challenge",
        state="state-value",
    )
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.geturl().startswith("https://qjudge.example/o/authorize/")
    assert query["client_id"] == ["paper-cli"]
    assert query["scope"] == ["qjudge.paper"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["http://127.0.0.1:49152/callback"]


def test_token_cache_writes_user_only_file(tmp_path: Path):
    cache = TokenCache(tmp_path / "auth.json")

    cache.save(
        {
            "issuer": "https://qjudge.example",
            "client_id": "paper-cli",
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": 1893456000,
        }
    )

    payload = json.loads((tmp_path / "auth.json").read_text())
    mode = stat.S_IMODE((tmp_path / "auth.json").stat().st_mode)

    assert payload["refresh_token"] == "refresh"
    assert mode == 0o600
