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
from apps.contests.tests.classroom_candidates import enrol_candidates


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
        
        # Create published contest with valid time range
        now = timezone.now()
        self.active_contest = Contest.objects.create(
            name='Active Contest',
            status='published',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
        )
        
        # Create draft contest
        self.draft_contest = Contest.objects.create(
            name='Draft Contest',
            status='draft',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher
        )
        
        # Create contest that hasn't started yet
        self.future_contest = Contest.objects.create(
            name='Future Contest',
            status='published',
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            owner=self.teacher
        )
        
        # Create contest that has ended
        self.ended_contest = Contest.objects.create(
            name='Ended Contest',
            status='published',
            start_time=now - timedelta(hours=3),
            end_time=now - timedelta(hours=1),
            owner=self.teacher
        )
        
        # Eligibility is classroom membership; enrol the student in each contest
        # so the layer 1/2 tests below exercise status and time, not eligibility.
        for contest in (
            self.active_contest,
            self.draft_contest,
            self.future_contest,
            self.ended_contest,
        ):
            enrol_candidates(contest, self.student)

        self.participant = ContestParticipant.objects.create(
            contest=self.active_contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )
        ContestParticipant.objects.create(
            contest=self.draft_contest,
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
    
    def test_start_exam_draft_contest_rejected(self):
        """Exam start should fail when contest is draft."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.draft_contest.id}/exam/start/'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('not published', response.data.get('error', ''))

    def test_event_post_is_not_allowed(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.draft_contest.id}/exam/events/',
            {'event_type': 'mouse_leave_triggered'}
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_end_exam_draft_contest_rejected(self):
        """End exam should fail when contest is draft."""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(
            f'/api/v1/contests/{self.draft_contest.id}/exam/end/'
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

    def test_start_exam_success_published_contest(self):
        """Exam start should succeed for published contest within time range."""
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
