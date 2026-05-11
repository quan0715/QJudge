from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.permissions import MANAGER_SCOPE_ROLES, get_contest_scope_role
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
from apps.submissions.models import Submission
from apps.users.models import User
from apps.users.serializers import UserSerializer

ScoreboardMode = Literal["scoreboard", "export"]


@dataclass(frozen=True)
class ScoreboardScope:
    viewer: Optional[User]
    mode: ScoreboardMode = "scoreboard"


@dataclass(frozen=True)
class ScoreboardResult:
    problems: List[Dict[str, Any]]
    standings: List[Dict[str, Any]]


class ScoreboardService:
    """
    Shared standings calculation for API and export flows.
    """

    @staticmethod
    def calculate(contest: Contest, user_scope: ScoreboardScope) -> ScoreboardResult:
        role = ScoreboardService._resolve_role(user_scope.viewer, contest)
        is_privileged = role in MANAGER_SCOPE_ROLES
        show_problem_details = user_scope.mode == "export" or is_privileged
        use_export_display = user_scope.mode == "export"
        status_default: Optional[str] = "-" if user_scope.mode == "export" else None

        bindings = (
            ContestQuestionBinding.objects.filter(
                contest=contest,
                binding_type=QuestionAsset.AssetType.CODING,
            )
            .select_related("coding_problem", "question_asset")
            .order_by("order")
        )
        max_score_by_problem = {
            str(b.coding_problem_id): b.score or 0
            for b in bindings
            if b.coding_problem_id
        }

        problems_data = [
            {
                "id": str(b.coding_problem_id) if b.coding_problem_id else str(b.question_asset_id),
                "title": (
                    b.question_asset.title if show_problem_details and b.question_asset else None
                ),
                "order": b.order,
                "label": b.label,
                "score": b.score or 0,
            }
            for b in bindings
        ]

        participants = ContestParticipant.objects.filter(contest=contest).select_related("user")

        submissions = (
            Submission.objects.filter(
                contest=contest,
                source_type="contest",
                is_test=False,
            )
            .order_by("created_at")
        )

        stats: Dict[int, Dict[str, Any]] = {}
        for participant in participants:
            display_name = ScoreboardService._build_display_name(
                participant=participant,
                contest=contest,
                is_privileged=is_privileged,
                use_export_display=use_export_display,
            )

            stats[participant.user.id] = {
                "user": UserSerializer(participant.user).data,
                "display_name": display_name,
                "solved": 0,
                "rank": participant.rank,
                "score": participant.score,
                "joined_at": participant.joined_at,
                "has_finished_exam": participant.exam_status == ExamStatus.SUBMITTED,
                "started_at": participant.started_at,
                "total_score": 0,
                "time": 0,
                "problems": {},
            }

            for b in bindings:
                problem_key = str(b.coding_problem_id) if b.coding_problem_id else str(b.question_asset_id)
                stats[participant.user.id]["problems"][problem_key] = {
                    "status": status_default,
                    "tries": 0,
                    "time": 0,
                    "pending": False,
                    "score": 0,
                    "max_score": max_score_by_problem.get(problem_key, 0),
                }

        for submission in submissions:
            user_id = submission.user.id
            problem_id = str(submission.problem_id)

            if user_id not in stats:
                continue
            if problem_id not in stats[user_id]["problems"]:
                continue

            problem_stats = stats[user_id]["problems"][problem_id]

            if problem_stats["status"] == "AC":
                continue

            if submission.status in ["pending", "judging"]:
                problem_stats["pending"] = True
                continue

            problem_stats["tries"] += 1
            max_problem_score = max_score_by_problem.get(problem_id, 0)

            if submission.status == "AC":
                problem_stats["status"] = "AC"
                start_time = contest.start_time or contest.created_at
                time_diff = submission.created_at - start_time
                minutes = int(time_diff.total_seconds() / 60)
                problem_stats["time"] = minutes

                stats[user_id]["solved"] += 1
                penalty = minutes + 20 * (problem_stats["tries"] - 1)
                stats[user_id]["time"] += penalty

                new_score = max_problem_score
                score_diff = new_score - problem_stats["score"]
                problem_stats["score"] = new_score
                stats[user_id]["total_score"] += score_diff
            else:
                problem_stats["status"] = submission.status
                submission_score = submission.score or 0
                if submission_score > problem_stats["score"]:
                    score_diff = submission_score - problem_stats["score"]
                    problem_stats["score"] = submission_score
                    stats[user_id]["total_score"] += score_diff

        standings_list = list(stats.values())
        standings_list.sort(key=lambda x: (-x["total_score"], -x["solved"], x["time"]))

        for index, item in enumerate(standings_list):
            item["rank"] = index + 1

        return ScoreboardResult(problems=problems_data, standings=standings_list)

    @staticmethod
    def _resolve_role(viewer: Optional[User], contest: Contest) -> str:
        if viewer and viewer.is_authenticated:
            return get_contest_scope_role(viewer, contest)
        return "anonymous"

    @staticmethod
    def _build_display_name(
        *,
        participant: ContestParticipant,
        contest: Contest,
        is_privileged: bool,
        use_export_display: bool,
    ) -> str:
        profile = getattr(participant.user, "profile", None)
        return getattr(profile, "display_name", "") or participant.user.username
