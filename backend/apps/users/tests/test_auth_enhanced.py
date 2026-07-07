from django.urls import reverse
from django.conf import settings
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch

User = get_user_model()

class EnhancedAuthTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('auth:password-register')
        self.login_url = reverse('auth:provider-login', kwargs={'provider': 'password'})
        self.logout_url = reverse('auth:logout')
        self.refresh_url = reverse('auth:token-refresh')
        self.auth_options_url = reverse('auth:auth-providers')
        self.session_list_url = reverse('auth:session-list')
        self.session_logout_others_url = reverse('auth:session-logout-others')
        self.dev_token_url = reverse('auth:dev-token') if settings.DEBUG else None
        
        self.user_data = {
            'username': 'enhanced_user',
            'email': 'enhanced@example.com',
            'password': 'StrongPassword123!',
            'password_confirm': 'StrongPassword123!'
        }
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='password123'
        )

    def test_logout_authenticated(self):
        """Test logout for authenticated user"""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

    def test_logout_unauthenticated(self):
        """Test logout for unauthenticated user should return 401"""
        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh_missing_token(self):
        """Test token refresh without refresh token"""
        response = self.client.post(self.refresh_url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'MISSING_TOKEN')

    def test_token_refresh_invalid_token(self):
        """Test token refresh with invalid token"""
        response = self.client.post(self.refresh_url, {'refresh': 'invalid_token'})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error']['code'], 'INVALID_TOKEN')

    def test_oauth_login_unknown_provider(self):
        """Test OAuth login with unknown provider"""
        url = reverse('auth:provider-login', kwargs={'provider': 'unknown'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'UNKNOWN_PROVIDER')

    def test_oauth_callback_unknown_provider(self):
        """Test OAuth callback with unknown provider"""
        url = reverse('auth:oauth-callback', kwargs={'provider': 'unknown'})
        response = self.client.post(url, {'code': 'some_code', 'redirect_uri': 'http://localhost'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'UNKNOWN_PROVIDER')

    @override_settings(AUTH_EMAIL_PASSWORD_ENABLED=False)
    def test_auth_options_returns_login_configuration(self):
        response = self.client.get(self.auth_options_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(
            response.data["data"],
            {
                "password_enabled": False,
                "providers": [
                    {
                        "key": "nycu",
                        "type": "oidc",
                        "category": "campus",
                        "display_name": "NYCU 國立陽明交通大學",
                        "display_name_i18n_key": "auth.providers.nycu",
                        "logo_url": "/illustrations/nycu-logo.png",
                    },
                    {
                        "key": "github",
                        "type": "oauth2",
                        "category": "social",
                        "display_name": "GitHub",
                        "display_name_i18n_key": "auth.providers.github",
                    },
                    {
                        "key": "google",
                        "type": "oidc",
                        "category": "social",
                        "display_name": "Google",
                        "display_name_i18n_key": "auth.providers.google",
                        "logo_url": "/illustrations/google-icon.svg",
                    },
                ],
            },
        )

    @override_settings(AUTH_EMAIL_PASSWORD_ENABLED=False)
    def test_password_register_is_rejected_when_disabled(self):
        response = self.client.post(self.register_url, self.user_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "PASSWORD_AUTH_DISABLED")
        self.assertFalse(User.objects.filter(email=self.user_data["email"]).exists())

    @override_settings(AUTH_EMAIL_PASSWORD_ENABLED=False)
    def test_password_login_is_rejected_when_disabled(self):
        response = self.client.post(
            self.login_url,
            {"identifier": self.user.email, "password": "password123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "PASSWORD_AUTH_DISABLED")

    def test_password_recovery_routes_are_removed(self):
        for path in ["/api/v1/auth/forgot-password", "/api/v1/auth/reset-password"]:
            response = self.client.post(path, {}, format="json")
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_auth_me_session_routes_are_removed(self):
        legacy_routes = [
            ("get", "/api/v1/auth/me/login-records"),
            ("post", "/api/v1/auth/me/logout-other-devices"),
        ]
        for method, path in legacy_routes:
            response = getattr(self.client, method)(path, {}, format="json")
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_session_routes_are_canonical(self):
        self.client.force_authenticate(user=self.user)

        list_response = self.client.get(self.session_list_url)
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertTrue(list_response.data["success"])

        logout_others_response = self.client.post(self.session_logout_others_url)
        self.assertEqual(logout_others_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(logout_others_response.data["error"]["code"], "NO_JTI")

    @patch('apps.users.views.auth.get_oauth_service')
    def test_oauth_login_success(self, mock_get_service):
        """Test successful OAuth login URL generation"""
        mock_service = mock_get_service.return_value
        mock_service.get_authorization_url.return_value = "http://oauth.com/auth"
        
        url = reverse('auth:provider-login', kwargs={'provider': 'github'})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['authorization_url'], "http://oauth.com/auth")

    @patch('apps.users.views.auth.get_oauth_service')
    def test_oauth_callback_exception(self, mock_get_service):
        """Test OAuth callback error handling"""
        mock_service = mock_get_service.return_value
        mock_service.exchange_code.side_effect = Exception("OAuth error")
        
        url = reverse('auth:oauth-callback', kwargs={'provider': 'github'})
        response = self.client.post(url, {'code': 'valid_code', 'redirect_uri': 'http://localhost'})
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data['error']['code'], 'AUTH_003')

    @patch('apps.users.serializers.RegisterSerializer.save')
    def test_register_exception(self, mock_save):
        """Test RegisterView exception handling"""
        mock_save.side_effect = Exception("Registration error")
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.data['error']['code'], 'REGISTRATION_FAILED')

    @patch('apps.users.views.auth.settings')
    def test_dev_token_view(self, mock_settings):
        """Test DevTokenView with mocked DEBUG=True"""
        mock_settings.DEBUG = True
        # Direct path since reverse might not work if it was excluded from urlpatterns
        url = '/api/v1/auth/dev/token'
        
        response = self.client.post(url, {'role': 'teacher', 'username': 'devteacher'})
        # If it's 404, it means it's not in urlpatterns. We might need to call the view directly.
        if response.status_code == 404:
            from apps.users.views import DevTokenView
            view = DevTokenView.as_view()
            from rest_framework.test import APIRequestFactory
            factory = APIRequestFactory()
            request = factory.post(url, {'role': 'teacher', 'username': 'devteacher'}, format='json')
            response = view(request)
            
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.data['data'])
        
        # Test invalid role
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.post(url, {'role': 'invalid'}, format='json')
        from apps.users.views import DevTokenView
        response = DevTokenView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
