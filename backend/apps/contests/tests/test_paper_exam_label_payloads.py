"""Paper labels survive filtered and exported result payloads without database I/O."""

import csv
import io
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from apps.contests.models import ExamAnswer, ExamQuestion
from apps.contests.services import exam_scoring, export_service, participant_dashboard
from apps.contests.views import exam_answer


@pytest.fixture
def paper(monkeypatch):
    contest = SimpleNamespace(
        id="paper", name="Paper", contest_type="paper_exam",
        expand_question_numbers=False, results_published=False,
    )
    questions = [
        SimpleNamespace(
            id=f"q{index}", order=index, group_id="group" if index in {1, 2} else None,
            question_type="single_choice" if index < 2 else "short_answer",
            prompt="", options=[], correct_answer=None, explanation="", score=10,
            score_policy="normal",
        )
        for index in range(4)
    ]
    question_query = MagicMock()
    question_query.order_by.return_value = questions
    monkeypatch.setattr(ExamQuestion.objects, "filter", lambda **kwargs: question_query)

    answer_query = MagicMock()
    answer_query.__iter__.return_value = iter([])
    answer_query.select_related.return_value = []
    answer_query.values.return_value = []
    monkeypatch.setattr(ExamAnswer.objects, "filter", lambda **kwargs: answer_query)

    scoring = MagicMock()
    scoring.get_questions.return_value = questions
    scoring.get_max_total_score.return_value = 40
    scoring.get_participant_totals.return_value = {}
    scoring.get_effective_max_scores.return_value = {q.id: 10 for q in questions}
    scoring.get_participant_breakdown.return_value = SimpleNamespace(
        items=[], max_total_score=40, total_score=0, graded_count=0, correct_count=0,
    )
    scoring._round_score.side_effect = lambda value: Decimal(str(value))
    scoring.compute_participant_scores.return_value = {}
    scoring.get_question_stats.return_value = {
        q.id: SimpleNamespace(
            answer_count=0, graded_count=0, average_score=0,
            zero_count=0, full_count=0, correct_count=0,
        )
        for q in questions
    }
    scoring.get_score_distribution.return_value = SimpleNamespace(
        average_score=0, median_score=0, max_total_score=40, buckets=[],
    )
    for module in (exam_scoring, export_service, exam_answer):
        monkeypatch.setattr(module, "ExamScoringService", lambda contest: scoring)
    return contest, questions


@pytest.mark.parametrize("expanded, labels", [
    (False, ["1", "2(a)", "2(b)", "3"]),
    (True, ["1", "2", "3", "4"]),
])
def test_csv_and_participant_reports_use_the_paper_numbering_rule(paper, monkeypatch, expanded, labels):
    contest, _questions = paper
    contest.expand_question_numbers = expanded
    participants = MagicMock()
    participants.select_related.return_value.order_by.return_value = []
    monkeypatch.setattr(export_service, "attempted_participants", lambda contest: participants)

    response = export_service.build_paper_exam_results_csv_response(contest)
    header = next(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert [column.split(" ", 1)[0] for column in header[7:]] == [f"{label}." for label in labels]

    _overview, report = participant_dashboard._build_paper_exam_report(contest, SimpleNamespace())
    for key in ("overview_rows", "question_details"):
        assert [row["question_label"] for row in report[key]] == labels
        assert [row["index"] for row in report[key]] == [1, 2, 3, 4]
        assert [row["question_id"] for row in report[key]] == ["q0", "q1", "q2", "q3"]


@pytest.mark.parametrize("expanded, labels", [
    (False, ["2(b)", "3"]),
    (True, ["3", "4"]),
])
def test_dashboard_labels_are_computed_before_subjective_filter(paper, monkeypatch, expanded, labels):
    contest, _questions = paper
    contest.expand_question_numbers = expanded
    view = exam_answer.ExamAnswerViewSet()
    monkeypatch.setattr(view, "_get_contest", lambda contest_pk: contest)
    monkeypatch.setattr(view, "_can_view_dashboard_summary", lambda user, contest: True)
    participants = MagicMock()
    participants.values.return_value = []
    monkeypatch.setattr(view, "_attempted_participants_qs", lambda contest: participants)
    request = SimpleNamespace(user=object(), query_params={"kind": "subjective"})

    response = view.dashboard_summary(request, contest_pk=contest.id)

    assert [row["question_label"] for row in response.data["questions"]] == labels
    assert [row["question_id"] for row in response.data["questions"]] == ["q2", "q3"]
