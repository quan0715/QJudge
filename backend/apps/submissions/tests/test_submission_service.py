"""
Unit tests for SubmissionService.create_and_dispatch().

Tests the service layer directly (without going through the API view)
to verify queue routing, keyword rejection, and activity logging.
"""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import Mock

import factory
import pytest
from django.utils import timezone
from pytest_mock import MockerFixture

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.problems.models import CodingProblem
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset, QuestionVersion
from apps.submissions.models import Submission
from apps.submissions.services import SubmissionService
from apps.submissions.access_policy import SubmissionAccessError
from apps.users.models import User


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"svc_user{n}")
    email = factory.Sequence(lambda n: f"svc_user{n}@example.com")
    role = "student"
    is_staff = False

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        if not create:
            return
        self.set_password(extracted or "password123")
        self.save(update_fields=["password"])


class ProblemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = CodingProblem

    slug = factory.Sequence(lambda n: f"svc-problem-{n}")
    created_by = factory.SubFactory(UserFactory, role="teacher")
    forbidden_keywords = factory.LazyFunction(list)
    required_keywords = factory.LazyFunction(list)


class ContestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Contest

    name = factory.Sequence(lambda n: f"SvcContest {n}")
    owner = factory.SubFactory(UserFactory, role="teacher")
    status = "published"
    visibility = "public"
    start_time = factory.LazyFunction(lambda: timezone.now() - timedelta(hours=1))
    end_time = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=1))


class ContestParticipantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ContestParticipant

    contest = factory.SubFactory(ContestFactory)
    user = factory.SubFactory(UserFactory)
    exam_status = ExamStatus.IN_PROGRESS


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def run_on_commit_immediately(mocker: MockerFixture) -> None:
    mocker.patch("django.db.transaction.on_commit", side_effect=lambda func: func())


@pytest.fixture
def judge_mock(mocker: MockerFixture) -> Mock:
    return mocker.patch("apps.submissions.tasks.judge_submission.apply_async")


@pytest.fixture(autouse=True)
def silence_contest_activity(mocker: MockerFixture) -> Mock:
    return mocker.patch("apps.contests.views.ContestActivityViewSet.log_activity")


# ---------------------------------------------------------------------------
# Tests: Queue routing
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_practice_dispatches_to_default_queue(judge_mock: Mock) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user)

    submission = SubmissionService.create_and_dispatch(
        user=user,
        data={"problem": problem, "language": "python", "code": "print('ok')"},
    )

    assert submission.source_type == "practice"
    judge_mock.assert_called_once_with(args=[submission.id], queue="default")


@pytest.mark.django_db
def test_contest_dispatches_to_high_priority_queue(judge_mock: Mock) -> None:
    user = UserFactory()
    contest = ContestFactory()
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user)

    submission = SubmissionService.create_and_dispatch(
        user=user,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('ok')",
            "contest": contest,
        },
    )

    assert submission.source_type == "contest"
    judge_mock.assert_called_once_with(args=[submission.id], queue="high_priority")


# ---------------------------------------------------------------------------
# Tests: Keyword rejection skips judging
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_forbidden_keyword_skips_dispatch(judge_mock: Mock) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user, forbidden_keywords=["eval"])

    submission = SubmissionService.create_and_dispatch(
        user=user,
        data={"problem": problem, "language": "python", "code": "eval('x')"},
    )

    assert submission.status == "KR"
    assert "禁用關鍵字" in submission.error_message
    judge_mock.assert_not_called()


@pytest.mark.django_db
def test_required_keyword_missing_skips_dispatch(judge_mock: Mock) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user, required_keywords=["import"])

    submission = SubmissionService.create_and_dispatch(
        user=user,
        data={"problem": problem, "language": "python", "code": "print('hello')"},
    )

    assert submission.status == "KR"
    assert "必須關鍵字" in submission.error_message
    judge_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Tests: Activity logging
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_contest_submission_logs_activity(
    judge_mock: Mock,
    silence_contest_activity: Mock,
) -> None:
    user = UserFactory()
    contest = ContestFactory()
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user)

    SubmissionService.create_and_dispatch(
        user=user,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('ok')",
            "contest": contest,
        },
    )

    silence_contest_activity.assert_called_once()
    call_args = silence_contest_activity.call_args
    assert call_args[0][0] == contest
    assert call_args[0][1] == user
    assert call_args[0][2] == "submit_code"


@pytest.mark.django_db
def test_practice_submission_does_not_log_activity(
    judge_mock: Mock,
    silence_contest_activity: Mock,
) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user)

    SubmissionService.create_and_dispatch(
        user=user,
        data={"problem": problem, "language": "python", "code": "print('ok')"},
    )

    silence_contest_activity.assert_not_called()


