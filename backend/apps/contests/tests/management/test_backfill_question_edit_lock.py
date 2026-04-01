from datetime import timedelta
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.contests.models import Contest, ContestParticipant, ExamAnswer, ExamQuestion, ExamStatus
from apps.problems.models import Problem
from apps.submissions.models import Submission
from apps.users.models import User


def _create_problem(owner: User, title: str) -> Problem:
    return Problem.objects.create(
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{uuid4().hex[:8]}",
        created_by=owner,
    )


@pytest.mark.django_db
def test_backfill_locks_contest_from_student_coding_submission():
    teacher = User.objects.create_user("bf_teacher_1", "bf_teacher_1@test.com", "pass", role="teacher")
    student = User.objects.create_user("bf_student_1", "bf_student_1@test.com", "pass", role="student")
    now = timezone.now()
    contest = Contest.objects.create(
        name="Backfill Coding Contest",
        owner=teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )
    problem = _create_problem(teacher, "Backfill Coding Problem")
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.IN_PROGRESS)
    Submission.objects.create(
        user=student,
        problem=problem,
        contest=contest,
        source_type="contest",
        language="python",
        code="print('x')",
        is_test=False,
        status="AC",
    )

    call_command("backfill_contest_question_edit_lock")
    contest.refresh_from_db()
    assert contest.question_edit_locked is True
    assert contest.question_edit_lock_trigger == Contest.QuestionEditLockTrigger.CODING_SUBMISSION


@pytest.mark.django_db
def test_backfill_locks_contest_from_student_non_empty_exam_answer():
    teacher = User.objects.create_user("bf_teacher_2", "bf_teacher_2@test.com", "pass", role="teacher")
    student = User.objects.create_user("bf_student_2", "bf_student_2@test.com", "pass", role="student")
    now = timezone.now()
    contest = Contest.objects.create(
        name="Backfill Exam Contest",
        owner=teacher,
        status="published",
        contest_type="paper_exam",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
        started_at=now - timedelta(minutes=10),
    )
    question = ExamQuestion.objects.create(
        contest=contest,
        question_type="essay",
        prompt="Explain",
        score=5,
        order=0,
    )
    ExamAnswer.objects.create(
        participant=participant,
        question=question,
        answer={"text": "filled"},
    )

    call_command("backfill_contest_question_edit_lock")
    contest.refresh_from_db()
    assert contest.question_edit_locked is True
    assert contest.question_edit_lock_trigger == Contest.QuestionEditLockTrigger.EXAM_ANSWER


@pytest.mark.django_db
def test_backfill_is_idempotent_for_already_locked_contest():
    teacher = User.objects.create_user("bf_teacher_3", "bf_teacher_3@test.com", "pass", role="teacher")
    contest = Contest.objects.create(
        name="Backfill Idempotent Contest",
        owner=teacher,
        status="published",
        question_edit_locked=True,
        question_edit_lock_trigger=Contest.QuestionEditLockTrigger.CODING_SUBMISSION,
        question_edit_locked_at=timezone.now() - timedelta(days=1),
    )
    original_locked_at = contest.question_edit_locked_at

    call_command("backfill_contest_question_edit_lock")
    contest.refresh_from_db()
    assert contest.question_edit_locked is True
    assert contest.question_edit_locked_at == original_locked_at
