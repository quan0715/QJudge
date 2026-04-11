import json
import hashlib
import base64
import secrets

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from oauth2_provider.models import Application

User = get_user_model()


def _pkce_pair():
    """Generate a PKCE code_verifier + code_challenge."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


@override_settings(
    OAUTH_ISSUER_URL="https://qjudge.com",
    FRONTEND_URL="https://qjudge.com",
)
class AuthorizeRedirectTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="teacher1",
            password="testpass123",
            email="teacher1@test.com",
        )
        self.app = Application.objects.create(
            name="Test MCP Client",
            client_id="test-client-id",
            client_secret="",
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://localhost:3000/callback",
        )

    def test_redirects_to_frontend_when_authenticated(self):
        self.client.force_login(self.user)
        _, challenge = _pkce_pair()
        response = self.client.get(
            "/o/authorize/",
            {
                "response_type": "code",
                "client_id": "test-client-id",
                "redirect_uri": "http://localhost:3000/callback",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )
        self.assertEqual(response.status_code, 302)
        location = response["Location"]
        self.assertIn("/oauth/authorize", location)
        self.assertIn("client_id=test-client-id", location)
        self.assertIn("client_name=Test", location)

    def test_redirects_to_login_when_not_authenticated(self):
        _, challenge = _pkce_pair()
        response = self.client.get(
            "/o/authorize/",
            {
                "response_type": "code",
                "client_id": "test-client-id",
                "redirect_uri": "http://localhost:3000/callback",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )
        self.assertEqual(response.status_code, 302)
        location = response["Location"]
        # Should redirect to frontend login with next= param
        self.assertIn("https://qjudge.com/login", location)
        self.assertIn("next=", location)


@override_settings(
    OAUTH_ISSUER_URL="https://qjudge.com",
    FRONTEND_URL="https://qjudge.com",
)
class ApproveAuthorizationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="teacher2",
            password="testpass123",
            email="teacher2@test.com",
        )
        self.app = Application.objects.create(
            name="Test MCP Client",
            client_id="test-client-id-2",
            client_secret="",
            client_type=Application.CLIENT_PUBLIC,
            authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://localhost:3000/callback",
        )
        self.verifier, self.challenge = _pkce_pair()

    def test_approve_returns_redirect_url_with_code(self):
        self.client.force_login(self.user)
        response = self.client.post(
            "/api/oauth/approve/",
            data=json.dumps(
                {
                    "client_id": "test-client-id-2",
                    "redirect_uri": "http://localhost:3000/callback",
                    "response_type": "code",
                    "code_challenge": self.challenge,
                    "code_challenge_method": "S256",
                    "scope": "mcp",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("redirect_uri", data)
        self.assertIn("code=", data["redirect_uri"])

    def test_approve_requires_authentication(self):
        response = self.client.post(
            "/api/oauth/approve/",
            data=json.dumps(
                {
                    "client_id": "test-client-id-2",
                    "redirect_uri": "http://localhost:3000/callback",
                    "response_type": "code",
                    "code_challenge": self.challenge,
                    "code_challenge_method": "S256",
                }
            ),
            content_type="application/json",
        )
        self.assertIn(response.status_code, [401, 403, 302])

    def test_deny_returns_error_redirect(self):
        self.client.force_login(self.user)
        response = self.client.post(
            "/api/oauth/approve/",
            data=json.dumps(
                {
                    "client_id": "test-client-id-2",
                    "redirect_uri": "http://localhost:3000/callback",
                    "response_type": "code",
                    "code_challenge": self.challenge,
                    "code_challenge_method": "S256",
                    "deny": True,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("redirect_uri", data)
        self.assertIn("error=access_denied", data["redirect_uri"])
