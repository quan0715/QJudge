"""Tests for contest anti-cheat runtime config endpoint."""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant
from apps.users.models import User


class ContestAntiCheatConfigApiTests(APITestCase):
    def setUp(self):
        now = timezone.now()
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@test.com",
            password="pass",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="student",
            email="student@test.com",
            password="pass",
            role="student",
        )
        self.contest = Contest.objects.create(
            name="Config Contest",
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=1),
            owner=self.owner,
            status="published",
            cheat_detection_enabled=True,
            allow_multiple_joins=True,
            max_cheat_warnings=4,
            allow_auto_unlock=True,
            auto_unlock_minutes=7,
            contest_type="paper_exam",
        )
        ContestParticipant.objects.create(contest=self.contest, user=self.student)

    def test_participant_can_fetch_anticheat_config(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("global_defaults", resp.data)
        self.assertIn("contest_settings", resp.data)
        self.assertIn("effective", resp.data)
        self.assertIn("frontend_controlled_settings", resp.data)
        self.assertIn("global", resp.data["frontend_controlled_settings"])
        self.assertIn("contest", resp.data["frontend_controlled_settings"])

        contest_settings = resp.data["contest_settings"]
        self.assertTrue(contest_settings["cheat_detection_enabled"])
        self.assertTrue(contest_settings["allow_multiple_joins"])
        self.assertEqual(contest_settings["max_cheat_warnings"], 4)
        self.assertTrue(contest_settings["allow_auto_unlock"])
        self.assertEqual(contest_settings["auto_unlock_minutes"], 7)
        self.assertEqual(contest_settings["contest_type"], "paper_exam")

        global_setting_keys = {item["key"] for item in resp.data["frontend_controlled_settings"]["global"]}
        contest_setting_keys = {item["key"] for item in resp.data["frontend_controlled_settings"]["contest"]}
        self.assertIn("capture_interval_seconds", global_setting_keys)
        self.assertIn("incident_screenshot_categories", global_setting_keys)
        self.assertIn("presigned_url_ttl_seconds", global_setting_keys)
        self.assertIn("cheat_detection_enabled", contest_setting_keys)
        self.assertIn("max_cheat_warnings", contest_setting_keys)

    def test_anonymous_request_is_rejected(self):
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
