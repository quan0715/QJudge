"""The service status panel must stay operator-only and survive dead probes."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.services.service_status import (
    build_service_status_report,
    collect_component_statuses,
)

User = get_user_model()

COMPONENTS = {"database", "cache", "celery", "ai_service", "integrity_resident"}


class ServiceStatusAccessTests(APITestCase):
    def setUp(self):
        self.url = reverse("service-status")
        self.admin = User.objects.create_user(
            username="root", email="root@example.com", password="password",
            is_staff=True, is_superuser=True, role="admin",
        )
        self.teacher = User.objects.create_user(
            username="teacher", email="teacher@example.com", password="password",
            role="teacher",
        )

    def test_requires_authentication(self):
        self.assertIn(
            self.client.get(self.url).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_a_teacher_cannot_read_platform_service_status(self):
        self.client.force_authenticate(user=self.teacher)

        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)

    def test_platform_admin_gets_every_component(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {component["id"] for component in response.data["components"]}, COMPONENTS
        )
        self.assertIn("live_run_count", response.data["integrity"])


class ServiceStatusProbeTests(APITestCase):
    def test_a_dead_dependency_is_reported_not_raised(self):
        with patch(
            "apps.core.services.service_status._probe_http",
            side_effect=OSError("connection refused"),
        ):
            components = {c.id: c for c in collect_component_statuses()}

        self.assertEqual(components["ai_service"].status, "down")
        self.assertIn("connection refused", components["ai_service"].detail)
        # An unrelated probe must still report its own result.
        self.assertEqual(components["database"].status, "up")

    def test_every_component_carries_a_latency_reading(self):
        for component in collect_component_statuses():
            self.assertIsInstance(component.latency_ms, int)

    def test_report_survives_when_every_probe_fails(self):
        with patch(
            "apps.core.services.service_status._probe_database",
            side_effect=RuntimeError("db gone"),
        ), patch(
            "apps.core.services.service_status._probe_cache",
            side_effect=RuntimeError("cache gone"),
        ), patch(
            "apps.core.services.service_status._probe_celery",
            side_effect=RuntimeError("broker gone"),
        ), patch(
            "apps.core.services.service_status._probe_http",
            side_effect=RuntimeError("http gone"),
        ):
            report = build_service_status_report()

        self.assertTrue(
            all(component["status"] == "down" for component in report["components"])
        )
        self.assertIn("generated_at", report)
