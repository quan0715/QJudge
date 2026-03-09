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
    ExamEvidenceJob,
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

    def test_paper_exam_dashboard_returns_report_timeline_and_evidence(self):
        contest = self._create_contest(contest_type="paper_exam")
        participant = self._create_participant(contest)
        question = ExamQuestion.objects.create(
            contest=contest,
            question_type=ExamQuestionType.SHORT_ANSWER,
            prompt="Explain gravity.",
            correct_answer="A force of attraction.",
            score=10,
            order=0,
        )
        ExamAnswer.objects.create(
            participant=participant,
            question=question,
            answer={"text": "It pulls objects together."},
            question_snapshot=question.to_snapshot(),
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
            metadata={"reason": "left window"},
        )
        ContestActivity.objects.create(
            contest=contest,
            user=self.student,
            action_type="start_exam",
            details="Started exam",
        )
        ExamEvidenceJob.objects.create(
            contest=contest,
            participant=participant,
            upload_session_id="paper-session-1",
            status="pending",
            raw_count=15,
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
        self.assertEqual(len(response.data["timeline"]), 2)
        self.assertEqual(response.data["evidence"][0]["upload_session_id"], "paper-session-1")

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
                        "problem_id": 1,
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
