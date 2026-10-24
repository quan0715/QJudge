"""Database-free validation for durable progress publication."""
from unittest.mock import patch
from uuid import uuid4

import pytest
from rest_framework.exceptions import ValidationError

from apps.contests.models import ExamGradingUnit
from apps.contests.views.exam_grading_unit import identifier


def make_unit():
    return ExamGradingUnit(
        unit_id='group', run_id=uuid4(),
        snapshot={'question_ids': ['q1'], 'answers': [
            {'exam_answer_id': '1', 'writable': True},
            {'exam_answer_id': '2', 'writable': True},
            {'exam_answer_id': '3', 'writable': False},
        ]},
        drafts={'1': {'score': 0}, '2': {'score': 10}},
        results={'1': {'status': 'ok'}, '2': {'status': 'error'}},
    )


def test_progress_cannot_complete_with_failed_answer_and_saves_with_results():
    unit = make_unit()
    unit.snapshot['submitted'] = True
    with patch('django.db.models.Model.save') as save:
        unit.save(update_fields=['results'])
    assert unit.progress['status'] == 'draft'
    assert unit.progress['total_count'] == 2
    assert unit.progress['written_count'] == 1
    assert unit.progress['draft_count'] == 2
    assert save.call_args.kwargs['update_fields'] == {'results', 'progress'}


def test_all_success_still_requires_explicit_submit_completion():
    unit = make_unit()
    unit.results['2']['status'] = 'skipped'
    with patch('django.db.models.Model.save'):
        unit.save()
        assert unit.progress['status'] == 'draft'
        unit.snapshot['submitted'] = True
        unit.save()
    assert unit.progress['status'] == 'completed'
    assert unit.progress['written_count'] == 1
    assert unit.progress['skipped_count'] == 1


def test_empty_target_scope_requires_submit_before_completed():
    unit = make_unit()
    unit.snapshot['answers'] = []
    unit.drafts = {}
    unit.results = {}
    with patch('django.db.models.Model.save'):
        unit.save()
        assert unit.progress['status'] == 'pending'
        unit.snapshot['submitted'] = True
        unit.save()
    assert unit.progress['status'] == 'completed'


@pytest.mark.parametrize('value', [None, '', 'not-a-session', 42, True])
def test_invalid_session_identifiers_rejected(value):
    with pytest.raises(ValidationError):
        identifier({'session_id': value}, 'session_id')


def test_readback_reports_only_missing_official_grades_as_retryable():
    from apps.contests.views.exam_grading_unit import compare_grades
    unit = make_unit()
    unit.snapshot['answers'] += [{'exam_answer_id': '4', 'writable': True}, {'exam_answer_id': '5', 'writable': True}]
    unit.drafts['4'] = {'score': 2, 'feedback': 'draft'}
    actual = {'1': {'score': 0, 'feedback': ''}, '2': {'score': None, 'feedback': ''},
              '4': {'score': 3, 'feedback': 'teacher'}}
    result = compare_grades(unit, actual)
    assert result['matched_count'] == 1
    assert result['retry_answer_ids'] == ['2']
    assert result['missing_draft_ids'] == ['5']
    assert result['conflicts'][0]['exam_answer_id'] == '4'
    assert not result['complete']


def test_readback_protects_cleared_grades_and_detects_feedback_differences():
    from apps.contests.views.exam_grading_unit import compare_grades
    unit = make_unit()
    result = compare_grades(unit, {'1': {'score': None, 'feedback': ''}, '2': {'score': 10, 'feedback': 'teacher'}})
    assert result['retry_answer_ids'] == []
    assert [c['reason'] for c in result['conflicts']] == ['grade_cleared_after_submission', 'official_grade_differs']
    assert not result['complete']
    assert compare_grades(unit, {})['conflicts'][0]['reason'] == 'answer_missing'
    assert compare_grades(unit, {'1': {'score': 0, 'feedback': ''}, '2': {'score': 10, 'feedback': ''}})['complete']
