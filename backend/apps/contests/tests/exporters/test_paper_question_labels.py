from types import SimpleNamespace

import pytest

from apps.contests.models import ExamQuestion, ExamQuestionGroup
from apps.contests.services.export_service import PaperExamReportRenderer
from apps.contests.services.paper_question_labels import build_paper_question_labels


def test_labels_mix_groups_standalone_and_beyond_z():
    questions = [SimpleNamespace(id=0, group_id=None)]
    questions += [SimpleNamespace(id=i + 1, group_id='g') for i in range(27)]
    questions += [SimpleNamespace(id=28, group_id=None), SimpleNamespace(id=29, group_id='h')]
    labels = build_paper_question_labels(questions)
    assert [labels[i] for i in [0, 1, 2, 26, 27, 28, 29]] == ['1', '2(a)', '2(b)', '2(z)', '2(aa)', '3', '4(a)']


@pytest.mark.parametrize('include_grading', [True, False])
def test_report_overview_and_details_use_full_paper_labels(include_grading):
    group = ExamQuestionGroup(title='Shared task', shared_stem_markdown='Shared rules')
    questions = [
        ExamQuestion(group=group, prompt='Part a', question_type='essay', score=3),
        ExamQuestion(group=group, prompt='Part b', question_type='essay', score=5),
        ExamQuestion(prompt='Standalone', question_type='essay', score=2),
    ]
    renderer = PaperExamReportRenderer(SimpleNamespace(name='Mock exam'), SimpleNamespace(username='student'), include_grading=include_grading)
    # No answer for (a): the following question must still be (b).
    answer = SimpleNamespace(answer={'text': 'Response'}, score=2.5, feedback='Partial credit')
    answers = {questions[1].id: answer}
    overview = renderer._render_overview_table(questions, answers, {})
    details = renderer._render_questions(questions, answers, {})
    for label in ['Q1(a)', 'Q1(b)', 'Q2']:
        assert label in overview
        assert label in details
    assert 'Q3' not in overview
    assert 'Shared rules' in details
    assert 'Response' in details
