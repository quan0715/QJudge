from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import Contest, ContestParticipant

User = get_user_model()

class ContestTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='password123',
            role='student'
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin',
            is_staff=True
        )
        
        # Create public contest
        self.public_contest = Contest.objects.create(
            name='Public Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='public',
            status='active'
        )
        
        # Create private contest
        self.private_contest = Contest.objects.create(
            name='Private Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='private',
            password='secretpassword',
            status='active'
        )
        
        self.client.force_authenticate(user=self.user)

    def test_register_public_contest(self):
        url = reverse('contests:contest-register', args=[self.public_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ContestParticipant.objects.filter(contest=self.public_contest, user=self.user).exists())

    def test_register_private_contest_success(self):
        url = reverse('contests:contest-register', args=[self.private_contest.id])
        response = self.client.post(url, {'password': 'secretpassword'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ContestParticipant.objects.filter(contest=self.private_contest, user=self.user).exists())

    def test_register_private_contest_fail(self):
        url = reverse('contests:contest-register', args=[self.private_contest.id])
        response = self.client.post(url, {'password': 'wrongpassword'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ContestParticipant.objects.filter(contest=self.private_contest, user=self.user).exists())

    def test_enter_and_leave_contest(self):
        # Register first
        ContestParticipant.objects.create(contest=self.public_contest, user=self.user)
        
        # Enter
        url_enter = reverse('contests:contest-enter', args=[self.public_contest.id])
        response = self.client.post(url_enter)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Leave
        url_leave = reverse('contests:contest-leave', args=[self.public_contest.id])
        response = self.client.post(url_leave)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check left_at
        participant = ContestParticipant.objects.get(contest=self.public_contest, user=self.user)
        self.assertIsNotNone(participant.left_at)
        
        # Try to enter again
        response = self.client.post(url_enter)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
