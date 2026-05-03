"""Tests for contest anti-cheat runtime config endpoint."""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, ClassroomContest
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
            screen_share_recovery_grace_ms=30_000,
        )
        ContestParticipant.objects.create(contest=self.contest, user=self.student)

    def test_participant_can_fetch_anticheat_config(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("global_defaults", resp.data)
        self.assertIn("contest_settings", resp.data)
        self.assertIn("effective", resp.data)
        self.assertIn("device_policy", resp.data)
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
        self.assertIn("warning_timeout_seconds", contest_settings)
        self.assertEqual(contest_settings["warning_timeout_seconds"], 20)
        self.assertIn("screen_share_recovery_grace_ms", contest_settings)
        self.assertEqual(contest_settings["screen_share_recovery_grace_ms"], 30_000)
        self.assertIn("anticheat_device_policy", contest_settings)
        self.assertEqual(resp.data["effective"]["screen_share_recovery_grace_ms"], 30_000)

        device_policy = resp.data["device_policy"]
        self.assertIn("desktop", device_policy)
        self.assertIn("tablet", device_policy)
        self.assertIn("sources", device_policy["desktop"])
        self.assertIn("screen_share", device_policy["desktop"]["sources"])
        self.assertIn("detectors", device_policy["tablet"])
        self.assertIn("viewport_integrity", device_policy["tablet"]["detectors"])
        self.assertNotIn("required", device_policy["desktop"]["sources"]["screen_share"])
        self.assertNotIn("required", device_policy["desktop"]["sources"]["webcam"])
        self.assertNotIn("required", device_policy["tablet"]["sources"]["screen_share"])
        self.assertNotIn("required", device_policy["tablet"]["sources"]["webcam"])

        global_setting_keys = {item["key"] for item in resp.data["frontend_controlled_settings"]["global"]}
        contest_setting_keys = {item["key"] for item in resp.data["frontend_controlled_settings"]["contest"]}
        self.assertIn("capture_interval_seconds", global_setting_keys)
        self.assertNotIn("capture_upload_max_retries", resp.data["global_defaults"])
        self.assertNotIn("capture_upload_max_retries", resp.data["effective"])
        self.assertNotIn("capture_upload_max_retries", global_setting_keys)
        self.assertIn("incident_screenshot_categories", global_setting_keys)
        self.assertIn("presigned_url_ttl_seconds", global_setting_keys)
        self.assertIn("cheat_detection_enabled", contest_setting_keys)
        self.assertIn("max_cheat_warnings", contest_setting_keys)
        self.assertIn("warning_timeout_seconds", contest_setting_keys)
        self.assertIn("screen_share_recovery_grace_ms", contest_setting_keys)
        self.assertIn("anticheat_device_policy", contest_setting_keys)

    def test_contest_participant_can_fetch_anticheat_config_when_classroom_bound(self):
        classroom = Classroom.objects.create(
            name="Config Room",
            owner=self.owner,
            invite_code="CFGROOM1",
        )
        ClassroomContest.objects.create(classroom=classroom, contest=self.contest)

        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("effective", resp.data)

    def test_owner_can_update_screen_share_recovery_grace_and_runtime_uses_latest_value(self):
        self.client.force_authenticate(user=self.student)
        first = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["effective"]["screen_share_recovery_grace_ms"], 30_000)

        self.client.force_authenticate(user=self.owner)
        patch = self.client.patch(
            f"/api/v1/contests/{self.contest.id}/",
            {"screen_share_recovery_grace_ms": 45_000},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)

        self.contest.refresh_from_db()
        self.assertEqual(self.contest.screen_share_recovery_grace_ms, 45_000)

        self.client.force_authenticate(user=self.student)
        second = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["contest_settings"]["screen_share_recovery_grace_ms"], 45_000)
        self.assertEqual(second.data["effective"]["screen_share_recovery_grace_ms"], 45_000)

    def test_anonymous_request_is_rejected(self):
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_legacy_required_field_is_ignored_in_response(self):
        self.contest.anticheat_device_policy = {
            "desktop": {
                "enabled": True,
                "sources": {
                    "screen_share": {
                        "enabled": True,
                        "required": True,
                        "capture_interval_seconds": 5,
                    },
                    "webcam": {
                        "enabled": False,
                        "required": False,
                        "capture_interval_seconds": 10,
                    },
                },
                "detectors": {
                    "pwa_mode": False,
                    "fullscreen": True,
                    "focus": True,
                    "tab_visibility": True,
                    "multi_display": True,
                    "mouse_leave": True,
                    "viewport_integrity": False,
                },
            },
            "tablet": {
                "enabled": True,
                "sources": {
                    "screen_share": {
                        "enabled": False,
                        "required": False,
                        "capture_interval_seconds": 5,
                    },
                    "webcam": {
                        "enabled": True,
                        "required": True,
                        "capture_interval_seconds": 10,
                    },
                },
                "detectors": {
                    "pwa_mode": True,
                    "fullscreen": False,
                    "focus": True,
                    "tab_visibility": True,
                    "multi_display": False,
                    "mouse_leave": True,
                    "viewport_integrity": True,
                },
            },
        }
        self.contest.save(update_fields=["anticheat_device_policy"])

        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        desktop_sources = resp.data["device_policy"]["desktop"]["sources"]
        tablet_sources = resp.data["device_policy"]["tablet"]["sources"]
        self.assertNotIn("required", desktop_sources["screen_share"])
        self.assertNotIn("required", desktop_sources["webcam"])
        self.assertNotIn("required", tablet_sources["screen_share"])
        self.assertNotIn("required", tablet_sources["webcam"])
