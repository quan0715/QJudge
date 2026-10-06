"""Tests for contest anti-cheat runtime config endpoint."""
from datetime import timedelta
import json

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.classrooms.models import Classroom, ClassroomContest, ClassroomMember
from apps.contests.models import Contest, ContestParticipant, ExamIntegrityRun
from apps.contests.serializers import ContestCreateUpdateSerializer
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
        self.assertEqual(resp.data, {"webcam_required": False})

    def test_config_follows_webcam_required(self):
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        self.client.force_authenticate(user=self.student)

        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(resp.data, {"webcam_required": True})

    def test_running_exam_keeps_its_frozen_webcam_setting(self):
        ExamIntegrityRun.objects.create(
            contest=self.contest,
            registry_version="frozen-registry",
            session_state="active",
            policy_snapshot=build_integrity_policy_snapshot(self.contest),
            registry_snapshot={"version": "frozen-registry", "definitions": {}},
        )
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        self.client.force_authenticate(user=self.student)

        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertTrue(resp.data["webcam_required"])
        self.assertFalse(resp.data["integrity_run"]["policy_snapshot"]["webcam_required"])

    def _run_in(self, state):
        return ExamIntegrityRun.objects.create(
            contest=self.contest,
            registry_version="frozen-registry",
            session_state=state,
            policy_snapshot=build_integrity_policy_snapshot(self.contest),
            registry_snapshot={"version": "frozen-registry", "definitions": {}},
        )

    def test_turning_on_webcam_reaches_a_run_that_has_not_started(self):
        run = self._run_in("prepared")
        self.client.force_authenticate(user=self.owner)

        resp = self.client.patch(
            f"/api/v1/contests/{self.contest.id}/", {"webcam_required": True}, format="json"
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        run.refresh_from_db()
        self.assertTrue(run.policy_snapshot["webcam_required"])

    def test_turning_on_webcam_is_rejected_once_the_exam_started(self):
        run = self._run_in("active")
        self.client.force_authenticate(user=self.owner)

        resp = self.client.patch(
            f"/api/v1/contests/{self.contest.id}/", {"webcam_required": True}, format="json"
        )

        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT, resp.data)
        self.assertIn("webcam", resp.data["error"]["message"])
        self.contest.refresh_from_db()
        self.assertFalse(self.contest.webcam_required)
        run.refresh_from_db()
        self.assertFalse(run.policy_snapshot["webcam_required"])

    def test_disabled_webcam_overrides_stale_active_policy_without_mutating_it(self):
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        run = self._run_in("active")
        self.client.force_authenticate(user=self.owner)
        updated = self.client.patch(
            f"/api/v1/contests/{self.contest.id}/", {"webcam_required": False}, format="json"
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(user=self.student)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertFalse(response.data["webcam_required"])
        self.assertFalse(response.data["integrity_run"]["policy_snapshot"]["webcam_required"])
        run.refresh_from_db()
        self.assertTrue(run.policy_snapshot["webcam_required"])

    def test_turning_webcam_back_on_mid_exam_is_rejected(self):
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        self._run_in("active")
        self.client.force_authenticate(user=self.owner)
        url = f"/api/v1/contests/{self.contest.id}/"

        self.assertEqual(self.client.patch(url, {"webcam_required": False}, format="json").status_code, status.HTTP_200_OK)
        resp = self.client.patch(url, {"webcam_required": True}, format="json")

        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT, resp.data)
        self.contest.refresh_from_db()
        self.assertFalse(self.contest.webcam_required)

    def test_precheck_uses_the_live_run_when_archived_runs_remain(self):
        self.contest.webcam_required = True
        self.contest.save(update_fields=["webcam_required"])
        self._run_in("archived")
        live = self._run_in("active")
        self._run_in("archived")
        self.contest.webcam_required = False
        self.contest.save(update_fields=["webcam_required"])
        self.client.force_authenticate(user=self.student)

        response = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")

        self.assertEqual(response.data["integrity_run"]["id"], str(live.id))
        self.assertFalse(response.data["integrity_run"]["policy_snapshot"]["webcam_required"])

    def test_archived_run_does_not_override_current_precheck_settings(self):
        self._run_in("archived")
        self.client.force_authenticate(user=self.student)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertNotIn("integrity_run", response.data)

    def test_update_serializer_accepts_webcam_required(self):
        serializer = ContestCreateUpdateSerializer(
            self.contest, data={"webcam_required": True}, partial=True
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.contest.refresh_from_db()
        self.assertTrue(self.contest.webcam_required)

    def test_live_integrity_run_returns_its_frozen_snapshots_for_student(self):
        participant = ContestParticipant.objects.get(
            contest=self.contest, user=self.student
        )
        policy_snapshot = {"webcam_required": False}
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

        self.assertIs(snapshot["webcam_required"], False)
        self.assertNotIn("version", snapshot)
        self.assertNotIn("device_policy", snapshot)
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
        self.assertIn("webcam_required", resp.data)

    def test_anonymous_request_is_rejected(self):
        resp = self.client.get(f"/api/v1/contests/{self.contest.id}/anticheat-config/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
