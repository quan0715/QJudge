from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.problems.models import Problem


User = get_user_model()


class ProblemDiscussionAPITests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.teacher = User.objects.create_user(
            username="teacher",
            email="teacher@example.com",
            password="password",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="student",
            email="student@example.com",
            password="password",
            role="student",
        )
        self.other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="password",
            role="student",
        )
        self.problem = Problem.objects.create(
            title="Sample Problem",
            slug="sample-problem",
            difficulty="easy",
            is_practice_visible=True,
            created_by=self.teacher,
        )

    def test_create_discussion_requires_authentication(self):
        response = self.client.post(
            f"/api/v1/problems/{self.problem.id}/discussions/",
            {"title": "Hello", "content": "World"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_and_list_discussions(self):
        self.client.force_authenticate(self.student)
        create_resp = self.client.post(
            f"/api/v1/problems/{self.problem.id}/discussions/",
            {"title": "Q1", "content": "My question"},
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        data = create_resp.data
        self.assertFalse(data["is_deleted"])
        self.assertEqual(data["comments_count"], 0)
        self.assertEqual(data["user"]["id"], self.student.id)

        list_resp = self.client.get(
            f"/api/v1/problems/{self.problem.id}/discussions/"
        )
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data if isinstance(list_resp.data, list) else list_resp.data.get("results", [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Q1")
        self.assertFalse(results[0]["is_deleted"])

    def test_owner_can_soft_delete_discussion(self):
        self.client.force_authenticate(self.student)
        create_resp = self.client.post(
            f"/api/v1/problems/{self.problem.id}/discussions/",
            {"title": "Q1", "content": "My question"},
            format="json",
        )
        discussion_id = create_resp.data["id"]

        delete_resp = self.client.delete(
            f"/api/v1/problems/problem-discussions/{discussion_id}/"
        )
        self.assertEqual(delete_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(delete_resp.data["is_deleted"])

        detail_resp = self.client.get(
            f"/api/v1/problems/problem-discussions/{discussion_id}/"
        )
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(detail_resp.data["is_deleted"])

        list_resp = self.client.get(
            f"/api/v1/problems/{self.problem.id}/discussions/"
        )
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data if isinstance(list_resp.data, list) else list_resp.data.get("results", [])
        self.assertTrue(results[0]["is_deleted"])

    def test_other_user_cannot_delete_discussion(self):
        self.client.force_authenticate(self.student)
        create_resp = self.client.post(
            f"/api/v1/problems/{self.problem.id}/discussions/",
            {"title": "Q1", "content": "My question"},
            format="json",
        )
        discussion_id = create_resp.data["id"]

        self.client.force_authenticate(self.other)
        delete_resp = self.client.delete(
            f"/api/v1/problems/problem-discussions/{discussion_id}/"
        )
        self.assertEqual(delete_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_comment_create_list_and_soft_delete(self):
        self.client.force_authenticate(self.student)
        discussion_id = self.client.post(
            f"/api/v1/problems/{self.problem.id}/discussions/",
            {"title": "Q1", "content": "My question"},
            format="json",
        ).data["id"]

        comment_resp = self.client.post(
            f"/api/v1/problems/problem-discussions/{discussion_id}/comments/",
            {"content": "first reply"},
            format="json",
        )
        self.assertEqual(comment_resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(comment_resp.data["is_deleted"])

        list_resp = self.client.get(
            f"/api/v1/problems/problem-discussions/{discussion_id}/comments/"
        )
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        comments = list_resp.data if isinstance(list_resp.data, list) else list_resp.data.get("results", [])
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0]["content"], "first reply")

        comment_id = comment_resp.data["id"]
        delete_resp = self.client.delete(
            f"/api/v1/problems/problem-discussion-comments/{comment_id}/"
        )
        self.assertEqual(delete_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(delete_resp.data["is_deleted"])

        list_resp = self.client.get(
            f"/api/v1/problems/problem-discussions/{discussion_id}/comments/"
        )
        comments = list_resp.data if isinstance(list_resp.data, list) else list_resp.data.get("results", [])
        self.assertTrue(comments[0]["is_deleted"])
