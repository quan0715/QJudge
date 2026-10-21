"""Result dashboard summary for coding contests.

Produces the same payload shape as the paper-exam ``dashboard-summary`` so the
admin overview can render either contest type with one component. Totals come
from the scoreboard, the same source the standings and exports use.
"""
from apps.contests.models import Contest

from .exam_scoring import build_score_distribution
from .scoreboard import ScoreboardScope, ScoreboardService


def build_coding_dashboard_summary(contest: Contest, viewer) -> dict:
    result = ScoreboardService.calculate(
        contest, ScoreboardScope(viewer=viewer, mode="export")
    )
    scores = [float(item["total_score"] or 0) for item in result.standings]
    max_total = sum(problem["score"] or 0 for problem in result.problems)
    distribution = build_score_distribution(scores, max_total)

    return {
        "contest": {
            "id": str(contest.id),
            "name": contest.name,
            "course": "",
            "contest_type": "coding",
            "participant_count": len(result.standings),
            "completed_count": sum(
                1 for item in result.standings if item["has_finished_exam"]
            ),
            "results_published": contest.results_published,
        },
        "summary": {
            "average_score": distribution.average_score,
            "median_score": distribution.median_score,
            "max_total_score": distribution.max_total_score,
        },
        "score_distribution": distribution.buckets,
        "questions": [],
    }
