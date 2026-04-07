"""Tests for counts_toward_grade field and practice keep-latest behavior."""
import uuid

import pytest
from django.utils import timezone
from apps.contests.models import Contest, ContestParticipant
from apps.submissions.models import Submission
from apps.problems.models import Problem
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.fixture
def owner(db):
    suffix = uuid.uuid4().hex[:8]
    return User.objects.create_user(
        username=f"owner_ctg_{suffix}",
        email=f"owner_ctg_{suffix}@example.com",
        password="pw",
    )


@pytest.fixture
def student(db):
    suffix = uuid.uuid4().hex[:8]
    return User.objects.create_user(
        username=f"student_ctg_{suffix}",
        email=f"student_ctg_{suffix}@example.com",
        password="pw",
    )


@pytest.fixture
def problem(db, owner):
    suffix = uuid.uuid4().hex[:8]
    return Problem.objects.create(
        title="Sum",
        slug=f"sum-ctg-{suffix}",
        created_by=owner,
        difficulty="easy",
        time_limit=1000,
        memory_limit=262144,
    )


@pytest.fixture
def practice_contest(db, owner):
    now = timezone.now()
    return Contest.objects.create(
        name="Practice",
        owner=owner,
        delivery_mode="practice",
        counts_toward_grade=False,
        status="published",
        start_time=now - timezone.timedelta(hours=1),
        end_time=now + timezone.timedelta(hours=1),
    )


@pytest.fixture
def homework_contest(db, owner):
    now = timezone.now()
    return Contest.objects.create(
        name="Homework",
        owner=owner,
        delivery_mode="practice",
        counts_toward_grade=True,
        status="published",
        start_time=now - timezone.timedelta(hours=1),
        end_time=now + timezone.timedelta(hours=1),
    )


@pytest.mark.django_db
class TestCountsTowardGradeField:
    def test_default_is_true(self, owner):
        c = Contest.objects.create(name="Default", owner=owner)
        assert c.counts_toward_grade is True

    def test_practice_ungraded(self, practice_contest):
        assert practice_contest.counts_toward_grade is False

    def test_homework_graded(self, homework_contest):
        assert homework_contest.counts_toward_grade is True


@pytest.mark.django_db
class TestPracticeKeepLatestSubmission:
    """When counts_toward_grade=False, only the latest submission per user+problem+contest survives."""

    def test_old_submission_deleted_on_new(self, practice_contest, student, problem):
        ContestParticipant.objects.create(
            contest=practice_contest, user=student, assignment_state="accepted"
        )
        old = Submission.objects.create(
            user=student,
            problem=problem,
            contest=practice_contest,
            source_type="contest",
            language="python",
            code="print(1)",
            status="AC",
        )
        new = Submission.objects.create(
            user=student,
            problem=problem,
            contest=practice_contest,
            source_type="contest",
            language="python",
            code="print(2)",
            status="pending",
        )
        from apps.submissions.services import SubmissionService
        SubmissionService.cleanup_practice_submissions(
            user=student,
            problem=problem,
            contest=practice_contest,
            current_submission=new,
        )
        assert not Submission.objects.filter(pk=old.pk).exists()
        assert Submission.objects.filter(pk=new.pk).exists()

    def test_homework_keeps_all(self, homework_contest, student, problem):
        ContestParticipant.objects.create(
            contest=homework_contest, user=student, assignment_state="accepted"
        )
        old = Submission.objects.create(
            user=student,
            problem=problem,
            contest=homework_contest,
            source_type="contest",
            language="python",
            code="print(1)",
            status="AC",
        )
        new = Submission.objects.create(
            user=student,
            problem=problem,
            contest=homework_contest,
            source_type="contest",
            language="python",
            code="print(2)",
            status="pending",
        )
        from apps.submissions.services import SubmissionService
        SubmissionService.cleanup_practice_submissions(
            user=student,
            problem=problem,
            contest=homework_contest,
            current_submission=new,
        )
        assert Submission.objects.filter(pk=old.pk).exists()
        assert Submission.objects.filter(pk=new.pk).exists()
