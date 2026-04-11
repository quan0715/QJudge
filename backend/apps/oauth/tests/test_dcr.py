import json

from django.test import TestCase


class DynamicClientRegistrationTest(TestCase):
    def _register(self, body):
        return self.client.post(
            "/o/register/",
            data=json.dumps(body),
            content_type="application/json",
        )

    def test_register_public_client(self):
        response = self._register(
            {
                "client_name": "Claude Code",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["http://localhost:3000/callback"],
            }
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("client_id", data)
        self.assertEqual(data["client_name"], "Claude Code")
        self.assertEqual(data["grant_types"], ["authorization_code"])
        self.assertEqual(data["token_endpoint_auth_method"], "none")
        self.assertNotIn("client_secret", data)

    def test_register_creates_oauth_application(self):
        from oauth2_provider.models import Application

        self._register(
            {
                "client_name": "Test Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["http://localhost:9999/callback"],
            }
        )
        app = Application.objects.get(name="Test Client")
        self.assertEqual(app.client_type, Application.CLIENT_PUBLIC)
        self.assertEqual(
            app.authorization_grant_type,
            Application.GRANT_AUTHORIZATION_CODE,
        )
        self.assertIn("http://localhost:9999/callback", app.redirect_uris)

    def test_reject_confidential_client(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "client_secret_post",
                "redirect_uris": ["http://localhost:3000/callback"],
            }
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("error", data)

    def test_reject_non_authorization_code_grant(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["client_credentials"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["http://localhost:3000/callback"],
            }
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_missing_redirect_uris(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
            }
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_get_method(self):
        response = self.client.get("/o/register/")
        self.assertEqual(response.status_code, 405)

    def test_reject_invalid_redirect_uri_scheme(self):
        response = self._register(
            {
                "client_name": "Bad Client",
                "grant_types": ["authorization_code"],
                "token_endpoint_auth_method": "none",
                "redirect_uris": ["javascript:alert(1)"],
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())
