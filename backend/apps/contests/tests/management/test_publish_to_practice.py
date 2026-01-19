from rest_framework import status
from rest_framework.test import APITestCase
from django.urls import reverse

from apps.contests.models import Contest, ContestProblem
from apps.problems.models import Problem, ProblemTranslation, TestCase as ProblemTestCase
from apps.users.models import User


class ContestPublishToPracticeTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teacher1",
            email="teacher1@example.com",
            password="testpass123",
            role="teacher",
        )
        self.contest = Contest.objects.create(
            name="Archived Contest",
            owner=self.teacher,
            status="archived",
        )

        self.problem = Problem.objects.create(
            title="Contest Problem",
            slug="contest-problem",
            is_visible=False,
            is_practice_visible=False,
            created_in_contest=self.contest,
            created_by=self.teacher,
        )
        ProblemTranslation.objects.create(
            problem=self.problem,
            language="zh-TW",
            title="競賽題目",
            description="描述",
            input_description="輸入",
            output_description="輸出",
            hint="提示",
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1 1",
            output_data="2",
            is_sample=True,
            score=10,
            order=1,
        )
        ContestProblem.objects.create(
            contest=self.contest,
            problem=self.problem,
            order=0,
        )

    def test_publish_requires_archived(self):
        contest = Contest.objects.create(
            name="Live Contest",
            owner=self.teacher,
            status="published",
        )
        ContestProblem.objects.create(contest=contest, problem=self.problem, order=0)
        url = reverse("contests:contest-publish-problems-to-practice", args=[contest.id])

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_publish_creates_practice_copy(self):
        url = reverse("contests:contest-publish-problems-to-practice", args=[self.contest.id])

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        created_ids = response.data.get("created_problem_ids", [])
        self.assertEqual(len(created_ids), 1)

        cloned = Problem.objects.get(id=created_ids[0])
        self.assertTrue(cloned.is_practice_visible)
        self.assertTrue(cloned.is_visible)
        self.assertEqual(cloned.created_in_contest_id, self.contest.id)
        self.assertEqual(cloned.origin_problem_id, self.problem.id)
        self.assertTrue(cloned.display_id.startswith("P"))
        self.assertTrue(
            cloned.translations.filter(language="zh-TW", title="競賽題目").exists()
        )
        self.assertTrue(cloned.test_cases.filter(is_sample=True).exists())

    def test_publish_skips_existing_copy(self):
        url = reverse("contests:contest-publish-problems-to-practice", args=[self.contest.id])

        self.client.force_authenticate(user=self.teacher)
        first = self.client.post(url, {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(url, {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data.get("created_problem_ids"), [])
        self.assertEqual(second.data.get("skipped_problem_ids"), [self.problem.id])

    def test_publish_with_problem_ids_filter(self):
        second_problem = Problem.objects.create(
            title="Contest Problem 2",
            slug="contest-problem-2",
            is_visible=False,
            is_practice_visible=False,
            created_in_contest=self.contest,
            created_by=self.teacher,
        )
        ContestProblem.objects.create(
            contest=self.contest,
            problem=second_problem,
            order=1,
        )

        url = reverse("contests:contest-publish-problems-to-practice", args=[self.contest.id])
        payload = {"problem_ids": [self.problem.id]}

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        created_ids = response.data.get("created_problem_ids", [])
        self.assertEqual(len(created_ids), 1)
        self.assertTrue(Problem.objects.filter(id=created_ids[0], origin_problem=self.problem).exists())

    def test_single_problem_publish_endpoint_clones_only_when_archived(self):
        live_contest = Contest.objects.create(
            name="Live Contest",
            owner=self.teacher,
            status="published",
        )
        ContestProblem.objects.create(
            contest=live_contest,
            problem=self.problem,
            order=0,
        )

        # Non-archived contest should be rejected
        url_live = reverse("contests:contest-publish-problem-to-practice", args=[live_contest.id, self.problem.id])
        self.client.force_authenticate(user=self.teacher)
        resp_live = self.client.post(url_live, {}, format="json")
        self.assertEqual(resp_live.status_code, status.HTTP_403_FORBIDDEN)

        # Archived contest should clone
        url = reverse("contests:contest-publish-problem-to-practice", args=[self.contest.id, self.problem.id])
        resp = self.client.post(url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        created_id = resp.data.get("created_problem_id")
        self.assertIsNotNone(created_id)
        self.assertTrue(
            Problem.objects.filter(id=created_id, origin_problem=self.problem, is_practice_visible=True).exists()
        )
