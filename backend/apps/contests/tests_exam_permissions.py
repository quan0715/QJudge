"""
Tests for exam permission 3-layer validation.
"""
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from apps.users.models import User
from apps.contests.models import Contest, ContestParticipant, ExamStatus


class ExamPermissionTests(APITestCase):
    """Test 3-layer permission checks for exam operations."""
    
    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        
        # Create users
        self.student = User.objects.create_user(
            username='student',
            email='student@test.com',
            password='testpass123',
            role='student'
        )
        self.teacher = User.objects.create_user(
            username='teacher',
            email='teacher@test.com',
            password='testpass123',
            role='teacher'
        )
        
        # Create active contest with valid time range
        now = timezone.now()
        self.active_contest = Contest.objects.create(
            name='Active Contest',
            status='active',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            max_cheat_warnings=3
        )
        
        # Create inactive contest
        self.inactive_contest = Contest.objects.create(
            name='Inactive Contest',
            status='inactive',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher
        )
        
        # Create contest that hasn't started yet
        self.future_contest = Contest.objects.create(
            name='Future Contest',
            status='active',
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            owner=self.teacher
        )
        
        # Create contest that has ended
        self.ended_contest = Contest.objects.create(
            name='Ended Contest',
            status='active',
            start_time=now - timedelta(hours=3),
            end_time=now - timedelta(hours=1),
            owner=self.teacher
        )
        
        # Register student for contests
        self.participant = ContestParticipant.objects.create(
            contest=self.active_contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )
        ContestParticipant.objects.create(
            contest=self.inactive_contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )
        ContestParticipant.objects.create(
            contest=self.future_contest,
            user=self.student,
            exam_status=ExamStatus.NOT_STARTED
        )
        ContestParticipant.objects.create(
            contest=self.ended_contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now - timedelta(hours=2)
        )

    # ===== Layer 1: Contest Status Tests =====
    
    def test_start_exam_inactive_contest_rejected(self):
        """Exam start should fail when contest is inactive."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.inactive_contest.id}/exam/start/'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('not active', response.data.get('error', ''))

    def test_log_event_inactive_contest_rejected(self):
        """Event logging should fail when contest is inactive."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.inactive_contest.id}/exam/events/',
            {'event_type': 'tab_hidden'}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('not active', response.data.get('error', ''))

    def test_end_exam_inactive_contest_rejected(self):
        """End exam should fail when contest is inactive."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.inactive_contest.id}/exam/end/'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ===== Layer 2: Time Range Tests =====
    
    def test_start_exam_before_start_time_rejected(self):
        """Exam start should fail before contest start time."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.future_contest.id}/exam/start/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not started yet', response.data.get('error', ''))

    def test_start_exam_after_end_time_rejected(self):
        """Exam start should fail after contest end time."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.ended_contest.id}/exam/start/'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ended', response.data.get('error', ''))

    def test_log_event_after_end_time_rejected(self):
        """Event logging should fail after contest ends."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.ended_contest.id}/exam/events/',
            {'event_type': 'tab_hidden'}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ended', response.data.get('error', ''))

    # ===== Layer 3: Participant Status Tests =====
    
    def test_log_event_not_in_progress_rejected(self):
        """Event logging should fail if exam not in_progress."""
        # Set participant to paused state
        self.participant.exam_status = ExamStatus.PAUSED
        self.participant.save()
        
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.active_contest.id}/exam/events/',
            {'event_type': 'tab_hidden'}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not in progress', response.data.get('error', ''))

    def test_log_event_in_progress_allowed(self):
        """Event logging should succeed when in_progress."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.active_contest.id}/exam/events/',
            {'event_type': 'tab_hidden'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('violation_count', response.data)

    def test_start_exam_success_active_contest(self):
        """Exam start should succeed for active contest within time range."""
        # Reset participant to not started
        self.participant.exam_status = ExamStatus.NOT_STARTED
        self.participant.started_at = None
        self.participant.save()
        
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.active_contest.id}/exam/start/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'started')

    # ===== Admin/Teacher Bypass Tests =====
    
    def test_teacher_bypass_inactive_contest(self):
        """Teachers should bypass Layer 1 and 2 checks."""
        ContestParticipant.objects.create(
            contest=self.inactive_contest,
            user=self.teacher,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now()
        )
        
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(
            f'/api/v1/contests/{self.inactive_contest.id}/exam/events/',
            {'event_type': 'tab_hidden'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get('bypass', False))
