from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.contests.models import (
    Contest,
    ContestActivity,
    ContestParticipant,
    ExamAnswer,
    ExamEvent,
    ExamQuestion,
    ExamQuestionType,
    ExamStatus,
)


User = get_user_model()


class ParticipantDashboardApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="dashboard-owner",
            email="owner@example.com",
            password="password",
            role="teacher",
        )
        self.teacher = User.objects.create_user(
            username="dashboard-teacher",
            email="teacher@example.com",
            password="password",
            role="teacher",
        )
        self.student = User.objects.create_user(
            username="dashboard-student",
            email="student@example.com",
            password="password",
        )

    def _create_contest(self, *, contest_type: str) -> Contest:
        contest = Contest.objects.create(
            name=f"{contest_type} dashboard contest",
            start_time=timezone.now() - timedelta(minutes=30),
            end_time=timezone.now() + timedelta(hours=1),
            owner=self.owner,
            visibility="public",
            status="published",
            contest_type=contest_type,
            cheat_detection_enabled=(contest_type == "paper_exam"),
        )
        contest.admins.add(self.teacher)
        return contest

    def _create_participant(self, contest: Contest) -> ContestParticipant:
        return ContestParticipant.objects.create(
            contest=contest,
            user=self.student,
            exam_status=ExamStatus.IN_PROGRESS,
            started_at=timezone.now() - timedelta(minutes=20),
            nickname="Stu Dashboard",
            score=12,
            violation_count=2,
        )

    def test_dashboard_requires_staff_permissions(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)

        self.client.force_authenticate(user=self.student)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_paper_exam_dashboard_returns_report_and_timeline(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        question = ExamQuestion.objects.create(
            contest=contest,
            question_type=ExamQuestionType.SHORT_ANSWER,
            prompt="Explain gravity.",
            correct_answer="A force of attraction.",
            explanation="Current explanation.",
            score=10,
            order=0,
        )
        snapshot = question.to_snapshot()
        snapshot["explanation"] = "Snapshot explanation."
        ExamAnswer.objects.create(
            participant=participant,
            question=question,
            answer={"text": "It pulls objects together."},
            question_snapshot=snapshot,
            score=Decimal("8.0"),
            feedback="Reasonable answer.",
            is_correct=False,
            graded_by=self.teacher,
            graded_at=timezone.now(),
        )
        ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="window_blur",
            metadata={
                "reason": "left window",
                "forced_capture_uploaded": True,
                "forced_capture_module_results": {
                    "screen_share": {
                        "uploaded": True,
                        "uploadedObjectKeys": ["screen-1.webp"],
                    },
                    "webcam": {
                        "uploaded": True,
                        "uploadedObjectKeys": ["webcam-1.webp"],
                    },
                },
            },
        )
        ContestActivity.objects.create(
            contest=contest,
            user=self.student,
            action_type="start_exam",
            details="Started exam",
        )
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["contest_type"], "paper_exam")
        self.assertEqual(response.data["participant"]["user_id"], participant.user_id)
        self.assertEqual(response.data["overview"]["graded_count"], 1)
        self.assertEqual(response.data["overview"]["total_questions"], 1)
        self.assertEqual(len(response.data["report"]["overview_rows"]), 1)
        self.assertEqual(len(response.data["report"]["question_details"]), 1)
        self.assertEqual(response.data["report"]["question_details"][0]["feedback"], "Reasonable answer.")
        self.assertEqual(response.data["report"]["question_details"][0]["explanation"], "Snapshot explanation.")
        self.assertEqual(len(response.data["timeline"]), 2)
        self.assertNotIn("evidence", response.data)
        self.assertIn("event_feed", response.data)
        incident_event_ids = [item.get("event_id") for item in response.data["event_feed"]]
        self.assertTrue(any(incident_event_ids))
        window_blur = next(item for item in response.data["event_feed"] if item["event_type"] == "window_blur")
        self.assertEqual(window_blur["evidence_count"], 2)

    def test_grouped_incident_preserves_latest_evidence_keys(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        first = ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="mouse_leave_recovery_timeout",
            metadata={
                "reason": "first timeout",
                "upload_session_id": "session-1",
                "forced_capture_uploaded": True,
                "forced_capture_uploaded_object_keys": [
                    f"contest_{contest.id}/user_{self.student.id}/session_session-1/screen_share/ts_1774106645951_seq_0009.webp",
                ],
                "forced_capture_module_results": {
                    "screen_share": {
                        "uploaded": True,
                        "uploadedSeqs": [9],
                        "uploadedObjectKeys": [
                            f"contest_{contest.id}/user_{self.student.id}/session_session-1/screen_share/ts_1774106645951_seq_0009.webp",
                        ],
                    },
                },
            },
        )
        second = ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="mouse_leave_recovery_timeout",
            metadata={
                "reason": "second timeout",
                "upload_session_id": "session-1",
                "forced_capture_uploaded": True,
                "forced_capture_uploaded_object_keys": [
                    f"contest_{contest.id}/user_{self.student.id}/session_session-1/screen_share/ts_1774106646951_seq_0010.webp",
                ],
                "forced_capture_module_results": {
                    "screen_share": {
                        "uploaded": True,
                        "uploadedSeqs": [10],
                        "uploadedObjectKeys": [
                            f"contest_{contest.id}/user_{self.student.id}/session_session-1/screen_share/ts_1774106646951_seq_0010.webp",
                        ],
                    },
                },
            },
        )
        second.created_at = first.created_at + timedelta(seconds=10)
        second.save(update_fields=["created_at"])

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        incident = next(
            item for item in response.data["event_feed"]
            if item["event_type"] == "mouse_leave_recovery_timeout"
        )
        self.assertEqual(incident["count"], 2)
        self.assertEqual(incident["evidence_count"], 2)
        self.assertEqual(incident["event_id"], str(second.id))
        self.assertEqual(
            incident["metadata"]["forced_capture_uploaded_object_keys"],
            [
                f"contest_{contest.id}/user_{self.student.id}/session_session-1/screen_share/ts_1774106645951_seq_0009.webp",
                f"contest_{contest.id}/user_{self.student.id}/session_session-1/screen_share/ts_1774106646951_seq_0010.webp",
            ],
        )

    def test_clipboard_action_feed_item_preserves_grouped_actions(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        first = ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="clipboard_action",
            metadata={
                "action": "copy",
                "content_captured": False,
                "text_length": 4,
                "line_count": 1,
            },
        )
        second = ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="clipboard_action",
            metadata={
                "action": "paste",
                "content": "print('visible')",
                "content_captured": True,
                "content_truncated": False,
                "text_length": 16,
                "line_count": 1,
            },
        )
        second.created_at = first.created_at + timedelta(seconds=10)
        second.save(update_fields=["created_at"])

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        clipboard_items = [
            item for item in response.data["event_feed"]
            if item["event_type"] == "clipboard_action"
        ]
        self.assertEqual(len(clipboard_items), 1)
        clipboard_item = clipboard_items[0]
        self.assertEqual(clipboard_item["count"], 2)
        self.assertEqual(clipboard_item["event_id"], str(second.id))
        self.assertEqual(clipboard_item["metadata"]["content"], "print('visible')")
        self.assertEqual(
            [item["action"] for item in clipboard_item["metadata"]["clipboard_actions"]],
            ["copy", "paste"],
        )
        self.assertEqual(
            clipboard_item["metadata"]["clipboard_actions"][1]["content"],
            "print('visible')",
        )

    def test_admin_can_create_manual_proctor_event(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        started_at = timezone.now() - timedelta(seconds=20)
        ended_at = timezone.now()
        object_key = (
            f"contest_{contest.id}/user_{self.student.id}/session_manual-session-1/"
            "screen_share/ts_1774106646951_seq_0001.webp"
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/manual_proctor_event/",
            {
                "user_id": participant.user_id,
                "started_at": started_at.isoformat(),
                "ended_at": ended_at.isoformat(),
                "reason": "Suspicious screen activity",
                "description": "TA observed rapid window changes.",
                "upload_session_id": "manual-session-1",
                "uploaded_object_keys": [object_key],
                "uploaded_seqs": [1],
                "module_results": {
                    "screen_share": {
                        "attempted": True,
                        "captured": True,
                        "uploaded": True,
                        "uploadSessionId": "manual-session-1",
                        "uploadedObjectKeys": [object_key],
                        "uploadedSeqs": [1],
                        "evidenceUploadedFrameCount": 1,
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        event = ExamEvent.objects.get(id=response.data["event_id"])
        self.assertEqual(event.event_type, "manual_proctor_note")
        self.assertEqual(event.user_id, participant.user_id)
        self.assertEqual(event.metadata["upload_session_id"], "manual-session-1")
        self.assertEqual(event.metadata["reason"], "Suspicious screen activity")
        self.assertEqual(event.metadata["description"], "TA observed rapid window changes.")
        self.assertEqual(event.metadata["evidence_window_start"], started_at.isoformat())
        self.assertEqual(event.metadata["evidence_window_end"], ended_at.isoformat())
        self.assertTrue(event.metadata["forced_capture_uploaded"])
        self.assertEqual(event.metadata["forced_capture_uploaded_object_keys"], [object_key])

        dashboard_response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        manual_items = [
            item for item in dashboard_response.data["event_feed"]
            if item["event_type"] == "manual_proctor_note"
        ]
        self.assertEqual(len(manual_items), 1)
        self.assertEqual(manual_items[0]["summary"], "Suspicious screen activity")
        self.assertEqual(manual_items[0]["metadata"]["upload_session_id"], "manual-session-1")
        self.assertEqual(manual_items[0]["metadata"]["forced_capture_uploaded_object_keys"], [object_key])

    def test_manual_proctor_event_rejects_invalid_user_id(self):
        contest = self._create_contest(contest_type="paper_exam")

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/manual_proctor_event/",
            {
                "user_id": "not-a-number",
                "started_at": timezone.now().isoformat(),
                "ended_at": timezone.now().isoformat(),
                "reason": "Suspicious screen activity",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_id", response.data["error"]["details"])

    def test_manual_proctor_evidence_urls_rejects_invalid_user_id(self):
        contest = self._create_contest(contest_type="paper_exam")

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/manual_proctor_evidence_urls/",
            {"user_id": "not-a-number"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_id", response.data["error"]["details"])

    @patch(
        "apps.contests.services.participant_dashboard._build_coding_report",
        return_value=(
            {
                "total_score": 25,
                "max_score": 40,
                "solved": 2,
                "total_problems": 3,
                "rank": 1,
                "total_participants": 10,
                "effective_submissions": 4,
                "accepted_submissions": 2,
                "accepted_rate": 50.0,
            },
            {
                "problem_grid": [
                    {
                        "problem_id": "00000000-0000-4000-8000-000000000001",
                        "label": "A",
                        "title": "Two Sum",
                        "difficulty": "easy",
                        "status": "AC",
                        "score": 20,
                        "max_score": 20,
                        "tries": 2,
                        "time": 15,
                    }
                ],
                "problem_details": [],
                "trend": {
                    "submission_timeline": [],
                    "cumulative_progress": [],
                    "status_counts": {"AC": 2, "WA": 1},
                },
            },
        ),
    )
    def test_coding_dashboard_uses_coding_branch_payload(self, _mock_build_coding_report):
        contest = self._create_contest(contest_type="coding")
        participant = self._create_participant(contest)
        ContestActivity.objects.create(
            contest=contest,
            user=self.student,
            action_type="submit_code",
            details="Submitted code",
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["contest_type"], "coding")
        self.assertNotIn("evidence", response.data)
        self.assertEqual(response.data["overview"]["total_score"], 25)
        self.assertEqual(response.data["report"]["problem_grid"][0]["label"], "A")
        self.assertEqual(response.data["timeline"][0]["event_type"], "submit_code")
