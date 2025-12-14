"""
Tests for inactive contest access control.

These tests verify that:
1. Inactive contests return 404 for non-privileged users
2. Only owners/admins can access inactive contests
3. Problem structure is hidden for inactive contests
4. Problem structure is hidden before contest starts
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import Contest, ContestParticipant, ContestProblem
from apps.problems.models import Problem

User = get_user_model()


class InactiveContestAccessTests(APITestCase):
    """Test access control for inactive contests."""

    def setUp(self):
        """Set up test data."""
        # Create users with different roles
        self.student = User.objects.create_user(
            username='student',
            email='student@example.com',
            password='password123',
            role='student'
        )
        self.teacher = User.objects.create_user(
            username='teacher',
            email='teacher@example.com',
            password='password123',
            role='teacher'
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='password123',
            role='admin',
            is_staff=True
        )
        self.another_student = User.objects.create_user(
            username='another_student',
            email='another@example.com',
            password='password123',
            role='student'
        )

        # Create an inactive contest owned by teacher
        self.inactive_contest = Contest.objects.create(
            name='Inactive Contest',
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.teacher,
            visibility='public',
            status='inactive'  # Key: inactive status
        )

        # Create an active contest for comparison
        self.active_contest = Contest.objects.create(
            name='Active Contest',
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.teacher,
            visibility='public',
            status='active'
        )

        # Create a problem and add to both contests
        self.problem = Problem.objects.create(
            title='Test Problem',
            slug='test-problem-inactive',
            difficulty='easy',
            created_by=self.teacher
        )
        ContestProblem.objects.create(
            contest=self.inactive_contest,
            problem=self.problem,
            order=0
        )
        ContestProblem.objects.create(
            contest=self.active_contest,
            problem=self.problem,
            order=0
        )

        # Register student as participant in inactive contest
        ContestParticipant.objects.create(
            contest=self.inactive_contest,
            user=self.student
        )
        # Register student as participant in active contest too
        ContestParticipant.objects.create(
            contest=self.active_contest,
            user=self.student
        )

    # =========================================================================
    # Test 1: Inactive contest access - 404 for non-privileged users
    # =========================================================================

    def test_student_cannot_access_inactive_contest(self):
        """Student should get 404 when accessing inactive contest."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_participant_cannot_access_inactive_contest(self):
        """Even participants should get 404 for inactive contests."""
        # Student is already a participant (set up in setUp)
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_participant_cannot_access_inactive_contest(self):
        """Non-participant students should get 404 for inactive contests."""
        self.client.force_authenticate(user=self.another_student)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_cannot_access_inactive_contest(self):
        """Anonymous users should get 404 for inactive contests."""
        # No authentication
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # Test 2: Privileged users CAN access inactive contests
    # =========================================================================

    def test_owner_can_access_inactive_contest(self):
        """Contest owner should be able to access inactive contest."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Inactive Contest')

    def test_admin_can_access_inactive_contest(self):
        """Admin should be able to access inactive contest."""
        self.client.force_authenticate(user=self.admin)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Inactive Contest')

    def test_contest_admin_can_access_inactive_contest(self):
        """Contest co-admin should be able to access inactive contest."""
        # Add another_student as contest admin
        self.inactive_contest.admins.add(self.another_student)

        self.client.force_authenticate(user=self.another_student)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # =========================================================================
    # Test 3: Active contest should be accessible
    # =========================================================================

    def test_student_can_access_active_contest(self):
        """Student should be able to access active contest."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.active_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Active Contest')

    def test_anonymous_can_access_active_public_contest(self):
        """Anonymous users should be able to access active public contest."""
        url = reverse('contests:contest-detail', args=[self.active_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # =========================================================================
    # Test 4: Problem structure visibility
    # =========================================================================

    def test_owner_sees_problems_in_inactive_contest(self):
        """Owner should see problem structure in inactive contest."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-detail', args=[self.inactive_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data['problems']), 0)

    def test_student_sees_problems_in_active_contest(self):
        """Student should see problem structure in active contest (after start)."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.active_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Active contest has started, so problems should be visible
        self.assertGreater(len(response.data['problems']), 0)

    # =========================================================================
    # Test 5: Contest list filtering
    # =========================================================================

    def test_inactive_contests_not_in_public_list(self):
        """Inactive contests should not appear in public contest list."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check that inactive contest is not in the list
        contest_ids = [c['id'] for c in response.data['results']]
        self.assertNotIn(self.inactive_contest.id, contest_ids)
        # But active contest should be there
        self.assertIn(self.active_contest.id, contest_ids)

    def test_owner_sees_inactive_contest_in_list(self):
        """Owner should see their inactive contests in list."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Owner should see inactive contest
        contest_ids = [c['id'] for c in response.data['results']]
        self.assertIn(self.inactive_contest.id, contest_ids)


class ContestNotStartedAccessTests(APITestCase):
    """Test access control for contests that haven't started yet."""

    def setUp(self):
        """Set up test data."""
        self.student = User.objects.create_user(
            username='student',
            email='student@example.com',
            password='password123',
            role='student'
        )
        self.teacher = User.objects.create_user(
            username='teacher',
            email='teacher@example.com',
            password='password123',
            role='teacher'
        )

        # Create an active contest that hasn't started yet
        self.future_contest = Contest.objects.create(
            name='Future Contest',
            start_time=timezone.now() + timedelta(hours=2),  # Starts in 2 hours
            end_time=timezone.now() + timedelta(hours=4),
            owner=self.teacher,
            visibility='public',
            status='active'
        )

        # Create a problem and add to contest
        self.problem = Problem.objects.create(
            title='Future Problem',
            slug='future-problem-test',
            difficulty='easy',
            created_by=self.teacher
        )
        ContestProblem.objects.create(
            contest=self.future_contest,
            problem=self.problem,
            order=0
        )

        # Register student
        ContestParticipant.objects.create(
            contest=self.future_contest,
            user=self.student
        )

    def test_student_cannot_see_problems_before_start(self):
        """Student should not see problem structure before contest starts."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.future_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Problems should be empty list before contest starts
        self.assertEqual(len(response.data['problems']), 0)

    def test_owner_can_see_problems_before_start(self):
        """Owner should see problem structure before contest starts."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-detail', args=[self.future_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Owner should see problems even before start
        self.assertGreater(len(response.data['problems']), 0)

    def test_student_can_access_future_contest(self):
        """Student should be able to access future active contest (but not see problems)."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.future_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Future Contest')
