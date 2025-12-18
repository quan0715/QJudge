"""
Tests for draft contest access control.

These tests verify that:
1. Draft contests return 404 for non-privileged users
2. Only owners/admins can access draft contests
3. Problem structure is hidden for draft contests
4. Problem structure is hidden before contest starts
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ContestProblem
from apps.problems.models import Problem

User = get_user_model()


class DraftContestAccessTests(APITestCase):
    """Test access control for draft contests."""

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

        # Create a draft contest owned by teacher
        self.draft_contest = Contest.objects.create(
            name='Draft Contest',
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.teacher,
            visibility='public',
            status='draft'  # Key: draft status
        )

        # Create a published contest for comparison
        self.active_contest = Contest.objects.create(
            name='Active Contest',
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now() + timedelta(hours=2),
            owner=self.teacher,
            visibility='public',
            status='published'
        )

        # Create a problem and add to both contests
        self.problem = Problem.objects.create(
            title='Test Problem',
            slug='test-problem-inactive',
            difficulty='easy',
            created_by=self.teacher
        )
        ContestProblem.objects.create(
            contest=self.draft_contest,
            problem=self.problem,
            order=0
        )
        ContestProblem.objects.create(
            contest=self.active_contest,
            problem=self.problem,
            order=0
        )

        # Register student as participant in draft contest
        ContestParticipant.objects.create(
            contest=self.draft_contest,
            user=self.student
        )
        # Register student as participant in active contest too
        ContestParticipant.objects.create(
            contest=self.active_contest,
            user=self.student
        )

    # =========================================================================
    # Test 1: Draft contest access - 404 for non-privileged users
    # =========================================================================

    def test_student_cannot_access_draft_contest(self):
        """Student should get 404 when accessing draft contest."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_participant_cannot_access_draft_contest(self):
        """Even participants should get 404 for draft contests."""
        # Student is already a participant (set up in setUp)
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_participant_cannot_access_draft_contest(self):
        """Non-participant students should get 404 for draft contests."""
        self.client.force_authenticate(user=self.another_student)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_cannot_access_draft_contest(self):
        """Anonymous users should get 404 for draft contests."""
        # No authentication
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # Test 2: Privileged users CAN access draft contests
    # =========================================================================

    def test_owner_can_access_draft_contest(self):
        """Contest owner should be able to access draft contest."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Draft Contest')

    def test_admin_can_access_draft_contest(self):
        """Admin should be able to access draft contest."""
        self.client.force_authenticate(user=self.admin)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Draft Contest')

    def test_contest_admin_can_access_draft_contest(self):
        """Contest co-admin should be able to access draft contest."""
        # Add another_student as contest admin
        self.draft_contest.admins.add(self.another_student)

        self.client.force_authenticate(user=self.another_student)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
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

    def test_owner_sees_problems_in_draft_contest(self):
        """Owner should see problem structure in draft contest."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-detail', args=[self.draft_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data['problems']), 0)

    def test_registered_student_sees_problems_in_active_contest(self):
        """Registered student should see problem structure in active contest (after start)."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.active_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Active contest has started and student is registered, so problems should be visible
        self.assertGreater(len(response.data['problems']), 0)

    def test_unregistered_student_cannot_see_problems_in_active_contest(self):
        """Unregistered student should NOT see problem structure even in active contest."""
        # another_student is not registered for active_contest
        self.client.force_authenticate(user=self.another_student)
        url = reverse('contests:contest-detail', args=[self.active_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Unregistered user should see empty problems list
        self.assertEqual(len(response.data['problems']), 0)

    def test_anonymous_cannot_see_problems_in_active_contest(self):
        """Anonymous users should NOT see problem structure even in active contest."""
        url = reverse('contests:contest-detail', args=[self.active_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Anonymous user should see empty problems list
        self.assertEqual(len(response.data['problems']), 0)

    # =========================================================================
    # Test 5: Contest list filtering
    # =========================================================================

    def test_draft_contests_not_in_public_list(self):
        """Draft contests should not appear in public contest list."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check that draft contest is not in the list
        contest_ids = [c['id'] for c in response.data['results']]
        self.assertNotIn(self.draft_contest.id, contest_ids)
        # But active contest should be there
        self.assertIn(self.active_contest.id, contest_ids)

    def test_owner_sees_draft_contest_in_manage_list(self):
        """Owner should see their draft contests in manage list."""
        self.client.force_authenticate(user=self.teacher)
        url = f"{reverse('contests:contest-list')}?scope=manage"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Owner should see draft contest
        contest_ids = [c['id'] for c in response.data['results']]
        self.assertIn(self.draft_contest.id, contest_ids)


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
            status='published'
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


