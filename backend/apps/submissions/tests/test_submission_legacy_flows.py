from __future__ import annotations

from datetime import timedelta
from typing import Dict
from unittest.mock import Mock

import factory
import pytest
from django.urls import reverse
from django.utils import timezone
from pytest_mock import MockerFixture
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.problems.models import Problem
from apps.submissions.models import Submission
from apps.users.models import User


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    role = "student"
    is_staff = False

    @factory.post_generation
    def password(self, create: bool, extracted: str | None, **kwargs: object) -> None:
        if not create:
            return
        raw_password = extracted or "password123"
        self.set_password(raw_password)
        self.save(update_fields=["password"])


class ProblemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Problem

    title = factory.Sequence(lambda n: f"Problem {n}")
    slug = factory.Sequence(lambda n: f"problem-{n}")
    difficulty = "easy"
    created_by = factory.SubFactory(UserFactory, role="teacher")
    forbidden_keywords = factory.LazyFunction(list)
    required_keywords = factory.LazyFunction(list)


class ContestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Contest

    name = factory.Sequence(lambda n: f"Contest {n}")
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
    exam_status = ExamStatus.NOT_STARTED
    nickname = ""


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def get_error_message(response) -> str:
    data = response.data or {}
    if "detail" in data:
        return str(data["detail"])
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message", ""))
    return ""


@pytest.fixture(autouse=True)
def run_on_commit_immediately(mocker: MockerFixture) -> None:
    mocker.patch("django.db.transaction.on_commit", side_effect=lambda func: func())


@pytest.fixture
def judge_mocks(mocker: MockerFixture) -> Dict[str, Mock]:
    return {
        "practice": mocker.patch("apps.submissions.views.judge_submission.delay"),
        "contest": mocker.patch("apps.submissions.views.judge_contest_submission.delay"),
    }


@pytest.fixture(autouse=True)
def silence_contest_activity(mocker: MockerFixture) -> None:
    mocker.patch("apps.contests.views.ContestActivityViewSet.log_activity")


@pytest.mark.django_db
def test_forbidden_keyword_sets_kr_and_skips_judge(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user, forbidden_keywords=["eval"])

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "language": "python",
            "code": "print(eval('1+1'))",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 201
    submission = Submission.objects.get(id=response.data["id"])
    assert submission.status == "KR"
    assert "禁用關鍵字" in submission.error_message
    judge_mocks["practice"].assert_not_called()
    judge_mocks["contest"].assert_not_called()


@pytest.mark.django_db
def test_required_keyword_missing_sets_kr(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user, required_keywords=["import"])

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "language": "python",
            "code": "print('hello')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 201
    submission = Submission.objects.get(id=response.data["id"])
    assert submission.status == "KR"
    assert "必須關鍵字" in submission.error_message
    judge_mocks["practice"].assert_not_called()


@pytest.mark.django_db
def test_practice_submission_triggers_judge(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    problem = ProblemFactory(created_by=user)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 201
    submission = Submission.objects.get(id=response.data["id"])
    assert submission.source_type == "practice"
    judge_mocks["practice"].assert_called_once_with(submission.id)


@pytest.mark.django_db
def test_contest_submission_rejected_when_not_published(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    contest = ContestFactory(status="draft")
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=ExamStatus.IN_PROGRESS)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 403
    assert "Contest is not published" in get_error_message(response)
    assert Submission.objects.count() == 0
    judge_mocks["contest"].assert_not_called()


@pytest.mark.django_db
def test_contest_submission_rejected_before_start(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    contest = ContestFactory(
        status="published",
        start_time=timezone.now() + timedelta(hours=1),
        end_time=timezone.now() + timedelta(hours=2),
    )
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=ExamStatus.IN_PROGRESS)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 403
    assert "Contest has not started yet" in get_error_message(response)
    judge_mocks["contest"].assert_not_called()


@pytest.mark.django_db
def test_contest_submission_rejected_after_end(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    contest = ContestFactory(
        status="published",
        start_time=timezone.now() - timedelta(hours=2),
        end_time=timezone.now() - timedelta(hours=1),
    )
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=ExamStatus.IN_PROGRESS)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 403
    assert "Contest has ended" in get_error_message(response)
    judge_mocks["contest"].assert_not_called()


@pytest.mark.django_db
def test_contest_submission_requires_registration(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    contest = ContestFactory(status="published")
    problem = ProblemFactory(created_by=contest.owner)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 403
    assert "not registered" in get_error_message(response).lower()
    judge_mocks["contest"].assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "exam_status, expected_snippet",
    [
        (ExamStatus.PAUSED, "paused"),
        (ExamStatus.LOCKED, "locked"),
        (ExamStatus.SUBMITTED, "finished"),
    ],
)
def test_contest_submission_blocked_by_exam_state(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
    exam_status: str,
    expected_snippet: str,
) -> None:
    user = UserFactory()
    contest = ContestFactory(status="published")
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=exam_status)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 403
    assert expected_snippet in get_error_message(response).lower()
    judge_mocks["contest"].assert_not_called()


@pytest.mark.django_db
def test_contest_submission_privileged_bypasses_restrictions(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    admin = UserFactory(role="admin", is_staff=True)
    contest = ContestFactory(status="draft")
    problem = ProblemFactory(created_by=contest.owner)

    api_client.force_authenticate(user=admin)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 201
    submission = Submission.objects.get(id=response.data["id"])
    assert submission.source_type == "contest"
    judge_mocks["contest"].assert_called_once_with(submission.id)


@pytest.mark.django_db
def test_contest_submission_triggers_judge(
    api_client: APIClient,
    judge_mocks: Dict[str, Mock],
) -> None:
    user = UserFactory()
    contest = ContestFactory(status="published")
    problem = ProblemFactory(created_by=contest.owner)
    ContestParticipantFactory(contest=contest, user=user, exam_status=ExamStatus.IN_PROGRESS)

    api_client.force_authenticate(user=user)
    response = api_client.post(
        reverse("submissions:submission-list"),
        {
            "problem": problem.id,
            "contest": contest.id,
            "language": "python",
            "code": "print('ok')",
            "is_test": False,
        },
        format="json",
    )

    assert response.status_code == 201
    submission = Submission.objects.get(id=response.data["id"])
    judge_mocks["contest"].assert_called_once_with(submission.id)
