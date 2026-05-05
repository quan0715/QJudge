from __future__ import annotations

from datetime import timedelta
from typing import Tuple

import factory
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamStatus
from apps.contests.tests import bind_problem_to_contest
from apps.problems.models import Problem, TestCase as ProblemTestCase
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
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

    slug = factory.Sequence(lambda n: f"problem-{n}")
    created_by = factory.SubFactory(UserFactory, role="teacher")


class ContestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Contest

    name = factory.Sequence(lambda n: f"Contest {n}")
    owner = factory.SubFactory(UserFactory, role="teacher")
    status = "published"
    visibility = "public"
    scoreboard_visible_during_contest = True
    start_time = factory.LazyFunction(lambda: timezone.now() - timedelta(hours=1))
    end_time = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=1))


class ContestParticipantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ContestParticipant

    contest = factory.SubFactory(ContestFactory)
    user = factory.SubFactory(UserFactory)
    exam_status = ExamStatus.IN_PROGRESS


class ContestProblemBindingFactory(factory.django.DjangoModelFactory):
    """Factory that creates a ContestQuestionBinding for a coding problem."""
    class Meta:
        model = ContestQuestionBinding
        exclude = ["_problem"]

    _problem = factory.SubFactory(ProblemFactory)
    contest = factory.SubFactory(ContestFactory)
    question_asset = None
    question_version = None
    coding_problem = factory.LazyAttribute(lambda o: o._problem)
    binding_type = QuestionAsset.AssetType.CODING
    order = 0
    score = 100
    source_mode = "manual"

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        problem = kwargs.get("coding_problem") or kwargs.pop("_problem", None)
        if problem and not problem.question_asset_id:
            from apps.question_bank.question_assets import ensure_problem_question_asset
            ensure_problem_question_asset(problem=problem, actor=problem.created_by)
            problem.refresh_from_db(fields=["question_asset", "question_version"])
        kwargs["question_asset"] = problem.question_asset
        kwargs["question_version"] = problem.question_version
        kwargs["coding_problem"] = problem
        return super()._create(model_class, *args, **kwargs)


class ProblemTestCaseFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProblemTestCase

    problem = factory.SubFactory(ProblemFactory)
    input_data = "1"
    output_data = "1"
    score = 100
    order = 1


class SubmissionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Submission

    user = factory.SubFactory(UserFactory)
    problem = factory.SubFactory(ProblemFactory)
    contest = factory.SubFactory(ContestFactory)
    source_type = "contest"
    language = "python"
    code = "print('ok')"
    status = "WA"
    score = 0
    is_test = False


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def create_contest_with_problem(owner: User, **contest_kwargs: object) -> Tuple[Contest, Problem]:
    contest = ContestFactory(owner=owner, **contest_kwargs)
    problem = ProblemFactory(created_by=owner)
    ProblemTestCaseFactory(problem=problem, score=100)
    bind_problem_to_contest(contest, problem, order=0)
    return contest, problem


@pytest.mark.django_db
def test_standings_hidden_when_scoreboard_disabled(
    api_client: APIClient,
) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory()
    contest, _ = create_contest_with_problem(
        owner=teacher,
        scoreboard_visible_during_contest=False,
    )
    ContestParticipantFactory(contest=contest, user=student)

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/standings/")

    assert response.status_code == 403
    assert "Scoreboard is not visible" in response.data.get("message", "")


@pytest.mark.django_db
def test_standings_visible_when_scoreboard_enabled(
    api_client: APIClient,
) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory()
    contest, _ = create_contest_with_problem(
        owner=teacher,
        scoreboard_visible_during_contest=True,
    )
    ContestParticipantFactory(contest=contest, user=student)

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/standings/")

    assert response.status_code == 200


@pytest.mark.django_db
def test_standings_visible_after_contest_end(
    api_client: APIClient,
) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory()
    contest, _ = create_contest_with_problem(
        owner=teacher,
        scoreboard_visible_during_contest=False,
        end_time=timezone.now() - timedelta(minutes=1),
    )
    ContestParticipantFactory(contest=contest, user=student)

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/standings/")

    assert response.status_code == 200


@pytest.mark.django_db
def test_standings_hides_problem_titles_for_students(
    api_client: APIClient,
) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory()
    contest, _ = create_contest_with_problem(owner=teacher, scoreboard_visible_during_contest=True)
    ContestParticipantFactory(contest=contest, user=student)

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/standings/")

    assert response.status_code == 200
    for problem in response.data.get("problems", []):
        assert problem.get("title") is None


@pytest.mark.django_db
def test_standings_shows_problem_titles_for_admins(
    api_client: APIClient,
) -> None:
    teacher = UserFactory(role="teacher")
    admin = UserFactory(role="admin", is_staff=True)
    contest, _ = create_contest_with_problem(owner=teacher, scoreboard_visible_during_contest=False)
    ContestParticipantFactory(contest=contest, user=admin)

    api_client.force_authenticate(user=admin)
    response = api_client.get(f"/api/v1/contests/{contest.id}/standings/")

    assert response.status_code == 200
    for problem in response.data.get("problems", []):
        assert problem.get("title") is not None


@pytest.mark.django_db
def test_standings_excludes_test_submissions_from_score(
    api_client: APIClient,
) -> None:
    teacher = UserFactory(role="teacher")
    student = UserFactory()
    contest, problem = create_contest_with_problem(
        owner=teacher,
        scoreboard_visible_during_contest=True,
    )
    ContestParticipantFactory(contest=contest, user=student, exam_status=ExamStatus.IN_PROGRESS)

    SubmissionFactory(
        user=student,
        contest=contest,
        problem=problem,
        status="AC",
        score=100,
        is_test=True,
    )
    SubmissionFactory(
        user=student,
        contest=contest,
        problem=problem,
        status="WA",
        score=50,
        is_test=False,
    )

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/standings/")

    assert response.status_code == 200
    standings = response.data.get("standings", [])
    student_row = next(row for row in standings if row["user"]["id"] == student.id)
    assert student_row["total_score"] == 50
