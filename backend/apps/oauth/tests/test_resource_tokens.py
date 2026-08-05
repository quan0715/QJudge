import base64
import hashlib
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.test import override_settings
from oauth2_provider.models import Application
from rest_framework.test import APIClient

from apps.oauth.resource_tokens import issue_resource_token
from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def signing_key_file(tmp_path):
    private_key = Ed25519PrivateKey.generate()
    path = tmp_path / "ai-oauth-private.pem"
    path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    with override_settings(
        OAUTH_ISSUER_URL="https://issuer.test",
        AI_OAUTH_SIGNING_PRIVATE_KEY_FILE=path,
    ):
        yield private_key


@pytest.fixture
def teacher():
    return User.objects.create_user(
        username="oauth-teacher",
        email="oauth-teacher@example.com",
        password="test-password",
        role="teacher",
    )


@pytest.fixture
def student():
    return User.objects.create_user(
        username="oauth-student",
        email="oauth-student@example.com",
        password="test-password",
        role="student",
    )


def _decode(token: str, private_key: Ed25519PrivateKey, audience: str) -> dict:
    return jwt.decode(
        token,
        private_key.public_key(),
        algorithms=["EdDSA"],
        audience=audience,
        issuer="https://issuer.test",
    )


def test_teacher_receives_ai_audience_token(api_client, teacher, signing_key_file):
    api_client.force_authenticate(teacher)

    response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
    )

    assert response.status_code == 200
    claims = _decode(response.data["access_token"], signing_key_file, "ai-service")
    assert claims["aud"] == "ai-service"
    assert claims["scope"] == "ai:chat"
    assert claims["sub"] == str(teacher.pk)
    assert set(claims) == {"iss", "sub", "aud", "scope", "iat", "nbf", "exp", "jti"}


def test_resource_token_response_disables_caching(
    api_client, teacher, signing_key_file
):
    api_client.force_authenticate(teacher)

    response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
    )

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response["Pragma"] == "no-cache"


def test_student_cannot_receive_ai_chat_scope(api_client, student, signing_key_file):
    api_client.force_authenticate(student)

    response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    "payload",
    [
        {"audience": "qjudge-mcp", "scope": "mcp"},
        {"audience": "ai-service", "scope": "mcp"},
        {"audience": "ai-service", "scope": "ai:chat mcp"},
    ],
)
def test_browser_resource_endpoint_never_issues_mcp_tokens(
    api_client, teacher, signing_key_file, payload
):
    api_client.force_authenticate(teacher)

    response = api_client.post("/api/oauth/resource-token/", payload, format="json")

    assert response.status_code == 400


def test_ai_token_exchanges_to_distinct_mcp_audience(
    api_client, teacher, signing_key_file
):
    ai_token = issue_resource_token(
        teacher, "ai-service", frozenset({"ai:chat"})
    )

    response = api_client.post(
        "/api/oauth/token-exchange/",
        {"audience": "qjudge-mcp", "scope": "mcp"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {ai_token}",
    )

    assert response.status_code == 200
    claims = _decode(response.data["access_token"], signing_key_file, "qjudge-mcp")
    assert claims["aud"] == "qjudge-mcp"
    assert claims["scope"] == "mcp"
    assert claims["iss"] == "https://issuer.test"
    assert claims["sub"] == str(teacher.pk)


def test_token_exchange_response_disables_caching(
    api_client, teacher, signing_key_file
):
    ai_token = issue_resource_token(
        teacher, "ai-service", frozenset({"ai:chat"})
    )

    response = api_client.post(
        "/api/oauth/token-exchange/",
        {"audience": "qjudge-mcp", "scope": "mcp"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {ai_token}",
    )

    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response["Pragma"] == "no-cache"


@override_settings(OAUTH_ISSUER_URL="https://issuer.test/")
def test_trailing_slash_issuer_is_canonical_in_metadata_and_token(
    api_client, teacher, signing_key_file
):
    api_client.force_authenticate(teacher)

    token_response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
    )
    metadata_response = api_client.get(
        "/.well-known/oauth-authorization-server"
    )

    assert token_response.status_code == 200
    claims = _decode(
        token_response.data["access_token"], signing_key_file, "ai-service"
    )
    assert claims["iss"] == "https://issuer.test"
    assert metadata_response.json()["issuer"] == "https://issuer.test"
    assert metadata_response.json()["token_endpoint"] == (
        "https://issuer.test/o/token/"
    )


def test_token_exchange_rejects_non_ai_resource_token(
    api_client, teacher, signing_key_file
):
    mcp_token = issue_resource_token(teacher, "qjudge-mcp", frozenset({"mcp"}))

    response = api_client.post(
        "/api/oauth/token-exchange/",
        {"audience": "qjudge-mcp", "scope": "mcp"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {mcp_token}",
    )

    assert response.status_code == 401


def test_jwks_exposes_public_ed25519_key(signing_key_file, client):
    response = client.get("/.well-known/jwks.json")

    assert response.status_code == 200
    keys = response.json()["keys"]
    assert len(keys) == 1
    assert keys[0]["kty"] == "OKP"
    assert keys[0]["crv"] == "Ed25519"
    assert keys[0]["alg"] == "EdDSA"
    assert keys[0]["use"] == "sig"
    assert keys[0]["kid"] == "qjudge-ai-ed25519-v1"


def test_oauth_metadata_advertises_ai_chat_scope(client):
    response = client.get("/.well-known/oauth-authorization-server")

    assert response.status_code == 200
    assert "ai:chat" in response.json()["scopes_supported"]


def test_opaque_pkce_token_can_bridge_to_ai_resource_token(
    api_client, teacher, signing_key_file
):
    application = Application.objects.create(
        name="Standalone AI Web App",
        client_id="standalone-ai-client",
        client_secret="",
        client_type=Application.CLIENT_PUBLIC,
        authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
        redirect_uris="https://standalone.test/callback",
        skip_authorization=False,
    )
    verifier = "pkce-verifier-with-enough-entropy-1234567890"
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    api_client.force_authenticate(teacher)
    approval = api_client.post(
        "/api/oauth/approve/",
        {
            "client_id": application.client_id,
            "redirect_uri": "https://standalone.test/callback",
            "response_type": "code",
            "scope": "mcp",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
        format="json",
    )
    assert approval.status_code == 200
    code = parse_qs(urlparse(approval.data["redirect_uri"]).query)["code"][0]

    api_client.force_authenticate(user=None)
    token_response = api_client.post(
        "/o/token/",
        {
            "grant_type": "authorization_code",
            "client_id": application.client_id,
            "redirect_uri": "https://standalone.test/callback",
            "code": code,
            "code_verifier": verifier,
        },
    )
    assert token_response.status_code == 200
    opaque_token = token_response.json()["access_token"]
    assert opaque_token.count(".") != 2

    resource_response = api_client.post(
        "/api/oauth/resource-token/",
        {"audience": "ai-service", "scope": "ai:chat"},
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {opaque_token}",
    )

    assert resource_response.status_code == 200
    claims = _decode(
        resource_response.data["access_token"], signing_key_file, "ai-service"
    )
    assert claims["sub"] == str(teacher.pk)
