from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

from django.db import transaction

from apps.contests.models import Contest
from apps.contests.services.activity_log import log_contest_activity
from apps.contests.services.question_edit_lock import maybe_lock_from_coding_submission
from apps.problems.models import CodingProblem
from apps.submissions.access_policy import SubmissionAccessPolicy
from apps.submissions.models import Submission
from apps.users.models import User

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SubmissionCreateResult:
    submission: Submission
    should_judge: bool
    source_type: str


class SubmissionService:
    """
    Core submission logic — creation, keyword validation, queue dispatch,
    and contest activity logging.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @classmethod
    def create_and_dispatch(
        cls,
        *,
        user: User,
        data: Dict[str, Any],
        contest_id: Optional[int] = None,
    ) -> Submission:
        """
        Single entry-point used by the view layer.
        Creates a submission, dispatches judging, and logs contest activity.
        """
        result = cls.create_submission(
            user=user,
            data=data,
            contest_id=contest_id,
        )

        if result.should_judge:
            cls._dispatch_judging(result)

        if result.source_type == "contest" and result.should_judge:
            cls._log_contest_activity(result, user)

        return result.submission

    # ------------------------------------------------------------------
    # Submission creation (unchanged public contract for backward compat)
    # ------------------------------------------------------------------

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
        if contest is not None and contest_id is None:
            contest_id = contest.id

        source_type = "contest" if contest else "practice"

        if contest:
            SubmissionAccessPolicy.enforce_contest_submission(user, contest)

        problem: CodingProblem = data["problem"]
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

        # Resolve ContestQuestionBinding for contest submissions
        problem_id = getattr(problem, "id", None)
        if source_type == "contest" and contest_id and problem_id is not None:
            from apps.question_bank.models import ContestQuestionBinding, QuestionAsset

            binding = ContestQuestionBinding.objects.filter(
                contest_id=contest_id,
                coding_problem_id=problem_id,
                binding_type=QuestionAsset.AssetType.CODING,
            ).only("id").first()
            if binding:
                create_payload["contest_question_binding_id"] = binding.id

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
                maybe_lock_from_coding_submission(submission=submission)
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
            maybe_lock_from_coding_submission(submission=submission)

        return SubmissionCreateResult(
            submission=submission,
            should_judge=True,
            source_type=source_type,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _dispatch_judging(result: SubmissionCreateResult) -> None:
        from apps.submissions.tasks import judge_submission

        queue = "high_priority" if result.source_type == "contest" else "default"
        sid = result.submission.id
        transaction.on_commit(
            lambda: judge_submission.apply_async(args=[sid], queue=queue)
        )

    @staticmethod
    def _log_contest_activity(result: SubmissionCreateResult, user: User) -> None:
        contest = result.submission.contest
        if not contest:
            return
        try:
            problem = result.submission.problem
            log_contest_activity(
                contest,
                user,
                "submit_code",
                f"Submitted code for problem: {problem.id if problem else 'Unknown'}",
            )
        except Exception:
            logger.debug("Failed to log contest activity", exc_info=True)

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
