from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from django.db import transaction

from apps.contests.models import Contest
from apps.problems.models import Problem
from apps.submissions.access_policy import SubmissionAccessError, SubmissionAccessPolicy
from apps.submissions.models import Submission
from apps.users.models import User


@dataclass(frozen=True)
class SubmissionCreateResult:
    submission: Submission
    should_judge: bool
    source_type: str


class SubmissionService:
    """
    Core submission logic extracted from SubmissionViewSet.
    """

    @staticmethod
    def create_submission(
        *,
        user: User,
        data: Dict[str, Any],
        contest_id: Optional[int] = None,
    ) -> SubmissionCreateResult:
        contest = data.get("contest")
        if contest is None and contest_id:
            contest = Contest.objects.get(id=contest_id)

        source_type = "contest" if contest else "practice"

        if contest:
            SubmissionAccessPolicy.enforce_contest_submission(user, contest)

        problem: Problem = data["problem"]
        code: str = data.get("code", "")

        forbidden_keywords = problem.forbidden_keywords or []
        required_keywords = problem.required_keywords or []

        violation_message = SubmissionService._check_keywords(
            code=code,
            forbidden_keywords=forbidden_keywords,
            required_keywords=required_keywords,
        )

        create_payload = dict(data)
        create_payload.pop("source_type", None)

        with transaction.atomic():
            if violation_message:
                submission = Submission.objects.create(
                    user=user,
                    source_type=source_type,
                    status="KR",
                    score=0,
                    error_message=violation_message,
                    **create_payload,
                )
                return SubmissionCreateResult(
                    submission=submission,
                    should_judge=False,
                    source_type=source_type,
                )

            submission = Submission.objects.create(
                user=user,
                source_type=source_type,
                **create_payload,
            )

        return SubmissionCreateResult(
            submission=submission,
            should_judge=True,
            source_type=source_type,
        )

    @staticmethod
    def _check_keywords(
        *,
        code: str,
        forbidden_keywords: list[str],
        required_keywords: list[str],
    ) -> str:
        for keyword in forbidden_keywords:
            if keyword in code:
                return f"程式碼包含禁用關鍵字: {keyword}"

        for keyword in required_keywords:
            if keyword not in code:
                return f"程式碼缺少必須關鍵字: {keyword}"

        return ""
