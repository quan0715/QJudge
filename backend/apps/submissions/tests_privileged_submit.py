"""
Test cases for privileged users (admin/owner) submitting to contests
at any time regardless of contest status.
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch, MagicMock

from apps.problems.models import Problem, TestCase as ProblemTestCase
from apps.contests.models import Contest, ContestProblem, ContestParticipant
# from apps.submissions.models import Submission

User = get_user_model()


class PrivilegedSubmissionTestCase(TestCase):
    """
    Test that admin/owner/teacher can submit to contests at any time,
    including draft contests, ended contests, and contests they're not registered for.
    """

    def setUp(self):
        """Set up test data"""
        # Create users
        self.admin = User.objects.create_user(
            username='test_admin',
            email='admin@test.com',
            password='testpass123',
            role='admin',
            is_staff=True
        )
        
        self.teacher = User.objects.create_user(
            username='test_teacher',
            email='teacher@test.com',
            password='testpass123',
            role='teacher'
        )
        
        self.student = User.objects.create_user(
            username='test_student',
            email='student@test.com',
            password='testpass123',
            role='student'
        )
        
        self.contest_owner = User.objects.create_user(
            username='contest_owner',
            email='owner@test.com',
            password='testpass123',
            role='teacher'
        )
        
        # Create a test problem
        self.problem = Problem.objects.create(
            title='Test Problem',
            slug='test-problem',
            difficulty='easy',
            time_limit=1000,
            memory_limit=128,
            is_visible=True,
            created_by=self.teacher
        )
        
        # Create test case
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1 2',
            output_data='3',
            is_sample=True,
            score=100,
            order=1
        )
        
        # Create an draft contest
        self.draft_contest = Contest.objects.create(
            name='Draft Contest',
            owner=self.contest_owner,
            status='draft',
            visibility='public',
            start_time=timezone.now() + timedelta(days=1),
            end_time=timezone.now() + timedelta(days=2)
        )
        
        # Add problem to draft contest
        # Note: label is a computed property based on order, so we don't set it
        ContestProblem.objects.create(
            contest=self.draft_contest,
            problem=self.problem,
            order=0  # Will get label 'A'
        )
        
        # Create an active contest that has ended
        self.ended_contest = Contest.objects.create(
            name='Ended Contest',
            owner=self.contest_owner,
            status='published',
            visibility='public',
            start_time=timezone.now() - timedelta(days=2),
            end_time=timezone.now() - timedelta(hours=1)  # Ended 1 hour ago
        )
        
        ContestProblem.objects.create(
            contest=self.ended_contest,
            problem=self.problem,
            order=0
        )
        
        # Create an active ongoing contest
        self.active_contest = Contest.objects.create(
            name='Active Contest',
            owner=self.contest_owner,
            status='published',
            visibility='public',
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=2)
        )
        
        ContestProblem.objects.create(
            contest=self.active_contest,
            problem=self.problem,
            order=0
        )
        
        # Register student for active contest
        ContestParticipant.objects.create(
            contest=self.active_contest,
            user=self.student,
            started_at=timezone.now()
        )
        
        self.client = APIClient()

    def _mock_judge(self):
        """Helper to mock the judge for submissions"""
        patcher = patch('apps.judge.judge_factory.get_judge')
        mock_get_judge = patcher.start()
        mock_judge = MagicMock()
        mock_get_judge.return_value = mock_judge
        mock_judge.execute.return_value = {
            'status': 'AC',
            'time': 10,
            'memory': 1024,
            'output': '3',
            'error': ''
        }
        return patcher, mock_judge

    def _submit(self, contest):
        """Helper to submit to a contest"""
        return self.client.post('/api/v1/submissions/', {
            'problem': self.problem.id,
            'contest': contest.id,
            'language': 'cpp',
            'code': '#include <iostream>\nint main() { return 0; }',
            'is_test': False
        })

    # ==================== Admin Tests ====================

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_admin_can_submit_to_draft_contest(self, mock_commit):
        """Admin can submit to draft contests"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.admin)
            response = self._submit(self.draft_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_admin_can_submit_to_ended_contest(self, mock_commit):
        """Admin can submit to ended contests"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.admin)
            response = self._submit(self.ended_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_admin_can_submit_without_registration(self, mock_commit):
        """Admin can submit without being registered"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.admin)
            # Admin is not registered for active_contest
            response = self._submit(self.active_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    # ==================== Owner Tests ====================

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_owner_can_submit_to_draft_contest(self, mock_commit):
        """Contest owner can submit to their draft contests"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.contest_owner)
            response = self._submit(self.draft_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_owner_can_submit_to_ended_contest(self, mock_commit):
        """Contest owner can submit to their ended contests"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.contest_owner)
            response = self._submit(self.ended_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    # ==================== Teacher (non-owner) Tests ====================

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_teacher_can_submit_to_draft_contest(self, mock_commit):
        """Teacher can submit to draft contests (teacher role bypass)"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.teacher)
            response = self._submit(self.draft_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    # ==================== Contest Admin Tests ====================

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_contest_admin_can_submit_to_draft_contest(self, mock_commit):
        """Contest co-admin can submit to draft contests"""
        # Create a new user and make them a contest admin
        contest_admin = User.objects.create_user(
            username='contest_admin',
            email='cadmin@test.com',
            password='testpass123',
            role='student'  # Regular student role, but contest admin
        )
        self.draft_contest.admins.add(contest_admin)
        
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=contest_admin)
            response = self._submit(self.draft_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()

    # ==================== Student Restriction Tests ====================

    def test_student_cannot_submit_to_draft_contest(self):
        """Student cannot submit to draft contests"""
        self.client.force_authenticate(user=self.student)
        response = self._submit(self.draft_contest)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_submit_to_ended_contest(self):
        """Student cannot submit to ended contests"""
        self.client.force_authenticate(user=self.student)
        response = self._submit(self.ended_contest)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_submit_without_registration(self):
        """Student cannot submit without being registered"""
        # Create another contest where student is not registered
        other_contest = Contest.objects.create(
            name='Other Contest',
            owner=self.contest_owner,
            status='published',
            visibility='public',
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=2)
        )
        ContestProblem.objects.create(
            contest=other_contest,
            problem=self.problem,
            order=0
        )
        
        self.client.force_authenticate(user=self.student)
        response = self._submit(other_contest)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch('django.db.transaction.on_commit', side_effect=lambda func: func())
    def test_registered_student_can_submit_to_active_contest(self, mock_commit):
        """Registered student can submit to active contests"""
        patcher, _ = self._mock_judge()
        try:
            self.client.force_authenticate(user=self.student)
            response = self._submit(self.active_contest)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        finally:
            patcher.stop()
