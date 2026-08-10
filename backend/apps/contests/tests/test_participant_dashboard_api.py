from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

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
        ExamAnswer.objects.create(
            participant=participant,
            question=question,
            answer={"text": "It pulls objects together."},
            score=Decimal("8.0"),
            feedback="Reasonable answer.",
            is_correct=False,
            graded_by=self.teacher,
            graded_at=timezone.now(),
        )
        ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="mouse_leave_triggered",
            metadata={"reason": "left window"},
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
        self.assertEqual(
            response.data["report"]["question_details"][0]["feedback"],
            "Reasonable answer.",
        )
        self.assertEqual(
            response.data["report"]["question_details"][0]["explanation"],
            "Current explanation.",
        )
        self.assertEqual(len(response.data["timeline"]), 2)
        self.assertNotIn("evidence", response.data)
        self.assertIn("event_feed", response.data)
        self.assertEqual(
            [item["source"] for item in response.data["event_feed"]],
            ["activity"],
        )

    def test_event_feed_projects_one_linear_incident_and_hides_health_snapshots(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        incident_id = uuid4()
        base_ms = 1_785_000_000_000
        phases = (
            ("mouse_leave_triggered", "triggered", base_ms),
            ("mouse_leave", "escalated", base_ms + 5_000),
            ("mouse_leave_restored", "restored", base_ms + 12_000),
        )
        events = []
        for event_type, phase, occurred_at_ms in phases:
            events.append(
                ExamEvent.objects.create(
                    contest=contest,
                    user=self.student,
                    event_type=event_type,
                    incident_id=incident_id,
                    client_occurred_at_ms=occurred_at_ms,
                    metadata={
                        "reason": event_type,
                        "integrity": {
                            "definition_id": "mouse_leave",
                            "phase": phase,
                        },
                    },
                )
            )
        ExamEvent.objects.create(
            contest=contest,
            user=self.student,
            event_type="health_snapshot",
            client_occurred_at_ms=base_ms + 20_000,
            metadata={"online": True},
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        feed = response.data["event_feed"]
        self.assertNotIn("health_snapshot", [item["event_type"] for item in feed])
        self.assertEqual(len(feed), 1)
        incident = feed[0]
        self.assertEqual(incident["incident_key"], f"incident:{incident_id}")
        self.assertEqual(incident["event_id"], str(events[1].id))
        self.assertEqual(incident["event_type"], "mouse_leave")
        self.assertEqual(incident["count"], 1)
        self.assertFalse(incident["has_evidence"])
        self.assertNotIn("evidence_count", incident)
        self.assertEqual(incident["metadata"]["incident_status"], "restored")
        self.assertEqual(
            [
                transition["event_type"]
                for transition in incident["metadata"]["transitions"]
            ],
            ["mouse_leave_triggered", "mouse_leave", "mouse_leave_restored"],
        )
        self.assertEqual(
            [
                transition["occurred_at_ms"]
                for transition in incident["metadata"]["transitions"]
            ],
            [base_ms, base_ms + 5_000, base_ms + 12_000],
        )

    def test_event_feed_groups_nearby_escalated_incidents_into_one_episode(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        base_ms = 1_785_000_000_000
        incident_ids = (uuid4(), uuid4())
        for offset, incident_id in enumerate(incident_ids):
            start_ms = base_ms + offset * 10_000
            for event_type, phase, delta in (
                ("mouse_leave_triggered", "triggered", 0),
                ("mouse_leave", "escalated", 5_000),
                ("mouse_leave_restored", "restored", 6_000),
            ):
                ExamEvent.objects.create(
                    contest=contest,
                    user=self.student,
                    event_type=event_type,
                    incident_id=incident_id,
                    client_occurred_at_ms=start_ms + delta,
                    metadata={
                        "integrity": {
                            "definition_id": "mouse_leave",
                            "phase": phase,
                        },
                    },
                )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["event_feed"]), 1)
        episode = response.data["event_feed"][0]
        self.assertEqual(episode["count"], 2)
        self.assertEqual(
            [item["incident_id"] for item in episode["metadata"]["occurrences"]],
            [str(incident_ids[0]), str(incident_ids[1])],
        )

    def test_event_feed_keeps_escalated_incidents_separate_after_quiet_gap(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        base_ms = 1_785_000_000_000
        for offset in (0, 20_000):
            incident_id = uuid4()
            for event_type, phase, delta in (
                ("mouse_leave_triggered", "triggered", 0),
                ("mouse_leave", "escalated", 5_000),
                ("mouse_leave_restored", "restored", 6_000),
            ):
                ExamEvent.objects.create(
                    contest=contest,
                    user=self.student,
                    event_type=event_type,
                    incident_id=incident_id,
                    client_occurred_at_ms=base_ms + offset + delta,
                    metadata={
                        "integrity": {
                            "definition_id": "mouse_leave",
                            "phase": phase,
                        },
                    },
                )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f"/api/v1/contests/{contest.id}/participants/{participant.user_id}/dashboard/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["event_feed"]), 2)

    def test_clipboard_actions_remain_separate_timeline_items(self):
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
            item
            for item in response.data["event_feed"]
            if item["event_type"] == "clipboard_action"
        ]
        self.assertEqual(len(clipboard_items), 2)
        self.assertEqual(
            [item["event_id"] for item in clipboard_items],
            [str(second.id), str(first.id)],
        )
        self.assertEqual(
            [item["metadata"]["action"] for item in clipboard_items],
            ["paste", "copy"],
        )
        self.assertEqual(clipboard_items[0]["metadata"]["content"], "print('visible')")

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
    def test_coding_dashboard_uses_coding_branch_payload(
        self, _mock_build_coding_report
    ):
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
