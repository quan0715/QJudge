"""Contract tests for GET /api/v1/submissions/ query filters.

Encodes that the ``problem`` filter targets ``CodingProblem.id`` — not
``ContestQuestionBinding.id``. We had a production 400 flood when the contest
solver page forwarded a binding UUID into this filter; without a test pinning
the contract, future refactors could re-introduce the same ambiguity.
"""
from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.problems.models import CodingProblem
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset, QuestionVersion
from apps.submissions.models import Submission

User = get_user_model()


class SubmissionListProblemFilterContractTests(TestCase):
    """The ``problem`` query param MUST be a CodingProblem.id."""

    @classmethod
    def setUpTestData(cls) -> None:
        cls.teacher = User.objects.create_user(
            username="teacher",
            email="teacher@test.com",
            password="password123",
            role="teacher",
        )
        cls.student = User.objects.create_user(
            username="student",
            email="student@test.com",
            password="password123",
            role="student",
        )

        cls.contest = Contest.objects.create(
            name="Filter Contract Contest",
            owner=cls.teacher,
            status="published",
            visibility="public",
        )
        ContestParticipant.objects.create(
            contest=cls.contest,
            user=cls.student,
            exam_status=ExamStatus.NOT_STARTED,
        )

        cls.coding_problem = CodingProblem.objects.create(
            time_limit=1000,
            memory_limit=256,
            created_by=cls.teacher,
        )

        asset = QuestionAsset.objects.create(
            owner=cls.teacher,
            asset_type=QuestionAsset.AssetType.CODING,
            title="Contract Problem",
        )
        version = QuestionVersion.objects.create(
            question_asset=asset,
            version_number=1,
            title="Contract Problem",
            created_by=cls.teacher,
        )
        asset.latest_version = version
        asset.save(update_fields=["latest_version"])

        cls.binding = ContestQuestionBinding.objects.create(
            contest=cls.contest,
            question_asset=asset,
            question_version=version,
            coding_problem=cls.coding_problem,
            binding_type=QuestionAsset.AssetType.CODING,
            score=100,
            created_by=cls.teacher,
        )

        cls.submission = Submission.objects.create(
            user=cls.student,
            problem=cls.coding_problem,
            language="python",
            code="print('hi')",
            status="AC",
            source_type="contest",
            contest=cls.contest,
            is_test=False,
        )

    def setUp(self) -> None:
        self.client = APIClient()
        self.client.force_authenticate(user=self.teacher)

    def test_filter_accepts_coding_problem_id(self) -> None:
        response = self.client.get(
            "/api/v1/submissions/",
            {
                "source_type": "contest",
                "contest": str(self.contest.id),
                "problem": str(self.coding_problem.id),
            },
        )
        assert response.status_code == 200, response.content
        ids = {str(row["id"]) for row in response.data["results"]}
        assert str(self.submission.id) in ids

    def test_filter_rejects_contest_question_binding_id(self) -> None:
        """Contract: binding.id is NOT a substitute for coding_problem.id.

        Regression test — we had a production 400 when the contest solver page
        sent binding.id here. If a future refactor relaxes the filter to swallow
        both IDs, this test forces an intentional decision.
        """
        response = self.client.get(
            "/api/v1/submissions/",
            {
                "source_type": "contest",
                "contest": str(self.contest.id),
                "problem": str(self.binding.id),
            },
        )
        assert response.status_code == 400, response.content
        assert "problem" in (response.data.get("error") or {}).get("details", {})

    def test_filter_rejects_unknown_uuid(self) -> None:
        response = self.client.get(
            "/api/v1/submissions/",
            {
                "source_type": "contest",
                "contest": str(self.contest.id),
                "problem": str(uuid.uuid4()),
            },
        )
        assert response.status_code == 400, response.content