class ContestEndedAccessTests(APITestCase):
    """Test access control for contests that have ended."""

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

        # Create an active contest that has already ended
        self.ended_contest = Contest.objects.create(
            name='Ended Contest',
            start_time=timezone.now() - timedelta(hours=4),  # Started 4 hours ago
            end_time=timezone.now() - timedelta(hours=2),    # Ended 2 hours ago
            owner=self.teacher,
            visibility='public',
            status='published'
        )

        # Create a problem and add to contest
        self.problem = Problem.objects.create(
            title='Ended Problem',
            slug='ended-problem-test',
            difficulty='easy',
            created_by=self.teacher
        )
        ContestProblem.objects.create(
            contest=self.ended_contest,
            problem=self.problem,
            order=0
        )

        # Register student
        ContestParticipant.objects.create(
            contest=self.ended_contest,
            user=self.student
        )

    def test_student_can_see_problems_after_end(self):
        """Student should see problem structure after contest ends (read-only)."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.ended_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Problems should still be visible after contest ends
        self.assertGreater(len(response.data['problems']), 0)

    def test_owner_can_see_problems_after_end(self):
        """Owner should see problem structure after contest ends."""
        self.client.force_authenticate(user=self.teacher)
        url = reverse('contests:contest-detail', args=[self.ended_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Owner should see problems even after end
        self.assertGreater(len(response.data['problems']), 0)

    def test_student_can_access_ended_contest(self):
        """Student should be able to access ended contest (read-only)."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.ended_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Ended Contest')


class ArchivedContestAccessTests(APITestCase):
    """Test access control and listing behavior for archived contests."""

    def setUp(self):
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
        self.other_student = User.objects.create_user(
            username='other_student',
            email='other@example.com',
            password='password123',
            role='student'
        )

        self.archived_contest = Contest.objects.create(
            name='Archived Contest',
            start_time=timezone.now() - timedelta(hours=4),
            end_time=timezone.now() - timedelta(hours=2),
            owner=self.teacher,
            visibility='public',
            status='archived'
        )

        ContestParticipant.objects.create(
            contest=self.archived_contest,
            user=self.student
        )

    def test_participant_can_access_archived_contest(self):
        """Participant should be able to access archived contest details."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-detail', args=[self.archived_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_participant_cannot_access_archived_contest(self):
        """Non-participant should not access archived contest details."""
        self.client.force_authenticate(user=self.other_student)
        url = reverse('contests:contest-detail', args=[self.archived_contest.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_archived_contest_not_in_public_list(self):
        """Archived contests should not appear in public contest list."""
        self.client.force_authenticate(user=self.student)
        url = reverse('contests:contest-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contest_ids = [c['id'] for c in response.data['results']]
        self.assertNotIn(self.archived_contest.id, contest_ids)

    def test_archived_contest_visible_in_participated_list(self):
        """Archived contests should appear in participated contest list."""
        self.client.force_authenticate(user=self.student)
        url = f"{reverse('contests:contest-list')}?scope=participated"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contest_ids = [c['id'] for c in response.data['results']]
        self.assertIn(self.archived_contest.id, contest_ids)
