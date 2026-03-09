from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import Contest, ContestParticipant, ExamStatus


User = get_user_model()


class ContestExamViewsSmokeTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner-smoke",
            email="owner-smoke@example.com",
            password="password",
            role="teacher",
        )
        self.teacher = User.objects.create_user(
            username="teacher-smoke",
            email="teacher-smoke@example.com",
            password="password",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="student-smoke",
            email="student-smoke@example.com",
            password="password",
        )
        self.contest = Contest.objects.create(
            name="Smoke Contest",
            start_time=timezone.now() - timedelta(minutes=5),
            end_time=timezone.now() + timedelta(hours=1),
            owner=self.owner,
            visibility="public",
            status="published",
            contest_type="paper_exam",
            cheat_detection_enabled=True,
        )
        self.contest.admins.add(self.teacher)
        self.participant = ContestParticipant.objects.create(
            contest=self.contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=1),
        )

    def test_exam_lifecycle_routes_resolve_and_respond(self):
        self.client.force_authenticate(user=self.student)

        end_response = self.client.post(
            reverse("contests:contest-exam-end-exam", args=[self.contest.id]),
            {"upload_session_id": "session-smoke-1"},
            format="json",
        )
        self.assertEqual(end_response.status_code, status.HTTP_200_OK)

        repeat_response = self.client.post(
            reverse("contests:contest-exam-end-exam", args=[self.contest.id]),
            {"upload_session_id": "session-smoke-1"},
            format="json",
        )
        self.assertEqual(repeat_response.status_code, status.HTTP_200_OK)
        self.assertEqual(repeat_response.data["exam_status"], ExamStatus.SUBMITTED)

    def test_exam_evidence_routes_resolve_and_enforce_permissions(self):
        self.client.force_authenticate(user=self.student)
        self.client.post(
            reverse("contests:contest-exam-end-exam", args=[self.contest.id]),
            {"upload_session_id": "session-smoke-2"},
            format="json",
        )

        self.client.force_authenticate(user=self.teacher)

        videos_response = self.client.get(
            reverse("contests:contest-exam-videos", args=[self.contest.id])
        )
        self.assertEqual(videos_response.status_code, status.HTTP_200_OK)

        compile_response = self.client.post(
            reverse("contests:contest-exam-video-compile", args=[self.contest.id]),
            {
                "targets": [
                    {
                        "user_id": self.student.id,
                        "upload_session_id": "session-smoke-2",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(compile_response.status_code, status.HTTP_200_OK)

        delete_response = self.client.post(
            reverse("contests:contest-exam-video-delete", args=[self.contest.id]),
            {
                "targets": [
                    {
                        "user_id": self.student.id,
                        "upload_session_id": "session-smoke-2",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.owner)
        owner_delete_response = self.client.post(
            reverse("contests:contest-exam-video-delete", args=[self.contest.id]),
            {
                "targets": [
                    {
                        "user_id": self.student.id,
                        "upload_session_id": "session-smoke-2",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(owner_delete_response.status_code, status.HTTP_200_OK)
