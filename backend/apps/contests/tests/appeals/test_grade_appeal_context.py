"""Appeal displays must keep the submitted answer and full question context."""
from apps.contests.models import ContestParticipant, ExamAnswer, ExamQuestion, ExamQuestionGroup, GradeAppeal
from apps.contests.services.paper_question_labels import build_paper_question_labels
from apps.contests.views.grade_appeal import GradeAppealViewSet
from apps.users.models import User


def test_group_summary_uses_full_paper_number_and_preserves_original_answer():
    group = ExamQuestionGroup(title='Loop task', shared_stem_markdown='No libraries.\n\n```cpp\nint x;\n```')
    first = ExamQuestion(group=group, order=0, prompt='First child')
    question = ExamQuestion(group=group, order=1, prompt='Check primes')
    participant = ContestParticipant(user=User(id=1, username='student'))
    answer = ExamAnswer(participant=participant, question=question, answer={'text': 'Original code'}, score=2.5)
    ticket = GradeAppeal(exam_answer=answer)
    labels = build_paper_question_labels([first, question])
    summary = GradeAppealViewSet._summary(ticket, labels)
    assert summary['question_label'] == '1(b)'
    assert 'No libraries.' in summary['question_prompt']
    assert 'int x;' in summary['question_prompt']
    assert 'Check primes' in summary['question_prompt']
    assert question.prompt == 'Check primes'
    assert answer.answer == {'text': 'Original code'}
    assert answer.score == 2.5


def test_standalone_summary_keeps_prompt_and_follows_group_number():
    grouped = ExamQuestion(group=ExamQuestionGroup(), order=0)
    question = ExamQuestion(order=1, prompt='Standalone')
    participant = ContestParticipant(user=User(id=1, username='student'))
    ticket = GradeAppeal(exam_answer=ExamAnswer(participant=participant, question=question))
    summary = GradeAppealViewSet._summary(ticket, build_paper_question_labels([grouped, question]))
    assert summary['question_label'] == '2'
    assert summary['question_prompt'] == 'Standalone'
