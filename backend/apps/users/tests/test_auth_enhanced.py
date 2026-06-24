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
        self.register_url = reverse('users:email-register')
        self.login_url = reverse('users:email-login')
        self.logout_url = reverse('users:logout')
        self.refresh_url = reverse('users:token-refresh')
        self.auth_options_url = reverse('users:auth-options')
        self.dev_token_url = reverse('users:dev-token') if settings.DEBUG else None
        
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
        url = reverse('users:oauth-login', kwargs={'provider': 'unknown'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'UNKNOWN_PROVIDER')

    def test_oauth_callback_unknown_provider(self):
        """Test OAuth callback with unknown provider"""
        url = reverse('users:oauth-callback', kwargs={'provider': 'unknown'})
        response = self.client.post(url, {'code': 'some_code', 'redirect_uri': 'http://localhost'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['error']['code'], 'UNKNOWN_PROVIDER')

    @override_settings(
        AUTH_EMAIL_PASSWORD_ENABLED=False,
        AUTH_PROVIDER_OPTIONS=[
            {
                "key": "nycu",
                "category": "campus",
                "display_name": "NYCU 國立陽明交通大學",
                "logo_url": "/auth-providers/nycu.svg",
                "supports_registration": True,
            }
        ],
    )
    def test_auth_options_returns_login_configuration(self):
        response = self.client.get(self.auth_options_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertEqual(
            response.data["data"],
            {
                "email_password_enabled": False,
                "providers": [
                    {
                        "key": "nycu",
                        "category": "campus",
                        "display_name": "NYCU 國立陽明交通大學",
                        "logo_url": "/auth-providers/nycu.svg",
                        "supports_registration": True,
                    }
                ],
            },
        )

    @override_settings(AUTH_EMAIL_PASSWORD_ENABLED=False)
    def test_email_password_register_is_rejected_when_disabled(self):
        response = self.client.post(self.register_url, self.user_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "EMAIL_PASSWORD_DISABLED")
        self.assertFalse(User.objects.filter(email=self.user_data["email"]).exists())

    @override_settings(AUTH_EMAIL_PASSWORD_ENABLED=False)
    def test_email_password_login_is_rejected_when_disabled(self):
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "password123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "EMAIL_PASSWORD_DISABLED")

    @override_settings(AUTH_EMAIL_PASSWORD_ENABLED=False)
    def test_change_password_is_rejected_when_email_password_disabled(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            reverse("users:change-password"),
            {
                "current_password": "password123",
                "new_password": "NewStrongPassword123!",
                "new_password_confirm": "NewStrongPassword123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["error"]["code"], "EMAIL_PASSWORD_DISABLED")
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("password123"))

    @patch('apps.users.views.auth.get_oauth_service')
    def test_oauth_login_success(self, mock_get_service):
        """Test successful OAuth login URL generation"""
        mock_service = mock_get_service.return_value
        mock_service.get_authorization_url.return_value = "http://oauth.com/auth"
        
        url = reverse('users:oauth-login', kwargs={'provider': 'github'})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['authorization_url'], "http://oauth.com/auth")

    @patch('apps.users.views.auth.get_oauth_service')
    def test_oauth_callback_exception(self, mock_get_service):
        """Test OAuth callback error handling"""
        mock_service = mock_get_service.return_value
        mock_service.exchange_code.side_effect = Exception("OAuth error")
        
        url = reverse('users:oauth-callback', kwargs={'provider': 'github'})
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
        url = '/api/v1/users/dev/token' 
        
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
