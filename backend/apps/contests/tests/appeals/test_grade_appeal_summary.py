"""Database-free checks for the appeal summary contract."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.contests.views.grade_appeal import GradeAppealViewSet


@pytest.mark.parametrize(('status', 'last_author_id', 'waiting_for'), [
    ('open', 12, 'staff'), ('open', 1, 'student'),
    ('closed', 12, None), ('closed', 1, None), ('open', None, None),
])
@pytest.mark.parametrize('avatar', ['https://example.com/student.png', '', None])
def test_summary_preserves_closure_and_tracks_the_latest_author(status, last_author_id, waiting_for, avatar):
    user = SimpleNamespace(id=12, username='student')
    if avatar is not None:
        user.profile = SimpleNamespace(avatar_url=avatar)
    answer = SimpleNamespace(id=5, question_id='q1', question=SimpleNamespace(order=0),
                             participant=SimpleNamespace(user=user))
    ticket = SimpleNamespace(id=9, exam_answer=answer, status=status, created_at=None,
                             closed_at=None, closed_by_id=None, last_message_at=None)
    with patch('apps.contests.views.grade_appeal.question_prompt_with_context', return_value='Explain'):
        data = GradeAppealViewSet._summary(ticket, {'q1': '1(b)'}, last_author_id)
    assert data['status'] == status
    assert data['waiting_for'] == waiting_for
    assert data['student_avatar_url'] == (avatar or None)
