"""
考試期間跨裝置登入阻擋（auth 與 active session 一致性）。

對齊 find_exam_conflict：已在他處開考且 Redis 記錄的 device_id 與本次登入
請求之 X-Device-Id 不同時，email 登入應 403 EXAM_LOGIN_BLOCKED。
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.services.anti_cheat_session import clear_active_session, set_active_session

User = get_user_model()


class ExamLoginBlockedByOtherDeviceTests(APITestCase):
    """已在 A 裝置開考時，B 裝置不得以同一帳號密碼登入。"""

    def setUp(self):
        self.login_url = reverse("users:email-login")
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
        rf = RequestFactory()
        req = rf.post(
            "/",
            HTTP_USER_AGENT="pytest-exam-device-a",
            REMOTE_ADDR="127.0.0.1",
        )
        set_active_session(self.contest, self.participant, req, "device-exam-room-a")

    def tearDown(self):
        clear_active_session(self.contest.id, self.student.id)

    def test_login_from_other_device_blocked_with_exam_login_blocked(self):
        resp = self.client.post(
            self.login_url,
            {"email": "sec_student@test.com", "password": "pass12345"},
            format="json",
            HTTP_X_DEVICE_ID="device-exam-room-b",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(resp.data.get("success", True))
        self.assertEqual(resp.data.get("code"), "EXAM_LOGIN_BLOCKED")
        self.assertIn("active_exam", resp.data)
        self.assertEqual(str(resp.data["active_exam"]["contest_id"]), str(self.contest.id))

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
