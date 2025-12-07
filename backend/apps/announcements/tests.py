from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from .models import Announcement

User = get_user_model()

class AnnouncementTests(APITestCase):
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
        
        self.announcement = Announcement.objects.create(
            title='Test Announcement',
            content='Content',
            visible=True,
            author=self.admin
        )
        
        # Determine URLs - assuming imported via main urls with no namespace or namespace='announcements'?
        # Typically DRF router names: 'announcement-list', 'announcement-detail'
        self.list_url = reverse('announcement-list')
        self.detail_url = reverse('announcement-detail', args=[self.announcement.id])

    def test_list_announcements(self):
        """Test listing announcements"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check if paginated or list
        if 'results' in response.data:
            self.assertEqual(len(response.data['results']), 1)
        else:
            self.assertEqual(len(response.data), 1)

    def test_create_announcement_admin(self):
        """Test admin creating announcement"""
        self.client.force_authenticate(user=self.admin)
        data = {'title': 'New', 'content': 'New Content', 'visible': True}
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_announcement_student_fail(self):
        """Test student cannot create announcement"""
        self.client.force_authenticate(user=self.user)
        data = {'title': 'New', 'content': 'New Content', 'visible': True}
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_announcement_admin(self):
        """Test admin updating announcement"""
        self.client.force_authenticate(user=self.admin)
        data = {'title': 'Updated Title'}
        response = self.client.patch(self.detail_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.announcement.refresh_from_db()
        self.assertEqual(self.announcement.title, 'Updated Title')

    def test_delete_announcement_admin(self):
        """Test admin deleting announcement"""
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Announcement.objects.filter(id=self.announcement.id).exists())
