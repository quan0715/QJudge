"""
Tests for contest standings API.

This test file ensures the standings API correctly:
1. Returns problem IDs for all users (required for frontend matching)
2. Hides problem titles from students (security)
3. Shows full problem details to admins/teachers
4. Matches standings problem keys with problems_data IDs
"""
from datetime import timedelta
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from apps.users.models import User
from apps.contests.models import (
    Contest, ContestParticipant, ContestProblem, ExamStatus
)
from apps.problems.models import Problem, TestCase as ProblemTestCase


class StandingsAPITests(APITestCase):
    """Test standings API returns correct data for different user roles."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()

        # Create users with different roles
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
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            password='testpass123',
            role='admin',
            is_staff=True
        )

        # Create active contest with scoreboard visible
        now = timezone.now()
        self.contest = Contest.objects.create(
            name='Test Contest',
            status='active',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            scoreboard_visible_during_contest=True
        )

        # Create problems
        self.problem_a = Problem.objects.create(
            title='Problem A - Secret Title',
            description='Description A',
            owner=self.teacher
        )
        self.problem_b = Problem.objects.create(
            title='Problem B - Secret Title',
            description='Description B',
            owner=self.teacher
        )

        # Add test cases for score calculation
        ProblemTestCase.objects.create(
            problem=self.problem_a,
            input_data='1',
            expected_output='1',
            score=30
        )
        ProblemTestCase.objects.create(
            problem=self.problem_b,
            input_data='2',
            expected_output='2',
            score=70
        )

        # Add problems to contest
        self.contest_problem_a = ContestProblem.objects.create(
            contest=self.contest,
            problem=self.problem_a,
            order=0  # Label: A
        )
        self.contest_problem_b = ContestProblem.objects.create(
            contest=self.contest,
            problem=self.problem_b,
            order=1  # Label: B
        )

        # Register participants
        ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )
        ContestParticipant.objects.create(
            contest=self.contest,
            user=self.teacher,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )

    def get_standings(self, user):
        """Helper to get standings as a specific user."""
        self.client.force_authenticate(user=user)
        url = f'/api/v1/contests/{self.contest.id}/standings/'
        response = self.client.get(url)
        return response

    # ===== Problem ID Visibility Tests =====

    def test_student_can_see_problem_ids(self):
        """
        Students MUST be able to see problem IDs in standings.

        This is required for frontend to match standings data with problems.

        Bug fix: Previously problem IDs were hidden from students, causing
        frontend to fallback to array indices (0, 1, 2...) which didn't match
        the actual problem IDs used as keys in standings data.
        """
        response = self.get_standings(self.student)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems = response.data.get('problems', [])
        self.assertEqual(len(problems), 2)

        # Problem IDs must be present for students
        for problem in problems:
            self.assertIsNotNone(
                problem.get('id'),
                "Problem ID must be present for frontend standings matching"
            )

        # Verify correct IDs are returned
        problem_ids = [p['id'] for p in problems]
        self.assertIn(self.problem_a.id, problem_ids)
        self.assertIn(self.problem_b.id, problem_ids)

    def test_student_cannot_see_problem_titles(self):
        """Students should NOT see problem titles (security)."""
        response = self.get_standings(self.student)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems = response.data.get('problems', [])
        for problem in problems:
            self.assertIsNone(
                problem.get('title'),
                "Problem titles should be hidden from students"
            )

    def test_teacher_can_see_full_problem_details(self):
        """Teachers should see both problem IDs and titles."""
        response = self.get_standings(self.teacher)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems = response.data.get('problems', [])
        self.assertEqual(len(problems), 2)

        for problem in problems:
            self.assertIsNotNone(problem.get('id'))
            self.assertIsNotNone(problem.get('title'))

    def test_admin_can_see_full_problem_details(self):
        """Admins should see both problem IDs and titles."""
        # Add admin to contest
        ContestParticipant.objects.create(
            contest=self.contest,
            user=self.admin,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now()
        )

        response = self.get_standings(self.admin)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems = response.data.get('problems', [])
        for problem in problems:
            self.assertIsNotNone(problem.get('id'))
            self.assertIsNotNone(problem.get('title'))

    # ===== Standings Data Matching Tests =====

    def test_standings_problem_keys_match_problems_data_ids(self):
        """
        The keys in standings[].problems must match the IDs in problems_data.

        This is critical for frontend to correctly display problem statuses.

        Bug fix: Previously students received problems_data with id=None,
        but standings had problem IDs as keys, causing a mismatch.
        """
        response = self.get_standings(self.student)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems_data = response.data.get('problems', [])
        standings = response.data.get('standings', [])

        # Get problem IDs from problems_data
        problem_ids_from_data = set(p['id'] for p in problems_data)

        # Get problem keys from standings
        for standing in standings:
            standing_problem_keys = set(standing.get('problems', {}).keys())

            # All keys in standings should be valid problem IDs
            for key in standing_problem_keys:
                key_int = int(key) if isinstance(key, str) else key
                self.assertIn(
                    key_int,
                    problem_ids_from_data,
                    f"Standings key {key} not in problems_data IDs"
                )

    def test_standings_contains_correct_labels(self):
        """Standings should include correct labels (A, B, C...)."""
        response = self.get_standings(self.student)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems = response.data.get('problems', [])
        labels = [p['label'] for p in problems]

        self.assertIn('A', labels)
        self.assertIn('B', labels)

    # ===== Permission Tests =====

    def test_scoreboard_hidden_when_disabled(self):
        """Students cannot see scoreboard when disabled."""
        # Disable scoreboard visibility
        self.contest.scoreboard_visible_during_contest = False
        self.contest.save()

        response = self.get_standings(self.student)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_can_see_scoreboard_when_disabled(self):
        """Teachers can always see scoreboard."""
        self.contest.scoreboard_visible_during_contest = False
        self.contest.save()

        response = self.get_standings(self.teacher)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_scoreboard_visible_after_contest_ends(self):
        """Scoreboard is visible to all after contest ends."""
        # Set contest to inactive (ended)
        self.contest.status = 'inactive'
        self.contest.scoreboard_visible_during_contest = False
        self.contest.save()

        response = self.get_standings(self.student)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class StandingsDataIntegrityTests(APITestCase):
    """Test standings data integrity and calculation correctness."""

    def setUp(self):
        """Set up test data with submissions."""
        self.client = APIClient()

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

        now = timezone.now()
        self.contest = Contest.objects.create(
            name='Test Contest',
            status='active',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            scoreboard_visible_during_contest=True
        )

        self.problem = Problem.objects.create(
            title='Test Problem',
            description='Description',
            owner=self.teacher
        )

        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1',
            expected_output='1',
            score=100
        )

        ContestProblem.objects.create(
            contest=self.contest,
            problem=self.problem,
            order=0
        )

        ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )

    def test_problem_id_is_integer_not_null(self):
        """Problem ID should be a valid integer, never null or undefined."""
        self.client.force_authenticate(user=self.student)
        url = f'/api/v1/contests/{self.contest.id}/standings/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        problems = response.data.get('problems', [])
        self.assertGreater(len(problems), 0)

        for problem in problems:
            problem_id = problem.get('id')
            self.assertIsNotNone(problem_id, "Problem ID should not be None")
            self.assertIsInstance(
                problem_id, int, "Problem ID should be an integer"
            )
            self.assertGreater(
                problem_id, 0, "Problem ID should be positive"
            )

    def test_standings_response_structure(self):
        """Verify the standings response has correct structure."""
        self.client.force_authenticate(user=self.student)
        url = f'/api/v1/contests/{self.contest.id}/standings/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check top-level structure
        self.assertIn('problems', response.data)
        self.assertIn('standings', response.data)

        # Check problems structure
        problems = response.data['problems']
        self.assertIsInstance(problems, list)
        for p in problems:
            self.assertIn('id', p)
            self.assertIn('label', p)
            self.assertIn('order', p)
            self.assertIn('score', p)

        # Check standings structure
        standings = response.data['standings']
        self.assertIsInstance(standings, list)
        for s in standings:
            self.assertIn('rank', s)
            self.assertIn('solved', s)
            self.assertIn('total_score', s)
            self.assertIn('time', s)
            self.assertIn('problems', s)


class StandingsTestSubmissionFilterTests(APITestCase):
    """
    Test that standings correctly exclude test submissions (is_test=True).
    
    Bug fix: Previously, standings included test submissions in score calculation,
    causing scores to differ from individual reports which correctly excluded them.
    """

    def setUp(self):
        """Set up test data with both normal and test submissions."""
        from apps.submissions.models import Submission
        
        self.client = APIClient()

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

        now = timezone.now()
        self.contest = Contest.objects.create(
            name='Test Contest',
            status='active',
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            scoreboard_visible_during_contest=True
        )

        # Create problem with 100 points
        self.problem = Problem.objects.create(
            title='Test Problem',
            description='Description',
            owner=self.teacher
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data='1',
            expected_output='1',
            score=100
        )

        ContestProblem.objects.create(
            contest=self.contest,
            problem=self.problem,
            order=0
        )

        ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now
        )

        # Create a test submission with AC (should be excluded)
        self.test_submission = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
            code='print("test")',
            language='python',
            status='AC',
            score=100,
            source_type='contest',
            is_test=True  # This is a test submission
        )

        # Create a normal submission with partial score (should be counted)
        self.normal_submission = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
            code='print("partial")',
            language='python',
            status='WA',
            score=50,
            source_type='contest',
            is_test=False  # This is a normal submission
        )

    def test_standings_excludes_test_submissions(self):
        """
        Standings should exclude test submissions from score calculation.
        
        Student has:
        - Test submission: AC with 100 points (should be EXCLUDED)
        - Normal submission: WA with 50 points (should be COUNTED)
        
        Expected total_score: 50 (not 100)
        """
        self.client.force_authenticate(user=self.student)
        url = f'/api/v1/contests/{self.contest.id}/standings/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        
        standings = response.data.get('standings', [])
        student_standing = next(
            (s for s in standings if s['user']['id'] == self.student.id), 
            None
        )
        
        self.assertIsNotNone(student_standing)
        
        # Score should be 50 (from normal submission), not 100 (from test submission)
        self.assertEqual(
            student_standing['total_score'], 
            50,
            "Standings should exclude test submissions. "
            f"Expected 50, got {student_standing['total_score']}"
        )
        
        # solved count should be 0 (no AC in normal submissions)
        self.assertEqual(
            student_standing['solved'],
            0,
            "Solved count should only count normal AC submissions"
        )

    def test_standings_counts_normal_ac_correctly(self):
        """
        When student has AC in normal submission, it should be counted.
        """
        from apps.submissions.models import Submission
        
        # Add a normal AC submission
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            contest=self.contest,
            code='print("ac")',
            language='python',
            status='AC',
            score=100,
            source_type='contest',
            is_test=False
        )
        
        self.client.force_authenticate(user=self.student)
        url = f'/api/v1/contests/{self.contest.id}/standings/'
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        
        standings = response.data.get('standings', [])
        student_standing = next(
            (s for s in standings if s['user']['id'] == self.student.id), 
            None
        )
        
        # Now should have full score from normal AC
        self.assertEqual(student_standing['total_score'], 100)
        self.assertEqual(student_standing['solved'], 1)

    def test_participant_serializer_excludes_test_submissions(self):
        """
        ContestParticipantSerializer.get_total_score should also exclude test submissions.
        """
        from apps.contests.serializers import ContestParticipantSerializer
        
        participant = ContestParticipant.objects.get(
            contest=self.contest, 
            user=self.student
        )
        
        serializer = ContestParticipantSerializer(participant)
        total_score = serializer.data.get('total_score')
        
        # Should be 50 (normal submission), not 100 (test submission)
        self.assertEqual(
            total_score, 
            50,
            "Serializer should exclude test submissions from score calculation"
        )
