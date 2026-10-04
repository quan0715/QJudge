from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionType,
    ExamStatus,
)
from apps.contests.services.exam_scoring import ExamScoringService
from apps.contests.services.locked_question_update import apply_locked_question_update
from apps.users.models import User


@pytest.fixture
def locked_exam():
    teacher = User.objects.create_user(
        username="locked-teacher",
        email="locked-teacher@example.com",
        password="password",
        role="teacher",
    )
    student = User.objects.create_user(
        username="locked-student",
        email="locked-student@example.com",
        password="password",
        role="student",
    )
    contest = Contest.objects.create(
        name="Locked grading exam",
        owner=teacher,
        contest_type="paper_exam",
        status="published",
        start_time=timezone.now() - timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=1),
        results_published=True,
    )
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        started_at=timezone.now() - timedelta(minutes=30),
    )
    objective = ExamQuestion.objects.create(
        contest=contest,
        question_type=ExamQuestionType.SINGLE_CHOICE,
        prompt="Pick one",
        options=["A", "B"],
        correct_answer=0,
        score=Decimal("5"),
        order=0,
    )
    objective_answer = ExamAnswer.objects.create(
        participant=participant,
        question=objective,
        answer={"selected": 1},
        is_correct=False,
        score=Decimal("0"),
        feedback="manual note",
        graded_by=teacher,
        graded_at=timezone.now(),
    )
    essay = ExamQuestion.objects.create(
        contest=contest,
        question_type=ExamQuestionType.ESSAY,
        prompt="Explain",
        correct_answer="Old rubric",
        explanation="Old explanation",
        score=Decimal("10"),
        order=1,
    )
    essay_answer = ExamAnswer.objects.create(
        participant=participant,
        question=essay,
        answer={"text": "Response"},
        is_correct=True,
        score=Decimal("7"),
        feedback="useful old feedback",
        graded_by=teacher,
        graded_at=timezone.now(),
    )
    client = APIClient()
    client.force_authenticate(user=teacher)
    return {
        "client": client,
        "teacher": teacher,
        "contest": contest,
        "participant": participant,
        "objective": objective,
        "objective_answer": objective_answer,
        "essay": essay,
        "essay_answer": essay_answer,
    }


def _participant_total(exam):
    participant = exam["participant"]
    return ExamScoringService(exam["contest"]).get_participant_totals([participant.id])[participant.id]


def question_url(exam, question):
    return f"/api/v1/contests/{exam['contest'].id}/exam-questions/{question.id}/"


@pytest.mark.django_db
def test_locked_update_returns_updated_question(locked_exam):
    updated = apply_locked_question_update(
        question=locked_exam["essay"],
        validated_data={"explanation": "Updated explanation"},
        action="keep",
    )

    assert isinstance(updated, ExamQuestion)
    assert updated.explanation == "Updated explanation"


