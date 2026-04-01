from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from apps.users.models import UserProfile

User = get_user_model()

class AuthTests(APITestCase):
    def setUp(self):
        self.register_url = reverse('users:email-register')
        self.login_url = reverse('users:email-login')
        
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'StrongPassword123!',
            'password_confirm': 'StrongPassword123!'
        }

    def test_register_success(self):
        """Test successful user registration"""
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email='test@example.com').exists())
        self.assertIn('access_token', response.data['data'])

    def test_register_duplicate_email(self):
        """Test registration with existing email"""
        self.client.post(self.register_url, self.user_data)
        response = self.client.post(self.register_url, self.user_data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_success(self):
        """Test successful login"""
        # Register first
        self.client.post(self.register_url, self.user_data)
        
        login_data = {
            'email': 'test@example.com',
            'password': 'StrongPassword123!'
        }
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', response.data['data'])

    def test_login_response_includes_onboarding_profile_state(self):
        """Completed onboarding should survive a fresh login response."""
        user = User.objects.create_user(
            username='onboarded_user',
            email='onboarded@example.com',
            password='StrongPassword123!',
            auth_provider='email',
            role='student',
        )
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.display_name = "Onboarded User"
        profile.onboarding_completed_at = timezone.now()
        profile.save(update_fields=['display_name', 'onboarding_completed_at', 'updated_at'])

        response = self.client.post(
            self.login_url,
            {
                'email': 'onboarded@example.com',
                'password': 'StrongPassword123!',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['data']['user']['profile']['display_name'],
            'Onboarded User',
        )
        self.assertIsNotNone(
            response.data['data']['user']['profile']['onboarding_completed_at']
        )

    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='password123'
        )
        
        login_data = {
            'email': 'test@example.com',
            'password': 'wrongpassword'
        }
        response = self.client.post(self.login_url, login_data)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
