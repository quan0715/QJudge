"""Tests for contest anti-cheat runtime config endpoint."""
from datetime import timedelta
import json

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun
from apps.contests.services.anticheat_config import build_integrity_policy_snapshot
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
            contest_type="paper_exam",
        )
        ContestParticipant.objects.create(contest=self.contest, user=self.student)

    def test_participant_can_fetch_anticheat_config(self):
        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(set(resp.data), {"version", "device_policy"})
        self.assertEqual(resp.data["version"], 3)

        device_policy = resp.data["device_policy"]
        self.assertIn("desktop", device_policy)
        self.assertIn("tablet", device_policy)
        self.assertIn("sources", device_policy["desktop"])
        self.assertIn("screen_share", device_policy["desktop"]["sources"])
        self.assertIn("detectors", device_policy["tablet"])
        self.assertIn("viewport_integrity", device_policy["tablet"]["detectors"])
        self.assertNotIn(
            "required", device_policy["desktop"]["sources"]["screen_share"]
        )
        self.assertNotIn("required", device_policy["desktop"]["sources"]["webcam"])
        self.assertNotIn("required", device_policy["tablet"]["sources"]["screen_share"])
        self.assertNotIn("required", device_policy["tablet"]["sources"]["webcam"])
        self.assertEqual(
            set(device_policy["desktop"]["sources"]["screen_share"]), {"enabled"}
        )
        self.assertNotIn("focus", device_policy["desktop"]["detectors"])
        self.assertNotIn("tab_visibility", device_policy["desktop"]["detectors"])

    def test_live_integrity_run_returns_its_frozen_snapshots_for_student(self):
        participant = ContestParticipant.objects.get(
            contest=self.contest, user=self.student
        )
        policy_snapshot = {
            "version": 1,
            "device_policy": {"desktop": {"enabled": False}},
        }
        registry_snapshot = {"version": "frozen-registry", "definitions": {}}
        run = ExamIntegrityRun.objects.create(
            contest=self.contest,
            registry_version="frozen-registry",
            session_state="active",
            health=ExamIntegrityRun.Health.HEALTHY,
            policy_snapshot=policy_snapshot,
            registry_snapshot=registry_snapshot,
        )

        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resp.data["integrity_run"],
            {
                "id": str(run.id),
                "session_state": "active",
                "health": "healthy",
                "participant_id": str(participant.id),
                "policy_snapshot": policy_snapshot,
                "registry_snapshot": registry_snapshot,
            },
        )

    def test_closed_integrity_run_is_not_exposed(self):
        ExamIntegrityRun.objects.create(
            contest=self.contest,
            registry_version="registry-v1",
            session_state="closed",
        )

        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertNotIn("integrity_run", resp.data)

    def test_integrity_policy_snapshot_is_json_serializable_and_uses_normalized_policy(
        self,
    ):
        snapshot = build_integrity_policy_snapshot(self.contest)

        self.assertEqual(snapshot["version"], 1)
        self.assertEqual(snapshot["batch_interval_ms"], 5_000)
        self.assertEqual(snapshot["suspect_after_ms"], 15_000)
        self.assertEqual(snapshot["disconnected_after_ms"], 30_000)
        self.assertEqual(snapshot["evidence"]["chunk_ms"], 5_000)
        self.assertEqual(
            snapshot["evidence"]["screen"],
            {
                "width": 1280,
                "height": 720,
                "fps": 5,
                "bitrate": 800_000,
            },
        )
        self.assertNotIn("effective", snapshot)
        json.dumps(snapshot)

    def test_contest_participant_can_fetch_anticheat_config_when_classroom_bound(self):
        classroom = Classroom.objects.create(
            name="Config Room",
            owner=self.owner,
            invite_code="CFGROOM1",
        )
        ClassroomMember.objects.create(
            classroom=classroom,
            user=self.student,
            role="student",
        )
        ClassroomContest.objects.create(classroom=classroom, contest=self.contest)

        self.client.force_authenticate(user=self.student)
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("device_policy", resp.data)

    def test_anonymous_request_is_rejected(self):
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