# ---------------------------------------------------------------------------
# Tests: Access policy (contest restrictions)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_rejected_contest_submission_raises_access_error(judge_mock: Mock) -> None:
    user = UserFactory()
    contest = ContestFactory(status="draft")
    problem = ProblemFactory(created_by=contest.owner)

    with pytest.raises(SubmissionAccessError, match="not published"):
        SubmissionService.create_and_dispatch(
            user=user,
            data={
                "problem": problem,
                "language": "python",
                "code": "print('ok')",
                "contest": contest,
            },
        )

    assert Submission.objects.count() == 0
    judge_mock.assert_not_called()


@pytest.mark.django_db
def test_not_started_exam_submission_raises_access_error(judge_mock: Mock) -> None:
    user = UserFactory()
    contest = ContestFactory(status="published", cheat_detection_enabled=True)
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=ExamStatus.NOT_STARTED)

    with pytest.raises(SubmissionAccessError, match="start the exam"):
        SubmissionService.create_and_dispatch(
            user=user,
            data={
                "problem": problem,
                "language": "python",
                "code": "print('ok')",
                "contest": contest,
            },
        )

    assert Submission.objects.count() == 0
    judge_mock.assert_not_called()


@pytest.mark.django_db
def test_not_started_non_exam_submission_is_allowed(judge_mock: Mock) -> None:
    user = UserFactory()
    contest = ContestFactory(status="published", cheat_detection_enabled=False)
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=ExamStatus.NOT_STARTED)

    submission = SubmissionService.create_and_dispatch(
        user=user,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('ok')",
            "contest": contest,
        },
    )

    assert submission.source_type == "contest"
    judge_mock.assert_called_once_with(args=[submission.id], queue="high_priority")


# ---------------------------------------------------------------------------
# Tests: Contest question edit lock trigger
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_student_formal_contest_submission_locks_question_editing(judge_mock: Mock) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory(role="student")
    contest = ContestFactory(owner=teacher)
    problem = ProblemFactory(created_by=teacher)
    ContestParticipantFactory(contest=contest, user=student)

    SubmissionService.create_and_dispatch(
        user=student,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('ok')",
            "contest": contest,
        },
    )

    contest.refresh_from_db()
    assert contest.question_edit_locked is True
    assert contest.question_edit_lock_trigger == Contest.QuestionEditLockTrigger.CODING_SUBMISSION
    assert contest.question_edit_locked_at is not None


@pytest.mark.django_db
def test_contest_submission_sets_binding_fk_from_problem_instance(judge_mock: Mock) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory(role="student")
    contest = ContestFactory(owner=teacher)
    problem = ProblemFactory(created_by=teacher)
    ContestParticipantFactory(contest=contest, user=student)
    asset = QuestionAsset.objects.create(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.CODING,
        title="test",
    )
    version = QuestionVersion.objects.create(
        question_asset=asset,
        version_number=1,
        title="test",
        created_by=teacher,
    )
    asset.latest_version = version
    asset.save(update_fields=["latest_version"])
    binding = ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=asset,
        question_version=version,
        coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING,
        score=100,
        created_by=teacher,
    )

    submission = SubmissionService.create_and_dispatch(
        user=student,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('ok')",
            "contest": contest,
        },
    )

    assert submission.contest_question_binding_id == binding.id


@pytest.mark.django_db
def test_practice_assignment_submitted_at_is_only_set_once(judge_mock: Mock) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory(role="student")
    contest = ContestFactory(owner=teacher, delivery_mode="practice")
    problem = ProblemFactory(created_by=teacher)
    original_submitted_at = timezone.now() - timedelta(days=1)
    participant = ContestParticipantFactory(
        contest=contest,
        user=student,
        assignment_state="accepted",
        submitted_at=original_submitted_at,
    )

    SubmissionService.create_and_dispatch(
        user=student,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('ok')",
            "contest": contest,
        },
    )

    participant.refresh_from_db()
    assert participant.assignment_state == "submitted"
    assert participant.submitted_at == original_submitted_at


@pytest.mark.django_db
def test_privileged_contest_submission_does_not_lock_question_editing(judge_mock: Mock) -> None:
    owner = UserFactory(role="teacher")
    contest = ContestFactory(owner=owner)
    problem = ProblemFactory(created_by=owner)

    SubmissionService.create_and_dispatch(
        user=owner,
        data={
            "problem": problem,
            "language": "python",
            "code": "print('owner test')",
            "contest": contest,
        },
    )

    contest.refresh_from_db()
    assert contest.question_edit_locked is False
    assert contest.question_edit_lock_trigger in (None, "")
