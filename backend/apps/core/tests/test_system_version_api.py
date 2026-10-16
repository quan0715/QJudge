"""The upgrade endpoints are platform-admin only and report an absent agent instead of failing."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.services.deploy_agent import AgentBusy, AgentTargetNotLatest, AgentUnavailable

User = get_user_model()

VIEWS = "apps.core.views.system_version"
UNREACHABLE = AgentUnavailable("unreachable", "connection refused")


def first_error(response):
    """The single error of a project error envelope."""
    return response.data["errors"][0]


class SystemVersionApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="root", email="root@example.com", password="password",
            is_staff=True, is_superuser=True, role="admin",
        )
        self.teacher = User.objects.create_user(
            username="teacher", email="teacher@example.com", password="password",
            role="teacher",
        )
        self.client.force_authenticate(user=self.admin)

    def test_teacher_is_forbidden_everywhere(self):
        self.client.force_authenticate(user=self.teacher)

        for name, method in (
            ("system-version", self.client.get),
            ("system-version-check", self.client.post),
            ("system-upgrade", self.client.post),
            ("system-ingress", self.client.get),
        ):
            with self.subTest(name=name):
                self.assertEqual(method(reverse(name)).status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_is_rejected_everywhere(self):
        self.client.force_authenticate(user=None)

        for name, method in (
            ("system-version", self.client.get),
            ("system-version-check", self.client.post),
            ("system-upgrade", self.client.post),
            ("system-ingress", self.client.get),
        ):
            with self.subTest(name=name):
                self.assertIn(
                    method(reverse(name)).status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    @override_settings(QJUDGE_AGENT_URL="")
    def test_admin_sees_unsupported_without_an_agent(self):
        response = self.client.get(reverse("system-version"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["agent"], "unsupported")

    def test_version_merges_the_agent_status(self):
        agent_status = {"version": {"current": "a" * 40}, "job": None, "log": "", "external_busy": False}
        with patch(f"{VIEWS}.agent_status", return_value=agent_status):
            response = self.client.get(reverse("system-version"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"agent": "ok", **agent_status})

    def test_version_reports_an_unreachable_agent_with_200(self):
        with patch(f"{VIEWS}.agent_status", side_effect=UNREACHABLE):
            response = self.client.get(reverse("system-version"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"agent": "unreachable", "detail": "connection refused"})

    def test_check_returns_the_agent_answer(self):
        answer = {"latest": {"sha": "b" * 40}, "releases": [], "update_available": True}
        with patch(f"{VIEWS}.agent_check_updates", return_value=answer):
            response = self.client.post(reverse("system-version-check"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, answer)

    def test_unavailable_agent_returns_503_on_check(self):
        with patch(f"{VIEWS}.agent_check_updates", side_effect=UNREACHABLE):
            response = self.client.post(reverse("system-version-check"))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(first_error(response)["code"], "agent_unavailable")
        self.assertEqual(
            first_error(response)["details"], {"agent": "unreachable", "detail": "connection refused"}
        )
        self.assertIn("request_id", response.data["meta"])

    def test_upgrade_uses_the_signed_in_username(self):
        with patch(f"{VIEWS}.agent_start_upgrade", return_value={"id": "j"}) as start:
            response = self.client.post(
                reverse("system-upgrade"),
                {"target": "b" * 40, "triggered_by": "someone-else"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data, {"id": "j"})
        start.assert_called_once_with("b" * 40, "root")

    def test_upgrade_requires_a_target(self):
        with patch(f"{VIEWS}.agent_start_upgrade") as start:
            for body in ({}, {"target": ""}, {"target": None}):
                with self.subTest(body=body):
                    response = self.client.post(reverse("system-upgrade"), body, format="json")
                    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                    self.assertEqual(first_error(response)["code"], "validation_error")
                    self.assertEqual(first_error(response)["field"], "target")
        start.assert_not_called()

    def test_busy_agent_returns_409(self):
        with patch(f"{VIEWS}.agent_start_upgrade", side_effect=AgentBusy()):
            response = self.client.post(reverse("system-upgrade"), {"target": "b" * 40}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(first_error(response)["code"], "agent_busy")

    def test_stale_target_returns_400_with_the_latest_sha(self):
        with patch(f"{VIEWS}.agent_start_upgrade", side_effect=AgentTargetNotLatest("c" * 40)):
            response = self.client.post(reverse("system-upgrade"), {"target": "b" * 40}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(first_error(response)["code"], "not_latest")
        self.assertEqual(first_error(response)["details"], {"latest": "c" * 40})

    def test_upgrade_with_an_unavailable_agent_returns_503(self):
        with patch(f"{VIEWS}.agent_start_upgrade", side_effect=UNREACHABLE):
            response = self.client.post(reverse("system-upgrade"), {"target": "b" * 40}, format="json")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(first_error(response)["code"], "agent_unavailable")
        self.assertEqual(first_error(response)["details"]["agent"], "unreachable")

    @override_settings(QJUDGE_AGENT_URL="")
    def test_check_and_upgrade_without_an_agent_name_it_unsupported(self):
        for name, body in (("system-version-check", None), ("system-upgrade", {"target": "b" * 40})):
            with self.subTest(name=name):
                response = self.client.post(reverse(name), body, format="json")

                self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
                self.assertEqual(first_error(response)["details"]["agent"], "unsupported")

    def test_ingress_lists_entries(self):
        entries = [{"id": "web", "ok": True}]
        with patch(f"{VIEWS}.agent_ingress", return_value=entries):
            response = self.client.get(reverse("system-ingress"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"agent": "ok", "entries": entries})

    @override_settings(QJUDGE_AGENT_URL="")
    def test_ingress_reports_an_absent_agent_with_200(self):
        response = self.client.get(reverse("system-ingress"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["agent"], "unsupported")
