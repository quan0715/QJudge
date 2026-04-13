"""考試期間跨裝置登入改走 takeover recovery 流程。"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.services.anti_cheat_session import (
    clear_active_session,
    is_access_token_allowed,
    set_active_session,
)
from apps.users.services import JWTService

User = get_user_model()


class ExamLoginBlockedByOtherDeviceTests(APITestCase):
    """已在 A 裝置開考時，B 裝置應進入 takeover recovery。"""

    def setUp(self):
        self.login_url = reverse("users:email-login")
        self.resolve_conflict_url = reverse("users:resolve-conflict")
        self.teacher = User.objects.create_user(
            username="sec_teacher",
            email="sec_teacher@test.com",
            password="pass12345",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="sec_student",
            email="sec_student@test.com",
            password="pass12345",
            role="student",
        )
        now = timezone.now()
        self.contest = Contest.objects.create(
            name="Security Exam Block Login",
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(hours=2),
            owner=self.teacher,
            visibility="public",
            status="published",
            cheat_detection_enabled=True,
        )
        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=now,
        )
        self.original_tokens = JWTService.generate_tokens(self.student)
        self.original_access_jti = str(AccessToken(self.original_tokens["access"]).get("jti", ""))
        rf = RequestFactory()
        req = rf.post(
            "/",
            HTTP_USER_AGENT="pytest-exam-device-a",
            REMOTE_ADDR="127.0.0.1",
        )
        set_active_session(self.contest, self.participant, req, "device-exam-room-a")

    def tearDown(self):
        clear_active_session(self.contest.id, self.student.id)

    def test_login_from_other_device_returns_takeover_required(self):
        resp = self.client.post(
            self.login_url,
            {"email": "sec_student@test.com", "password": "pass12345"},
            format="json",
            HTTP_X_DEVICE_ID="device-exam-room-b",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(resp.data.get("success", True))
        self.assertEqual(resp.data.get("code"), "EXAM_TAKEOVER_REQUIRED")
        self.assertTrue(resp.data.get("conflict_token"))
        self.assertIn("active_exam", resp.data)
        self.assertEqual(str(resp.data["active_exam"]["contest_id"]), str(self.contest.id))
        self.assertIn("resume_path", resp.data["active_exam"])

    def test_login_same_device_as_active_session_succeeds(self):
        resp = self.client.post(
            self.login_url,
            {"email": "sec_student@test.com", "password": "pass12345"},
            format="json",
            HTTP_X_DEVICE_ID="device-exam-room-a",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data.get("success", False))
        self.assertIn("access_token", resp.data.get("data", {}))

    def test_resolve_conflict_takeover_pauses_exam_and_invalidates_old_session(self):
        blocked = self.client.post(
            self.login_url,
            {"email": "sec_student@test.com", "password": "pass12345"},
            format="json",
            HTTP_X_DEVICE_ID="device-exam-room-b",
        )
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        conflict_token = blocked.data.get("conflict_token")
        self.assertTrue(conflict_token)

        resolve = self.client.post(
            self.resolve_conflict_url,
            {"conflict_token": conflict_token, "action": "takeover_recovery"},
            format="json",
            HTTP_X_DEVICE_ID="device-exam-room-b",
        )
        self.assertEqual(resolve.status_code, status.HTTP_200_OK)
        self.assertTrue(resolve.data.get("success", False))
        self.assertTrue(resolve.data["data"]["resume_required"])

        self.participant.refresh_from_db()
        self.assertEqual(self.participant.exam_status, ExamStatus.PAUSED)
        self.assertFalse(is_access_token_allowed(self.student.id, self.original_access_jti))
        new_access_jti = str(AccessToken(resolve.data["data"]["access_token"]).get("jti", ""))
        self.assertTrue(is_access_token_allowed(self.student.id, new_access_jti))
