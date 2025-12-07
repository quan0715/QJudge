from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

User = get_user_model()

class UserManagementTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='user',
            email='user@example.com',
            password='password123',
            role='student'
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin',
            is_staff=True,
            is_superuser=True
        )
        self.profile_url = reverse('users:current-user')

    def test_get_current_user(self):
        """Test retrieving current user profile"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['data']['username'], 'user')

    def test_update_current_user(self):
        """Test updating user profile"""
        self.client.force_authenticate(user=self.user)
        data = {'username': 'newuser'}
        response = self.client.patch(self.profile_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'newuser')

    def test_admin_search_users(self):
        """Test admin searching users"""
        self.client.force_authenticate(user=self.admin)
        url = reverse('users:user-search') + '?q=user'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data['data']) >= 1)

    def test_admin_update_user_role(self):
        """Test admin updating user role"""
        self.client.force_authenticate(user=self.admin)
        url = reverse('users:user-role-update', args=[self.user.id])
        data = {'role': 'teacher'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, 'teacher')
    
    def test_student_cannot_update_role(self):
        """Test student cannot update role"""
        self.client.force_authenticate(user=self.user)
        url = reverse('users:user-role-update', args=[self.user.id])
        data = {'role': 'admin'}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
