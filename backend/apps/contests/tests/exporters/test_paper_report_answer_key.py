"""The student's own paper report never carries the answer key; staff copies still do."""
from types import SimpleNamespace

from apps.contests.exporters.renderers.paper_exam_report import PaperExamReportRenderer
from apps.contests.models import ExamQuestion


def renderer(*, include_answer_key):
    return PaperExamReportRenderer(None, None, include_grading=True, include_answer_key=include_answer_key)


def subjective():
    question = ExamQuestion(question_type='essay', answer_format='plain_text',
                            correct_answer='Reference text', explanation='Grading notes')
    return question, SimpleNamespace(answer={'text': 'My answer'}, is_correct=True)


def choice(is_correct):
    question = ExamQuestion(question_type='single_choice', options=['Alpha', 'Beta'],
                            correct_answer=1, explanation='Grading notes')
    return question, SimpleNamespace(answer={'selected': 0}, is_correct=is_correct)


def test_student_copy_leaves_out_reference_answer_and_explanation():
    rendered = renderer(include_answer_key=False)._render_subjective_question(*subjective())

    assert 'My answer' in rendered
    assert 'Reference text' not in rendered
    assert 'Grading notes' not in rendered


def test_student_copy_marks_only_the_students_own_choice():
    rendered = renderer(include_answer_key=False)._render_choice_question(*choice(False))

    assert 'option-wrong-selected' in rendered
    assert 'option-correct"' not in rendered
    assert 'marker-correct' not in rendered
    assert 'Grading notes' not in rendered


def test_staff_copy_keeps_the_answer_key():
    report = renderer(include_answer_key=True)

    assert 'Reference text' in report._render_subjective_question(*subjective())
    rendered = report._render_choice_question(*choice(False))
    assert 'marker-correct' in rendered
    assert 'Grading notes' in rendered
