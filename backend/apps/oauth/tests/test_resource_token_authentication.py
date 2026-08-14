import json
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.test import override_settings
from rest_framework import exceptions
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.oauth.authentication import ResourceTokenAuthentication
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
        username="resource-auth-teacher",
        email="resource-auth-teacher@example.com",
        password="test-password",
        role="teacher",
    )


def test_mcp_resource_token_authenticates_as_original_user(
    api_client, teacher, signing_key_file
):
    token = issue_resource_token(teacher, "qjudge-mcp", frozenset({"mcp"}))

    response = api_client.get(
        "/api/v1/users/me",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == 200
    assert response.data["data"]["id"] == teacher.pk


def test_non_resource_jwt_falls_through_to_existing_authentication(
    rf, teacher, signing_key_file
):
    token = str(AccessToken.for_user(teacher))
    request = rf.get(
        "/api/v1/users/me",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert ResourceTokenAuthentication().authenticate(request) is None


def test_invalid_signed_resource_token_is_rejected(
    api_client, teacher, signing_key_file
):
    token = issue_resource_token(teacher, "ai-service", frozenset({"ai:chat"}))

    response = api_client.get(
        "/api/v1/users/me",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    assert response.status_code == 401


def test_unknown_resource_token_subject_is_rejected(
    rf, signing_key_file, django_assert_num_queries
):
    now = datetime.now(UTC)
    payload = {
        "iss": "https://issuer.test",
        "sub": "99999999",
        "aud": "qjudge-mcp",
        "scope": "mcp",
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=5),
        "jti": "44e75e22-80a1-4554-a177-c74a179e788c",
    }
    token = jwt.encode(
        payload,
        signing_key_file,
        algorithm="EdDSA",
        headers={"kid": "qjudge-ai-ed25519-v1"},
    )
    request = rf.get(
        "/api/v1/users/me",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )

    with django_assert_num_queries(1):
        with pytest.raises(exceptions.AuthenticationFailed) as raised:
            ResourceTokenAuthentication().authenticate(request)

    assert str(raised.value.detail) == "Invalid resource token subject"


def test_development_settings_authenticate_resource_tokens_first(settings):
    environment = os.environ.copy()
    environment["DJANGO_SETTINGS_MODULE"] = "config.settings.dev"
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import json; from django.conf import settings; "
                "print(json.dumps(settings.REST_FRAMEWORK"
                "['DEFAULT_AUTHENTICATION_CLASSES']))"
            ),
        ],
        cwd=settings.BASE_DIR,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    authentication_classes = json.loads(result.stdout)
    assert authentication_classes[0] == (
        "apps.oauth.authentication.ResourceTokenAuthentication"
    )
