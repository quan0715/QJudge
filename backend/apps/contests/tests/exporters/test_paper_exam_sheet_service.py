from io import BytesIO

import pytest

from apps.contests.models import Contest
from apps.contests.models import ExamQuestion
from apps.contests.exporters.renderers import PaperExamSheetRenderer
from apps.contests.services import export_service
from apps.contests.services.export_service import (
    ExportValidationError,
    build_paper_exam_sheet_response,
)
from apps.users.models import User


@pytest.fixture
def teacher():
    return User.objects.create_user(
        username="paper_exam_teacher",
        email="paper_exam_teacher@example.com",
        password="pass123",
        role="teacher",
    )


@pytest.fixture
def paper_exam_contest(teacher):
    return Contest.objects.create(
        name="Paper Exam Contest",
        owner=teacher,
        contest_type="paper_exam",
        status="published",
    )


@pytest.mark.django_db
def test_rejects_invalid_export_mode(paper_exam_contest):
    with pytest.raises(ExportValidationError, match='Invalid mode. Choose "question" or "answer"'):
        build_paper_exam_sheet_response(paper_exam_contest, mode="invalid")


@pytest.mark.django_db
def test_rejects_non_paper_exam_contest(teacher):
    coding_contest = Contest.objects.create(
        name="Coding Contest",
        owner=teacher,
        contest_type="coding",
        status="published",
    )
    with pytest.raises(ExportValidationError, match="This contest is not a paper exam"):
        build_paper_exam_sheet_response(coding_contest, mode="question")


@pytest.mark.django_db
def test_question_mode_uses_question_paper_filename_and_disables_answers(
    paper_exam_contest, monkeypatch
):
    captured_kwargs = {}

    class FakeRenderer:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

        def export(self):
            return BytesIO(b"%PDF-1.4 fake")

    monkeypatch.setattr(export_service, "PaperExamSheetRenderer", FakeRenderer)

    response = build_paper_exam_sheet_response(paper_exam_contest, mode="question")

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert "question_paper.pdf" in response["Content-Disposition"]
    assert captured_kwargs["contest"].id == paper_exam_contest.id
    assert captured_kwargs["include_answers"] is False


@pytest.mark.django_db
def test_answer_mode_uses_answer_sheet_filename_and_enables_answers(
    paper_exam_contest, monkeypatch
):
    captured_kwargs = {}

    class FakeRenderer:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

        def export(self):
            return BytesIO(b"%PDF-1.4 fake")

    monkeypatch.setattr(export_service, "PaperExamSheetRenderer", FakeRenderer)

    response = build_paper_exam_sheet_response(paper_exam_contest, mode="answer", language="en")

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert "answer_sheet.pdf" in response["Content-Disposition"]
    assert captured_kwargs["contest"].id == paper_exam_contest.id
    assert captured_kwargs["language"] == "en"
    assert captured_kwargs["include_answers"] is True


@pytest.mark.django_db
def test_renderer_uses_choice_specific_answer_bar_for_single_choice(paper_exam_contest):
    ExamQuestion.objects.create(
        contest=paper_exam_contest,
        question_type="single_choice",
        prompt="2 + 2 = ?",
        options=["3", "4", "5"],
        correct_answer=1,
        score=5,
        order=0,
    )

    html = PaperExamSheetRenderer(
        contest=paper_exam_contest,
        language="zh-TW",
        include_answers=False,
    ).render_html()

    assert "choice-answer-bar" in html
    assert "□ A" in html
    assert "□ B" in html
    assert "question-options" in html
    assert "<ol class=\"question-options\"" not in html


@pytest.mark.django_db
def test_renderer_short_answer_line_count_is_compact_for_fact_question(paper_exam_contest):
    ExamQuestion.objects.create(
        contest=paper_exam_contest,
        question_type="short_answer",
        prompt="請問會印幾次 hello？",
        score=5,
        order=0,
    )

    html = PaperExamSheetRenderer(
        contest=paper_exam_contest,
        language="zh-TW",
        include_answers=False,
    ).render_html()

    assert html.count('class="answer-line"') == 2


@pytest.mark.django_db
def test_renderer_short_answer_line_count_expands_for_explain_prompt(paper_exam_contest):
    ExamQuestion.objects.create(
        contest=paper_exam_contest,
        question_type="short_answer",
        prompt="請說明該演算法的時間複雜度與原因。",
        score=5,
        order=0,
    )

    html = PaperExamSheetRenderer(
        contest=paper_exam_contest,
        language="zh-TW",
        include_answers=False,
    ).render_html()

    assert html.count('class="answer-line"') == 4


@pytest.mark.django_db
def test_renderer_answer_sheet_does_not_render_student_answer_area(paper_exam_contest):
    ExamQuestion.objects.create(
        contest=paper_exam_contest,
        question_type="single_choice",
        prompt="2 + 2 = ?",
        options=["3", "4", "5"],
        correct_answer=1,
        score=5,
        order=0,
    )
    html = PaperExamSheetRenderer(
        contest=paper_exam_contest,
        language="zh-TW",
        include_answers=True,
    ).render_html()

    assert '<div class="choice-answer-bar">' not in html
    assert '<div class="answer-lines">' not in html


@pytest.mark.django_db
def test_renderer_answer_key_summarizes_long_essay_answer(paper_exam_contest):
    ExamQuestion.objects.create(
        contest=paper_exam_contest,
        question_type="essay",
        prompt="請說明快排與合併排序的差異。",
        correct_answer="這是一段很長的標準答案，內容包含多行與較長敘述，應該在總表顯示見詳解而非整段塞入表格。",
        score=10,
        order=0,
    )

    html = PaperExamSheetRenderer(
        contest=paper_exam_contest,
        language="zh-TW",
        include_answers=True,
    ).render_html()

    assert "見詳解" in html
