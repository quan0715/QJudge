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
        question_edit_locked=True,
        question_edit_locked_at=timezone.now(),
        question_edit_lock_trigger=Contest.QuestionEditLockTrigger.EXAM_STARTED,
        results_published=True,
    )
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        started_at=timezone.now() - timedelta(minutes=30),
        score=Decimal("0"),
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


def question_url(exam, question):
    return f"/api/v1/contests/{exam['contest'].id}/exam-questions/{question.id}/"


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
    locked_exam["participant"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["objective_answer"].is_correct is True
    assert locked_exam["objective_answer"].score == Decimal("5")
    assert locked_exam["objective_answer"].graded_by_id is None
    assert locked_exam["objective_answer"].graded_at is None
    assert locked_exam["objective_answer"].feedback == "manual note"
    assert locked_exam["participant"].score == Decimal("12")
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
    locked_exam["participant"].refresh_from_db()
    locked_exam["contest"].refresh_from_db()
    assert locked_exam["essay_answer"].score == Decimal("7")
    assert locked_exam["participant"].score == Decimal("0")
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
    def fail_recalculation(_service):
        raise RuntimeError("recalculation failed")

    monkeypatch.setattr(
        "apps.contests.services.locked_question_update.ExamScoringService.recalculate_all",
        fail_recalculation,
    )

    with pytest.raises(RuntimeError, match="recalculation failed"):
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
