from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from .models import Notification

User = get_user_model()

class NotificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='user',
            email='user@example.com',
            password='password123',
            role='student'
        )
        self.other_user = User.objects.create_user(
            username='other',
            email='other@example.com',
            password='password123',
            role='student'
        )
        
        self.notification = Notification.objects.create(
            recipient=self.user,
            title='Test Notification',
            message='Test Content',
            notification_type='system'
        )
        
        self.other_notification = Notification.objects.create(
            recipient=self.other_user,
            title='Other Notification',
            message='Other Content',
            notification_type='system'
        )
        
        # 'notifications' app_name is likely 'notifications' from urls.py
        # router basename 'notification'
        self.list_url = reverse('notifications:notification-list')
        self.read_url = reverse('notifications:notification-read', args=[self.notification.id])
        self.read_all_url = reverse('notifications:notification-read-all')

    def test_list_notifications(self):
        """Test listing notifications for current user only"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check pagination or list
        data = response.data.get('results', response.data) if hasattr(response.data, 'get') else response.data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['id'], self.notification.id)

    def test_mark_as_read(self):
        """Test marking a notification as read"""
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.read_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.is_read)

    def test_mark_all_as_read(self):
        """Test marking all notifications as read"""
        self.client.force_authenticate(user=self.user)
        # Create another unread one
        Notification.objects.create(
            recipient=self.user,
            title='Test 2',
            message='Content',
            is_read=False
        )
        
        response = self.client.patch(self.read_all_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        unread_count = Notification.objects.filter(recipient=self.user, is_read=False).count()
        self.assertEqual(unread_count, 0)