@pytest.mark.django_db
def test_objective_change_rejects_keep(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["objective"]),
        {"correct_answer": 1, "existing_grades_action": "keep"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    locked_exam["objective"].refresh_from_db()
    assert locked_exam["objective"].correct_answer == 0


@pytest.mark.django_db
def test_regrade_uses_live_rule_recalculates_total_and_unpublishes(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["objective"]),
        {"correct_answer": 1, "existing_grades_action": "regrade"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    locked_exam["objective_answer"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["objective_answer"].is_correct is True
    assert locked_exam["objective_answer"].score == Decimal("5")
    assert locked_exam["objective_answer"].graded_by_id is None
    assert locked_exam["objective_answer"].graded_at is None
    assert locked_exam["objective_answer"].feedback == "manual note"
    assert _participant_total(locked_exam) == 12
    assert locked_exam["contest"].results_published is False


@pytest.mark.django_db
def test_mark_pending_preserves_feedback_and_clears_grading(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["essay"]),
        {"correct_answer": "New rubric", "existing_grades_action": "mark_pending"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    locked_exam["essay_answer"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["essay_answer"].score is None
    assert locked_exam["essay_answer"].is_correct is None
    assert locked_exam["essay_answer"].graded_by_id is None
    assert locked_exam["essay_answer"].graded_at is None
    assert locked_exam["essay_answer"].feedback == "useful old feedback"
    assert locked_exam["contest"].results_published is False


@pytest.mark.django_db
def test_subjective_keep_preserves_grades_and_publication(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["essay"]),
        {"correct_answer": "New rubric", "existing_grades_action": "keep"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    locked_exam["essay_answer"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["essay_answer"].score == Decimal("7")
    assert locked_exam["essay_answer"].graded_by_id == locked_exam["teacher"].id
    assert locked_exam["contest"].results_published is True


@pytest.mark.django_db
def test_locked_content_change_is_rejected(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["essay"]),
        {"prompt": "Changed prompt", "existing_grades_action": "keep"},
        format="json",
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    locked_exam["essay"].refresh_from_db()
    assert locked_exam["essay"].prompt == "Explain"


@pytest.mark.django_db
def test_explanation_only_change_keeps_publication(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["essay"]),
        {"explanation": "Corrected explanation", "existing_grades_action": "keep"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    locked_exam["essay"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["essay"].explanation == "Corrected explanation"
    assert locked_exam["contest"].results_published is True


@pytest.mark.django_db
def test_policy_change_preserves_raw_score_recalculates_and_unpublishes(locked_exam):
    response = locked_exam["client"].patch(
        question_url(locked_exam, locked_exam["essay"]),
        {"score_policy": "excluded", "existing_grades_action": "keep"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    locked_exam["essay_answer"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["essay_answer"].score == Decimal("7")
    assert _participant_total(locked_exam) == 0
    assert locked_exam["contest"].results_published is False


@pytest.mark.django_db
def test_nested_paper_question_route_uses_same_regrade_command(locked_exam):
    response = locked_exam["client"].patch(
        f"/api/v1/contests/{locked_exam['contest'].id}/exam-paper/{locked_exam['objective'].id}/",
        {
            "kind": "question",
            "question": {
                "correct_answer": 1,
                "existing_grades_action": "regrade",
            },
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    locked_exam["objective_answer"].refresh_from_db()
    assert locked_exam["objective_answer"].is_correct is True


@pytest.mark.django_db
def test_rule_and_regrade_roll_back_together(locked_exam, monkeypatch):
    # Fail at the last step inside the transaction, after the rule change,
    # the regrade and the unpublish have all been written.
    def fail_on_commit_registration(_callback):
        raise RuntimeError("late failure")

    monkeypatch.setattr(
        "apps.contests.services.locked_question_update.transaction.on_commit",
        fail_on_commit_registration,
    )

    with pytest.raises(RuntimeError, match="late failure"):
        locked_exam["client"].patch(
            question_url(locked_exam, locked_exam["objective"]),
            {"correct_answer": 1, "existing_grades_action": "regrade"},
            format="json",
        )

    locked_exam["objective"].refresh_from_db()
    locked_exam["objective_answer"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["objective"].correct_answer == 0
    assert locked_exam["objective_answer"].is_correct is False
    assert locked_exam["objective_answer"].score == Decimal("0")
    assert locked_exam["contest"].results_published is True


@pytest.mark.django_db
@pytest.mark.parametrize(('legacy', 'index'), [(True, 1), (False, 0), (True, 0), (False, 1)])
@pytest.mark.parametrize('extra', [{}, {'score': 7}, {'explanation': 'Corrected explanation'}])
def test_legacy_boolean_repair_persists_integer_and_regrades(locked_exam, legacy, index, extra):
    question = locked_exam['objective']
    question.question_type = ExamQuestionType.TRUE_FALSE
    question.correct_answer = legacy
    question.save(update_fields=['question_type', 'correct_answer'])
    answer = locked_exam['objective_answer']
    answer.answer = {'selected': index}
    answer.save(update_fields=['answer'])

    response = locked_exam['client'].patch(
        question_url(locked_exam, question),
        {'correct_answer': index, 'existing_grades_action': 'regrade', **extra},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    question.refresh_from_db()
    answer.refresh_from_db()
    locked_exam['contest'].refresh_from_db()
    assert type(question.correct_answer) is int
    assert question.correct_answer == index
    assert answer.is_correct is True
    assert answer.score == Decimal(extra.get('score', 5))
    assert answer.graded_by_id is None
    assert answer.graded_at is None
    assert locked_exam['contest'].results_published is False
    for field, value in extra.items():
        assert getattr(question, field) == value


@pytest.mark.django_db
def test_legacy_boolean_in_multi_answer_is_not_equal_to_integer(locked_exam):
    question = locked_exam['objective']
    question.question_type = ExamQuestionType.MULTIPLE_CHOICE
    question.correct_answer = [False, True]
    question.save(update_fields=['question_type', 'correct_answer'])
    answer = locked_exam['objective_answer']
    answer.answer = {'selected': [0, 1]}
    answer.save(update_fields=['answer'])

    response = locked_exam['client'].patch(
        question_url(locked_exam, question),
        {'correct_answer': [0, 1], 'existing_grades_action': 'regrade'},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    question.refresh_from_db()
    answer.refresh_from_db()
    assert all(type(index) is int for index in question.correct_answer)
    assert question.correct_answer == [0, 1]
    assert answer.score == Decimal('5')
    assert answer.graded_by_id is None
