from types import SimpleNamespace

import pytest

from apps.contests.serializers import ContestProblemSerializer
from apps.contests.tests import bind_problem_to_contest
from apps.submissions.models import Submission
from .test_contest_viewset_actions import owner, student, contest, _create_problem


@pytest.mark.django_db
def test_record_summary_uses_best_official_score_and_current_user(owner, student, contest):
    problem = _create_problem('Summary', owner)
    binding = bind_problem_to_contest(contest, problem)
    for user, score, is_test, status in [
        (student, 30, False, 'WA'), (student, 60, False, 'WA'),
        (student, 100, True, 'AC'), (owner, 100, False, 'AC'),
    ]:
        Submission.objects.create(user=user, problem=problem, contest=contest,
                                  score=score, is_test=is_test, status=status,
                                  source_type='contest', language='cpp', code='test')
    serializer = ContestProblemSerializer(context={'request': SimpleNamespace(user=student)})
    assert serializer.get_user_score(binding) == 60
    assert serializer.get_submission_count(binding) == 2
    assert serializer.get_user_status(binding) == 'WA'

    Submission.objects.create(user=student, problem=problem, contest=contest,
                              score=100, status='AC', source_type='contest',
                              language='cpp', code='test')
    fresh = ContestProblemSerializer(context={'request': SimpleNamespace(user=student)})
    assert fresh.get_user_score(binding) == 100
    assert fresh.get_submission_count(binding) == 3
    assert fresh.get_user_status(binding) == 'AC'

    empty_binding = bind_problem_to_contest(contest, _create_problem('Empty', owner), order=1)
    assert fresh.get_user_score(empty_binding) == 0
    assert fresh.get_submission_count(empty_binding) == 0
    assert fresh.get_user_status(empty_binding) is None
