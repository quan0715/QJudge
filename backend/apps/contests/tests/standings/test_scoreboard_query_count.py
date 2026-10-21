"""ScoreboardService must not issue queries per submission or per participant.

The classroom gradebook runs one scoreboard per bound coding contest, so any
per-row query here is multiplied by the number of contests on the page.
"""
from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.services.scoreboard import ScoreboardScope, ScoreboardService
from apps.contests.tests import bind_problem_to_contest
from apps.problems.models import CodingProblem
from apps.submissions.models import Submission
from apps.users.models import User


class ScoreboardQueryCountTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.teacher = User.objects.create_user(
            username="sb-teacher", email="sb-teacher@test.com", password="pw", role="teacher"
        )
        cls.problem = CodingProblem.objects.create(slug="sb-problem", created_by=cls.teacher)

    def _build_contest(self, *, label: str, participants: int, submissions_per_user: int) -> Contest:
        now = timezone.now()
        contest = Contest.objects.create(
            name=f"Scoreboard {label}",
            status="published",
            start_time=now - timedelta(hours=2),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
        )
        bind_problem_to_contest(contest, self.problem, order=0, score=100)
        for index in range(participants):
            user = User.objects.create_user(
                username=f"sb-{label}-{index}",
                email=f"sb-{label}-{index}@test.com",
                password="pw",
                role="student",
            )
            ContestParticipant.objects.create(
                contest=contest,
                user=user,
                exam_status=ExamStatus.IN_PROGRESS,
                started_at=now - timedelta(hours=1),
            )
            for attempt in range(submissions_per_user):
                Submission.objects.create(
                    user=user,
                    problem=self.problem,
                    contest=contest,
                    code="print(1)",
                    language="python",
                    status="WA",
                    score=attempt,
                    created_at=now - timedelta(minutes=30 - attempt),
                )
        return contest

    def _count_queries(self, contest: Contest) -> int:
        scope = ScoreboardScope(viewer=self.teacher, mode="export")
        with CaptureQueriesContext(connection) as captured:
            result = ScoreboardService.calculate(contest, scope)
        self.assertEqual(len(result.standings), contest.registrations.count())
        return len(captured)

    def test_query_count_does_not_grow_with_submissions(self):
        few = self._build_contest(label="few", participants=3, submissions_per_user=1)
        many = self._build_contest(label="many", participants=3, submissions_per_user=6)

        self.assertEqual(self._count_queries(many), self._count_queries(few))

    def test_query_count_does_not_grow_with_participants(self):
        small = self._build_contest(label="small", participants=2, submissions_per_user=1)
        large = self._build_contest(label="large", participants=6, submissions_per_user=1)

        self.assertEqual(self._count_queries(large), self._count_queries(small))
