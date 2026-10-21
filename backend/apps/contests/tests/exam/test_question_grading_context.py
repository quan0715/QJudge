"""Grading must preserve shared instructions without modifying editable prompts."""
from apps.contests.models import ExamQuestion, ExamQuestionGroup, ExamAnswer
from apps.contests.serializers import ExamQuestionSerializer, ExamAnswerDetailSerializer


def grading_data(question):
    serializer = ExamQuestionSerializer(question)
    for field in list(serializer.fields):
        if field not in {'prompt', 'grading_prompt'}:
            serializer.fields.pop(field)
    return serializer.data


def test_grading_prompt_contains_shared_instructions_and_child():
    group = ExamQuestionGroup(title='Loop exercise', shared_stem_markdown='Do not use library functions.\n\n```cpp\nint x;\n```')
    question = ExamQuestion(group=group, prompt='Check whether x is prime.', question_type='essay', score=5)
    prompt = grading_data(question).get('grading_prompt', '')
    assert 'Loop exercise' in prompt
    assert 'Do not use library functions.' in prompt
    assert '```cpp\nint x;\n```' in prompt
    assert 'Check whether x is prime.' in prompt
    assert question.prompt == 'Check whether x is prime.'
    answer = ExamAnswer(question=question)
    assert ExamAnswerDetailSerializer().get_question_prompt(answer) == prompt


def test_ungrouped_grading_prompt_preserves_original_text():
    question = ExamQuestion(prompt='Standalone question', question_type='essay', score=2)
    assert grading_data(question).get('grading_prompt') == question.prompt
