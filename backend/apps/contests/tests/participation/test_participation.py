from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant

User = get_user_model()


class ContestParticipationTests(APITestCase):
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
            status='published'
        )
        
        # Create private contest
        self.private_contest = Contest.objects.create(
            name='Private Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='private',
            password='secretpassword',
            status='published'
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

    def test_register_blocks_when_ended(self):
        ended_contest = Contest.objects.create(
            name='Ended Contest',
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
            owner=self.admin,
            visibility='public',
            status='published',
        )
        url = reverse('contests:contest-register', args=[ended_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('message'), 'Contest has ended')

    def test_register_blocks_when_already_registered(self):
        ContestParticipant.objects.create(contest=self.public_contest, user=self.user)
        url = reverse('contests:contest-register', args=[self.public_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('message'), 'Already registered')

    def test_enter_blocks_draft_contest(self):
        draft_contest = Contest.objects.create(
            name='Draft Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            owner=self.admin,
            visibility='public',
            status='draft',
        )
        url = reverse('contests:contest-enter', args=[draft_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('message'), 'Contest is not published')

    def test_enter_blocks_when_not_registered(self):
        url = reverse('contests:contest-enter', args=[self.public_contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('message'), 'Not registered')

    def test_enter_allows_multiple_joins(self):
        contest = Contest.objects.create(
            name='Multi Join Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='public',
            status='published',
            allow_multiple_joins=True,
        )
        participant = ContestParticipant.objects.create(
            contest=contest,
            user=self.user,
            left_at=timezone.now() - timedelta(minutes=5),
        )
        url = reverse('contests:contest-enter', args=[contest.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        participant.refresh_from_db()
        self.assertIsNone(participant.left_at)

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

    def test_update_nickname_requires_anonymous_mode(self):
        ContestParticipant.objects.create(contest=self.public_contest, user=self.user)
        url = reverse('contests:contest-update-nickname', args=[self.public_contest.id])
        response = self.client.post(url, {'nickname': 'alias'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('error'), 'Anonymous mode is not enabled for this contest')

    def test_update_nickname_rejects_long_value(self):
        contest = Contest.objects.create(
            name='Anonymous Contest',
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.admin,
            visibility='public',
            status='published',
            anonymous_mode_enabled=True,
        )
        ContestParticipant.objects.create(contest=contest, user=self.user)
        long_nickname = 'n' * 51
        url = reverse('contests:contest-update-nickname', args=[contest.id])
        response = self.client.post(url, {'nickname': long_nickname})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data.get('error'),
            'Nickname is too long (max 50 characters)',
        )
