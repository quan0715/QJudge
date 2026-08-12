from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contests.models import (
    Contest,
    ContestParticipant,
    ExamAnswer,
    ExamQuestion,
    ExamQuestionType,
)
from apps.contests.services.question_edit_lock import (
    is_contest_question_edit_locked,
)
from apps.problems.models import CodingProblem
from apps.submissions.models import Submission
from apps.users.models import User


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="question-lock-owner",
        email="question-lock-owner@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="question-lock-student",
        email="question-lock-student@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def contest(owner: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Derived Question Lock",
        owner=owner,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.mark.django_db
def test_paper_exam_lock_tracks_current_started_participant(
    contest: Contest,
    student: User,
) -> None:
    contest.contest_type = "paper_exam"
    contest.save(update_fields=["contest_type"])
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        started_at=timezone.now(),
    )

    assert is_contest_question_edit_locked(contest) is True

    participant.delete()
    assert is_contest_question_edit_locked(contest) is False


@pytest.mark.django_db
def test_paper_exam_lock_tracks_current_answer_without_started_at(
    contest: Contest,
    student: User,
) -> None:
    contest.contest_type = "paper_exam"
    contest.save(update_fields=["contest_type"])
    participant = ContestParticipant.objects.create(contest=contest, user=student)
    question = ExamQuestion.objects.create(
        contest=contest,
        question_type=ExamQuestionType.ESSAY,
        prompt="Explain",
        score=5,
        order=0,
    )
    answer = ExamAnswer.objects.create(
        participant=participant,
        question=question,
        answer={"text": "response"},
    )

    assert is_contest_question_edit_locked(contest) is True

    answer.delete()
    assert is_contest_question_edit_locked(contest) is False


@pytest.mark.django_db
def test_coding_lock_tracks_current_student_formal_submission(
    contest: Contest,
    owner: User,
    student: User,
) -> None:
    problem = CodingProblem.objects.create(
        slug="derived-question-lock",
        created_by=owner,
    )
    submission = Submission.objects.create(
        user=student,
        contest=contest,
        problem=problem,
        source_type="contest",
        is_test=False,
        language="python",
        code="print(1)",
    )

    assert is_contest_question_edit_locked(contest) is True

    submission.delete()
    assert is_contest_question_edit_locked(contest) is False


@pytest.mark.django_db
def test_coding_lock_ignores_manager_test_and_practice_submissions(
    contest: Contest,
    owner: User,
    student: User,
) -> None:
    problem = CodingProblem.objects.create(
        slug="ignored-question-lock-evidence",
        created_by=owner,
    )
    Submission.objects.create(
        user=owner,
        contest=contest,
        problem=problem,
        source_type="contest",
        is_test=False,
        language="python",
        code="print('manager')",
    )
    Submission.objects.create(
        user=student,
        contest=contest,
        problem=problem,
        source_type="contest",
        is_test=True,
        language="python",
        code="print('test')",
    )
    Submission.objects.create(
        user=student,
        contest=contest,
        problem=problem,
        source_type="practice",
        is_test=False,
        language="python",
        code="print('practice')",
    )

    assert is_contest_question_edit_locked(contest) is False
