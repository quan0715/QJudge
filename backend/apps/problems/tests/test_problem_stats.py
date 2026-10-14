from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.contests.models import Contest
from apps.problems.models import CodingProblem, LanguageConfig, Tag
from apps.question_bank.models import QuestionAsset
from apps.submissions.models import Submission

LIST_URL = "/api/v1/management/problems/"


class ProblemSubmissionStatsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(
            username="stats_admin", email="stats_admin@example.com", password="pw",
            role="admin", is_staff=True,
        )
        cls.student = User.objects.create_user(
            username="stats_student", email="stats_student@example.com", password="pw",
            role="student",
        )
        cls.contest = Contest.objects.create(name="Stats", owner=cls.admin, status="published")
        cls.tag_array = Tag.objects.create(name="Array", slug="array")
        cls.tag_dp = Tag.objects.create(name="DP", slug="dp")

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def make_problem(self, slug, statuses=(), *, contest=None):
        asset = QuestionAsset.objects.create(
            owner=self.admin, asset_type=QuestionAsset.AssetType.CODING,
            title=slug, payload={"difficulty": "easy"},
        )
        problem = CodingProblem.objects.create(slug=slug, created_by=self.admin, question_asset=asset)
        problem.tags.add(self.tag_array, self.tag_dp)
        LanguageConfig.objects.create(problem=problem, language="cpp", template_code="")
        for status in statuses:
            Submission.objects.create(
                user=self.student, problem=problem, language="cpp", code="",
                status=status, contest=contest or self.contest,
            )
        return problem

    def rows_by_slug(self, query=""):
        response = self.client.get(f"{LIST_URL}{query}")
        self.assertEqual(response.status_code, 200, response.data)
        return {row["slug"]: row for row in response.data["results"]}

    def test_list_counts_submissions_across_contests_without_tag_join_inflation(self):
        problem = self.make_problem("mixed", ["AC", "WA", "TLE"])
        Submission.objects.create(
            user=self.student, problem=problem, language="cpp", code="", status="AC",
        )
        self.make_problem("untried")

        rows = self.rows_by_slug("?tags=array,dp")

        mixed = rows["mixed"]
        self.assertEqual((mixed["submission_count"], mixed["accepted_count"]), (4, 2))
        self.assertEqual(mixed["acceptance_rate"], 50.0)
        self.assertNotIn("wa_count", mixed)
        untried = rows["untried"]
        self.assertEqual((untried["submission_count"], untried["acceptance_rate"]), (0, 0.0))

    def test_list_orders_by_read_time_stats(self):
        self.make_problem("low", ["AC", "WA", "WA", "WA"])
        self.make_problem("high", ["AC", "AC", "WA"])
        self.make_problem("none")

        response = self.client.get(f"{LIST_URL}?ordering=-acceptance_rate")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([r["slug"] for r in response.data["results"]], ["high", "low", "none"])

        response = self.client.get(f"{LIST_URL}?ordering=-submission_count")
        self.assertEqual([r["slug"] for r in response.data["results"]], ["low", "high", "none"])

    def test_list_query_count_does_not_grow_with_problems(self):
        def count_list_queries():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.client.get(LIST_URL).status_code, 200)
            return len(ctx.captured_queries)

        for index in range(2):
            self.make_problem(f"p{index}", ["AC", "WA"])
        baseline = count_list_queries()
        for index in range(2, 8):
            self.make_problem(f"p{index}", ["AC", "WA"])

        self.assertEqual(count_list_queries(), baseline)

    def test_statistics_without_contest_counts_actual_submissions(self):
        problem = self.make_problem("stat", ["AC", "WA", "WA"])
        other = Contest.objects.create(name="Other", owner=self.admin, status="published")
        Submission.objects.create(
            user=self.student, problem=problem, language="cpp", code="", status="CE", contest=other,
        )

        response = self.client.get(f"{LIST_URL}{problem.id}/statistics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["submission_count"], 4)
        self.assertEqual(response.data["accepted_count"], 1)
        self.assertEqual(response.data["ac_rate"], 25.0)
        self.assertEqual(response.data["status_counts"], {"AC": 1, "WA": 2, "CE": 1})
