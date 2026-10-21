"""Classroom gradebook: students x bound contests, raw total scores.

Nothing is stored. Every number is computed on demand from the same scoring
services each contest's own pages use, so the gradebook always matches them.
"""

from __future__ import annotations

import csv
import uuid
from dataclasses import dataclass
from datetime import datetime

from django.db.models import F
from rest_framework import serializers

from apps.classrooms.models import Classroom
from apps.contests.models import Contest
from apps.contests.services.exam_scoring import ExamScoringService
from apps.contests.services.participation import attempted_participants
from apps.contests.services.scoreboard import ScoreboardScope, ScoreboardService


@dataclass(frozen=True)
class GradebookContest:
    id: uuid.UUID
    name: str
    contest_type: str
    start_time: datetime | None
    max_score: float


@dataclass(frozen=True)
class GradebookStudent:
    user_id: int
    username: str
    display_name: str
    # key = contest id; None = did not take part
    scores: dict[uuid.UUID, float | None]


@dataclass(frozen=True)
class Gradebook:
    contests: list[GradebookContest]
    students: list[GradebookStudent]


def _coding_scores(contest: Contest, viewer) -> tuple[float, dict[int, float]]:
    result = ScoreboardService.calculate(
        contest, ScoreboardScope(viewer=viewer, mode="export")
    )
    max_score = float(sum(problem["score"] for problem in result.problems))
    totals = {
        standing["user"]["id"]: float(standing["total_score"])
        for standing in result.standings
    }
    return max_score, totals


def _paper_exam_scores(contest: Contest) -> tuple[float, dict[int, float]]:
    scoring = ExamScoringService(contest)
    user_by_participant = dict(
        attempted_participants(contest).values_list("id", "user_id")
    )
    by_participant = scoring.get_participant_totals(list(user_by_participant))
    totals = {
        user_by_participant[participant_id]: total
        for participant_id, total in by_participant.items()
    }
    return scoring.get_max_total_score(), totals


def build_classroom_gradebook(classroom: Classroom, *, viewer) -> Gradebook:
    """Students x bound contests, computed live from each contest's scoring service.

    Only people who actually sat a contest get a score for it; everyone else
    is ``None`` rather than 0.
    """
    bindings = classroom.classroom_contests.select_related("contest").order_by(
        F("contest__start_time").asc(nulls_last=True), "contest__created_at"
    )
    contests: list[GradebookContest] = []
    totals_by_contest: dict[uuid.UUID, dict[int, float]] = {}
    for binding in bindings:
        contest = binding.contest
        if contest.contest_type == "paper_exam":
            max_score, totals = _paper_exam_scores(contest)
        else:
            max_score, totals = _coding_scores(contest, viewer)
        contests.append(
            GradebookContest(
                id=contest.id,
                name=contest.name,
                contest_type=contest.contest_type,
                start_time=contest.start_time,
                max_score=max_score,
            )
        )
        totals_by_contest[contest.id] = totals

    # Same split as the members panel: staff are never graded, even when they
    # also hold a student membership.
    memberships = (
        classroom.memberships.filter(role="student")
        .exclude(user_id=classroom.owner_id)
        .exclude(user__in=classroom.admins.all())
        .select_related("user__profile")
        .order_by("user__username")
    )
    students = []
    for membership in memberships:
        user = membership.user
        profile = getattr(user, "profile", None)
        students.append(
            GradebookStudent(
                user_id=user.id,
                username=user.username,
                display_name=profile.display_name if profile else "",
                scores={
                    contest.id: totals_by_contest[contest.id].get(user.id)
                    for contest in contests
                },
            )
        )
    return Gradebook(contests=contests, students=students)


def gradebook_to_payload(gradebook: Gradebook) -> dict:
    """JSON-ready dict: ids as strings, ``start_time`` as ISO string or ``None``."""
    start_time_field = serializers.DateTimeField()
    return {
        "contests": [
            {
                "id": str(contest.id),
                "name": contest.name,
                "contest_type": contest.contest_type,
                "start_time": (
                    start_time_field.to_representation(contest.start_time)
                    if contest.start_time
                    else None
                ),
                "max_score": contest.max_score,
            }
            for contest in gradebook.contests
        ],
        "students": [
            {
                "user_id": student.user_id,
                "username": student.username,
                "display_name": student.display_name,
                "scores": {str(cid): score for cid, score in student.scores.items()},
            }
            for student in gradebook.students
        ],
    }


def _format_score(value: float | None) -> str:
    return "" if value is None else f"{value:.2f}"


def write_gradebook_csv(gradebook: Gradebook, out) -> None:
    """Write the gradebook as CSV rows to ``out`` (anything ``csv.writer`` takes)."""
    writer = csv.writer(out)
    writer.writerow(
        ["帳號", "姓名"]
        + [f"{c.name}（滿分 {_format_score(c.max_score)}）" for c in gradebook.contests]
    )
    for student in gradebook.students:
        writer.writerow(
            [student.username, student.display_name]
            + [_format_score(student.scores.get(c.id)) for c in gradebook.contests]
        )
