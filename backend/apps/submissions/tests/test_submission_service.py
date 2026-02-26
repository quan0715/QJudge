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
from apps.problems.models import Problem
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
        model = Problem

    title = factory.Sequence(lambda n: f"SvcProblem {n}")
    slug = factory.Sequence(lambda n: f"svc-problem-{n}")
    difficulty = "easy"
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
    nickname = ""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def run_on_commit_immediately(mocker: MockerFixture) -> None:
    mocker.patch("django.db.transaction.on_commit", side_effect=lambda func: func())


@pytest.fixture
def judge_mock(mocker: MockerFixture) -> Mock:
    return mocker.patch("apps.submissions.services.judge_submission.apply_async")


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
