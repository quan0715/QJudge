from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from apps.users.models import UserProfile

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
        self.assertEqual(response.json()['data']['username'], 'user')

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
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.display_name = "Student Display"
        profile.save()
        self.client.force_authenticate(user=self.admin)
        url = reverse('users:user-search') + '?q=user'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.json()['data']) >= 1)
        self.assertEqual(response.json()['data'][0]['profile']['display_name'], 'Student Display')
        self.assertIn('onboarding_completed_at', response.json()['data'][0])

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


class UserSummaryTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='summary-admin', email='summary-admin@example.test',
            role='admin', is_superuser=True,
        )
        self.url = reverse('users:user-summary')

    def test_summary_counts_all_users_beyond_search_limit(self):
        from django.utils import timezone
        users = User.objects.bulk_create([
            User(username=f'summary-{i}', email=f'summary-{i}@example.test',
                 role='teacher' if i < 25 else 'student')
            for i in range(150)
        ])
        # Missing profiles and profiles without a completion timestamp are pending.
        UserProfile.objects.bulk_create([
            UserProfile(user=user, onboarding_completed_at=None if i < 40 else timezone.now())
            for i, user in enumerate(users) if i >= 20
        ])
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data'], {
            'total': 151, 'teachers': 25, 'pending_onboarding': 41,
        })
        self.assertEqual(len(self.client.get(reverse('users:user-search')).json()['data']), 100)

    def test_summary_requires_superadmin_role_and_flag(self):
        for role, superuser in [('student', False), ('teacher', False), ('admin', False), ('student', True)]:
            with self.subTest(role=role, superuser=superuser):
                self.admin.role = role
                self.admin.is_superuser = superuser
                self.client.force_authenticate(self.admin)
                self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_summary_requires_authentication(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))


def test_user_summary_query_compiles_without_database():
    from unittest.mock import patch
    from django.db.models.query import QuerySet
    from apps.users.views.admin import UserSummaryView

    def compile_aggregate(queryset, **expressions):
        # Resolve every relation/field used by the actual view without executing SQL.
        str(queryset.annotate(**expressions).query)
        return dict.fromkeys(expressions, 0)

    with patch.object(QuerySet, 'aggregate', compile_aggregate):
        response = UserSummaryView().get(None)
    assert response.data == {'total': 0, 'teachers': 0, 'pending_onboarding': 0}
