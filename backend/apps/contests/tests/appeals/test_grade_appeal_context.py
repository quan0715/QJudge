"""Appeal displays must keep the submitted answer and full question context."""
import pytest

from apps.contests.models import ContestParticipant, ExamAnswer, ExamQuestion, ExamQuestionGroup, GradeAppeal
from apps.contests.services.paper_question_labels import build_paper_question_labels
from apps.contests.views.grade_appeal import GradeAppealViewSet
from apps.users.models import User, UserProfile


@pytest.fixture(params=[None, '', 'https://example.com/student.png'], ids=['no-profile', 'no-avatar', 'profile-avatar'])
def student_with_profile(request):
    user = User(id=1, username='student')
    # Mirror the API's select_related profile without querying from these database-free tests.
    if request.param is None:
        User._meta.get_field('profile').set_cached_value(user, None)
    else:
        user.profile = UserProfile(user=user, avatar_url=request.param)
    return user, request.param or None


def test_group_summary_uses_full_paper_number_and_preserves_original_answer(student_with_profile):
    student, avatar_url = student_with_profile
    group = ExamQuestionGroup(title='Loop task', shared_stem_markdown='No libraries.\n\n```cpp\nint x;\n```')
    first = ExamQuestion(group=group, order=0, prompt='First child')
    question = ExamQuestion(group=group, order=1, prompt='Check primes')
    participant = ContestParticipant(user=student)
    answer = ExamAnswer(participant=participant, question=question, answer={'text': 'Original code'}, score=2.5)
    ticket = GradeAppeal(exam_answer=answer)
    labels = build_paper_question_labels([first, question])
    summary = GradeAppealViewSet._summary(ticket, labels)
    assert summary['question_label'] == '1(b)'
    assert summary['student_avatar_url'] == avatar_url
    assert 'No libraries.' in summary['question_prompt']
    assert 'int x;' in summary['question_prompt']
    assert 'Check primes' in summary['question_prompt']
    assert question.prompt == 'Check primes'
    assert answer.answer == {'text': 'Original code'}
    assert answer.score == 2.5


def test_standalone_summary_keeps_prompt_and_follows_group_number(student_with_profile):
    student, avatar_url = student_with_profile
    grouped = ExamQuestion(group=ExamQuestionGroup(), order=0)
    question = ExamQuestion(order=1, prompt='Standalone')
    participant = ContestParticipant(user=student)
    ticket = GradeAppeal(exam_answer=ExamAnswer(participant=participant, question=question))
    summary = GradeAppealViewSet._summary(ticket, build_paper_question_labels([grouped, question]))
    assert summary['question_label'] == '2'
    assert summary['student_avatar_url'] == avatar_url
    assert summary['question_prompt'] == 'Standalone'
