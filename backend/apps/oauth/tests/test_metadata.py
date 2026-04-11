from django.test import TestCase, override_settings


@override_settings(OAUTH_ISSUER_URL="https://qjudge.com")
class OAuthAuthorizationServerMetadataTest(TestCase):
    def test_returns_valid_metadata(self):
        response = self.client.get("/.well-known/oauth-authorization-server")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        data = response.json()
        self.assertEqual(data["issuer"], "https://qjudge.com")
        self.assertEqual(
            data["authorization_endpoint"],
            "https://qjudge.com/o/authorize/",
        )
        self.assertEqual(
            data["token_endpoint"],
            "https://qjudge.com/o/token/",
        )
        self.assertEqual(
            data["registration_endpoint"],
            "https://qjudge.com/o/register/",
        )
        self.assertEqual(data["response_types_supported"], ["code"])
        self.assertEqual(data["grant_types_supported"], ["authorization_code"])
        self.assertEqual(data["code_challenge_methods_supported"], ["S256"])
        self.assertEqual(
            data["token_endpoint_auth_methods_supported"], ["none"]
        )
        self.assertEqual(
            data["revocation_endpoint"],
            "https://qjudge.com/o/revoke/",
        )

    def test_returns_cors_headers(self):
        response = self.client.get(
            "/.well-known/oauth-authorization-server",
            HTTP_ORIGIN="https://example.com",
        )
        self.assertEqual(response.status_code, 200)
