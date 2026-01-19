from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from django.db.models import Sum

from apps.contests.models import Contest, ContestParticipant, ContestProblem, ExamStatus
from apps.contests.permissions import get_user_role_in_contest
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
        is_privileged = role in ("admin", "teacher")
        show_problem_details = user_scope.mode == "export" or is_privileged
        use_export_display = user_scope.mode == "export"
        status_default: Optional[str] = "-" if user_scope.mode == "export" else None

        contest_problems = (
            ContestProblem.objects.filter(contest=contest)
            .select_related("problem")
            .order_by("order")
            .annotate(problem_score_sum=Sum("problem__test_cases__score"))
        )
        max_score_by_problem = {
            cp.problem_id: cp.problem_score_sum or 0 for cp in contest_problems
        }

        problems_data = [
            {
                "id": cp.problem_id,
                "title": cp.problem.title if show_problem_details else None,
                "order": cp.order,
                "label": cp.label,
                "score": max_score_by_problem.get(cp.problem_id, 0),
            }
            for cp in contest_problems
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
                "nickname": participant.nickname,
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

            for cp in contest_problems:
                stats[participant.user.id]["problems"][cp.problem_id] = {
                    "status": status_default,
                    "tries": 0,
                    "time": 0,
                    "pending": False,
                    "score": 0,
                    "max_score": max_score_by_problem.get(cp.problem_id, 0),
                }

        for submission in submissions:
            user_id = submission.user.id
            problem_id = submission.problem.id

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
            return get_user_role_in_contest(viewer, contest)
        return "student"

    @staticmethod
    def _build_display_name(
        *,
        participant: ContestParticipant,
        contest: Contest,
        is_privileged: bool,
        use_export_display: bool,
    ) -> str:
        if use_export_display:
            return participant.nickname or participant.user.username

        if not contest.anonymous_mode_enabled:
            return participant.user.username
        if is_privileged:
            return participant.user.username
        return participant.nickname or participant.user.username
