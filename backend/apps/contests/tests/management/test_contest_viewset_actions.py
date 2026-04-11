from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ContestActivity, ContestProblem, ExamStatus
from apps.classrooms.models import Classroom, ClassroomContest
from apps.contests import views as contest_views
from apps.contests.views import contest as contest_view_module
from apps.problems.models import Problem, ProblemTranslation, TestCase as ProblemTestCase
from apps.question_bank.models import Question, QuestionBank, QuestionCodingExt
from apps.users.models import User, UserProfile


def _create_problem(title: str, owner: User, **kwargs) -> Problem:
    return Problem.objects.create(
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{uuid4().hex[:8]}",
        created_by=owner,
        **kwargs,
    )


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        username="owner_view_actions",
        email="owner_view_actions@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="student_view_actions",
        email="student_view_actions@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def other_teacher() -> User:
    return User.objects.create_user(
        username="other_teacher_view_actions",
        email="other_teacher_view_actions@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def contest(owner: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Contest View Actions",
        owner=owner,
        status="published",
        visibility="public",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.mark.django_db
def test_partial_update_logs_activity(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/",
        {"name": "Renamed Contest"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert contest.name == "Renamed Contest"
    assert ContestActivity.objects.filter(
        contest=contest,
        user=owner,
        action_type="update_contest",
    ).exists()


@pytest.mark.django_db
def test_retrieve_auto_unlocks_locked_participant(
    api_client: APIClient,
    contest: Contest,
    student: User,
) -> None:
    contest.allow_auto_unlock = True
    contest.auto_unlock_minutes = 1
    contest.end_time = timezone.now() + timedelta(hours=2)
    contest.save(update_fields=["allow_auto_unlock", "auto_unlock_minutes", "end_time"])

    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.LOCKED,
        locked_at=timezone.now() - timedelta(minutes=3),
        violation_count=3,
        lock_reason="focus lost",
    )

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/")

    assert response.status_code == status.HTTP_200_OK
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED
    assert participant.locked_at is None
    assert participant.violation_count == 0
    assert participant.lock_reason == ""


@pytest.mark.django_db
def test_retrieve_auto_submits_when_contest_ended(
    api_client: APIClient,
    contest: Contest,
    student: User,
) -> None:
    contest.end_time = timezone.now() - timedelta(minutes=1)
    contest.save(update_fields=["end_time"])

    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
    )

    api_client.force_authenticate(user=student)
    response = api_client.get(f"/api/v1/contests/{contest.id}/")

    assert response.status_code == status.HTTP_200_OK
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.SUBMITTED
    assert participant.left_at is not None


@pytest.mark.django_db
def test_toggle_status_published_to_draft_and_back(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    contest.results_published = True
    contest.save(update_fields=["results_published"])
    api_client.force_authenticate(user=owner)

    first = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")
    second = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")

    assert first.status_code == status.HTTP_200_OK
    assert first.data["status"] == "draft"
    contest.refresh_from_db()
    assert contest.results_published is False
    assert second.status_code == status.HTTP_200_OK
    assert second.data["status"] == "published"


@pytest.mark.django_db
def test_toggle_status_rejects_publish_without_schedule(
    api_client: APIClient,
    owner: User,
) -> None:
    contest = Contest.objects.create(
        name="Draft Without Schedule",
        owner=owner,
        status="draft",
        visibility="public",
    )
    api_client.force_authenticate(user=owner)

    response = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"] == "Start time and end time are required before publishing."


@pytest.mark.django_db
def test_toggle_status_rejects_archived_contest(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    contest.status = "archived"
    contest.save(update_fields=["status"])
    api_client.force_authenticate(user=owner)

    response = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"] == "Contest is archived and cannot be toggled"


@pytest.mark.django_db
def test_archive_contest_and_reject_second_archive(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=owner)

    first = api_client.post(f"/api/v1/contests/{contest.id}/archive/", {}, format="json")
    second = api_client.post(f"/api/v1/contests/{contest.id}/archive/", {}, format="json")

    assert first.status_code == status.HTTP_200_OK
    assert first.data["status"] == "archived"
    assert second.status_code == status.HTTP_400_BAD_REQUEST
    assert second.data["success"] is False


@pytest.mark.django_db
def test_destroy_requires_owner_even_for_contest_admin(
    api_client: APIClient,
    contest: Contest,
    other_teacher: User,
) -> None:
    contest.admins.add(other_teacher)
    api_client.force_authenticate(user=other_teacher)

    response = api_client.delete(f"/api/v1/contests/{contest.id}/")

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert Contest.objects.filter(id=contest.id).exists()


@pytest.mark.django_db
def test_owner_can_destroy_contest(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.delete(f"/api/v1/contests/{contest.id}/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Contest.objects.filter(id=contest.id).exists()


@pytest.mark.django_db
def test_owner_can_list_participants(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    ContestParticipant.objects.create(contest=contest, user=student)
    UserProfile.objects.update_or_create(
        user=student,
        defaults={"display_name": "Student Display"},
    )
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/participants/")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["user"]["id"] == student.id
    assert response.data[0]["user_display_name"] == "Student Display"
    assert response.data[0]["account_role"] == student.role
    assert response.data[0]["auth_provider"] == student.auth_provider


@pytest.mark.django_db
def test_unlock_and_update_and_reopen_participant(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.LOCKED,
        locked_at=timezone.now(),
        violation_count=2,
        lock_reason="manual lock",
    )
    api_client.force_authenticate(user=owner)

    unlocked = api_client.post(
        f"/api/v1/contests/{contest.id}/unlock_participant/",
        {"user_id": student.id},
        format="json",
    )
    assert unlocked.status_code == status.HTTP_200_OK
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED
    assert participant.locked_at is None

    updated = api_client.patch(
        f"/api/v1/contests/{contest.id}/update_participant/",
        {"user_id": student.id, "exam_status": ExamStatus.SUBMITTED, "lock_reason": "done"},
        format="json",
    )
    assert updated.status_code == status.HTTP_200_OK
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.SUBMITTED
    assert participant.lock_reason == "done"

    reopened = api_client.post(
        f"/api/v1/contests/{contest.id}/reopen_exam/",
        {"user_id": student.id},
        format="json",
    )
    assert reopened.status_code == status.HTTP_200_OK
    participant.refresh_from_db()
    assert participant.exam_status == ExamStatus.PAUSED


@pytest.mark.django_db
def test_participant_management_returns_not_found_for_missing_participant(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=owner)

    unlock = api_client.post(
        f"/api/v1/contests/{contest.id}/unlock_participant/",
        {"user_id": 999999},
        format="json",
    )
    assert unlock.status_code == status.HTTP_404_NOT_FOUND

    update = api_client.patch(
        f"/api/v1/contests/{contest.id}/update_participant/",
        {"user_id": 999999, "exam_status": ExamStatus.PAUSED},
        format="json",
    )
    assert update.status_code == status.HTTP_404_NOT_FOUND

    reopen = api_client.post(
        f"/api/v1/contests/{contest.id}/reopen_exam/",
        {"user_id": 999999},
        format="json",
    )
    assert reopen.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_reopen_exam_rejects_non_submitted_participant(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
    )
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/reopen_exam/",
        {"user_id": student.id},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["success"] is False


@pytest.mark.django_db
def test_participant_roster_mutation_returns_binding_gate_when_unbound(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    api_client.force_authenticate(user=owner)

    missing_username = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {},
        format="json",
    )
    assert missing_username.status_code == status.HTTP_400_BAD_REQUEST
    assert missing_username.data["error"]["code"] == "contest_requires_classroom_binding"

    user_not_found = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {"username": "missing-user"},
        format="json",
    )
    assert user_not_found.status_code == status.HTTP_400_BAD_REQUEST
    assert user_not_found.data["error"]["code"] == "contest_requires_classroom_binding"

    added = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {"username": student.username},
        format="json",
    )
    assert added.status_code == status.HTTP_400_BAD_REQUEST
    assert added.data["error"]["code"] == "contest_requires_classroom_binding"
    assert not ContestParticipant.objects.filter(contest=contest, user=student).exists()

    missing_user_id = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {},
        format="json",
    )
    assert missing_user_id.status_code == status.HTTP_400_BAD_REQUEST
    assert missing_user_id.data["error"]["code"] == "contest_requires_classroom_binding"

    ContestParticipant.objects.create(contest=contest, user=student)
    removed = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": student.id},
        format="json",
    )
    assert removed.status_code == status.HTTP_400_BAD_REQUEST
    assert removed.data["error"]["code"] == "contest_requires_classroom_binding"
    assert ContestParticipant.objects.filter(contest=contest, user=student).exists()


@pytest.mark.django_db
def test_register_rejects_non_published_contest(
    api_client: APIClient,
    owner: User,
    student: User,
) -> None:
    draft_contest = Contest.objects.create(
        name="Draft Contest For Register",
        owner=owner,
        status="draft",
        visibility="public",
    )
    api_client.force_authenticate(user=student)

    response = api_client.post(f"/api/v1/contests/{draft_contest.id}/register/", {}, format="json")

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data["message"] == "Contest is not published"


@pytest.mark.django_db
def test_update_nickname_handles_not_registered_and_blank_nickname(
    api_client: APIClient,
    contest: Contest,
    student: User,
) -> None:
    contest.anonymous_mode_enabled = True
    contest.save(update_fields=["anonymous_mode_enabled"])
    api_client.force_authenticate(user=student)

    not_registered = api_client.post(
        f"/api/v1/contests/{contest.id}/update_nickname/",
        {"nickname": "newname"},
        format="json",
    )
    assert not_registered.status_code == status.HTTP_400_BAD_REQUEST
    assert not_registered.data["error"] == "Not registered for this contest"

    participant = ContestParticipant.objects.create(contest=contest, user=student, nickname="old")
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/update_nickname/",
        {"nickname": "   "},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    participant.refresh_from_db()
    assert participant.nickname == student.username
    assert response.data["nickname"] == student.username


@pytest.mark.django_db
def test_enter_privileged_user_and_leave_without_registration(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    api_client.force_authenticate(user=owner)
    privileged = api_client.post(f"/api/v1/contests/{contest.id}/enter/", {}, format="json")
    assert privileged.status_code == status.HTTP_200_OK
    assert privileged.data["message"] == "Entered successfully (Privileged)"

    api_client.force_authenticate(user=student)
    left = api_client.post(f"/api/v1/contests/{contest.id}/leave/", {}, format="json")
    assert left.status_code == status.HTTP_200_OK
    assert left.data["message"] == "Left successfully"


@pytest.mark.django_db
def test_add_problem_supports_existing_problem_and_title_mode(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_problem = _create_problem("Source Problem", owner)
    cloned_problem = _create_problem("Cloned Problem", owner)
    titled_problem = _create_problem("Created By Title", owner)

    from apps.problems import services as problem_services

    monkeypatch.setattr(
        problem_services.ProblemService,
        "clone_problem",
        staticmethod(lambda source, _contest, _user: cloned_problem),
    )
    monkeypatch.setattr(
        problem_services.ProblemService,
        "create_contest_problem",
        staticmethod(lambda _contest, _user, title: titled_problem if title else cloned_problem),
    )

    api_client.force_authenticate(user=owner)

    by_problem_id = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {"problem_id": source_problem.id},
        format="json",
    )
    assert by_problem_id.status_code == status.HTTP_201_CREATED
    assert by_problem_id.data["contest_id"] == contest.id

    by_title = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {"title": "new title problem"},
        format="json",
    )
    assert by_title.status_code == status.HTTP_201_CREATED

    missing_payload = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {},
        format="json",
    )
    assert missing_payload.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_add_problem_returns_404_when_problem_id_not_found(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {"problem_id": str(uuid4())},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data["success"] is False


@pytest.mark.django_db
def test_add_problem_returns_400_when_problem_id_is_not_uuid(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {"problem_id": "not-a-uuid"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "problem_id" in response.data.get("error", {}).get("details", {})


@pytest.mark.django_db
def test_add_problem_supports_question_bank_copy(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    platform_admin = User.objects.create_user(
        username="platform_admin_for_bank_import",
        email="platform_admin_for_bank_import@example.com",
        password="testpass123",
        role="admin",
        is_staff=True,
    )
    bank = QuestionBank.objects.create(
        owner=platform_admin,
        name="Official Coding Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PUBLIC,
        verified=True,
    )
    question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.CODING,
        title="Bank Coding Question",
        prompt="Use source problem",
        score=100,
        metadata={},
    )
    QuestionCodingExt.objects.create(
        question=question,
        translations=[
            {
                "language": "zh-TW",
                "title": "Bank Coding Question",
                "description": "desc",
                "input_description": "in",
                "output_description": "out",
                "hint": "",
            }
        ],
        test_cases=[
            {"input_data": "1", "output_data": "1", "is_sample": True, "weight_percent": 100, "order": 0},
        ],
        language_configs=[],
        forbidden_keywords=[],
        required_keywords=[],
    )

    api_client.force_authenticate(user=owner)

    copied = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {
            "question_bank_id": str(bank.uuid),
            "question_id": question.id,
            "max_score": 45,
        },
        format="json",
    )
    assert copied.status_code == status.HTTP_201_CREATED

    copied_cp = contest.contest_problems.get(source_question_id=question.id)
    assert copied_cp.problem.title == "Bank Coding Question"
    assert copied_cp.max_score == 45
    assert copied_cp.source_question_id == question.id
    assert copied_cp.source_mode == "copy"
    assert str(copied_cp.source_bank_id) == str(bank.uuid)
    assert copied_cp.source_bank_name == bank.name


@pytest.mark.django_db
def test_add_problem_materializes_coding_ext_when_bank_question_has_no_source_problem(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    platform_admin = User.objects.create_user(
        username="platform_admin_for_materialize",
        email="platform_admin_for_materialize@example.com",
        password="testpass123",
        role="admin",
        is_staff=True,
    )
    bank = QuestionBank.objects.create(
        owner=platform_admin,
        name="Official Coding Bank Materialize",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PUBLIC,
        verified=True,
    )
    question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.CODING,
        title="Materialized Coding Question",
        prompt="prompt",
        difficulty="easy",
        score=100,
    )
    QuestionCodingExt.objects.create(
        question=question,
        translations=[
            {
                "language": "zh-TW",
                "title": "Materialized Coding Question",
                "description": "desc",
                "input_description": "in",
                "output_description": "out",
                "hint": "",
            }
        ],
        test_cases=[
            {"input_data": "1", "output_data": "1", "is_sample": True, "weight_percent": 40, "order": 0},
            {"input_data": "2", "output_data": "2", "is_sample": False, "weight_percent": 60, "order": 1},
        ],
        language_configs=[],
        forbidden_keywords=[],
        required_keywords=[],
    )

    api_client.force_authenticate(user=owner)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {
            "question_bank_id": str(bank.uuid),
            "question_id": question.id,
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    contest_problem = contest.contest_problems.latest("id")
    assert contest_problem.source_question_id == question.id
    assert contest_problem.source_mode == "copy"
    weights = list(contest_problem.problem.test_cases.order_by("order").values_list("weight_percent", flat=True))
    assert weights == [40, 60]


@pytest.mark.django_db
def test_update_contest_problem_score_action(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    problem = _create_problem("Score Update", owner)
    contest_problem = contest.contest_problems.create(problem=problem, order=0, max_score=20)

    api_client.force_authenticate(user=owner)
    response = api_client.patch(
        f"/api/v1/contests/{contest.id}/problems/{contest_problem.id}/score/",
        {"max_score": 35},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    contest_problem.refresh_from_db()
    assert contest_problem.max_score == 35

    invalid = api_client.patch(
        f"/api/v1/contests/{contest.id}/problems/{contest_problem.id}/score/",
        {"max_score": 0},
        format="json",
    )
    assert invalid.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_contest_problem_retrieve_prefers_contest_problem_id(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    problem = _create_problem("Retrieve via contest problem id", owner)
    contest_problem = ContestProblem.objects.create(contest=contest, problem=problem, order=0)

    api_client.force_authenticate(user=owner)
    response = api_client.get(f"/api/v1/contests/{contest.id}/problems/{contest_problem.id}/")

    assert response.status_code == status.HTTP_200_OK
    assert str(response.data["contest_problem_id"]) == str(contest_problem.id)
    assert response.data["id"] == str(problem.id)


@pytest.mark.django_db
def test_contest_problem_destroy_accepts_legacy_problem_id_fallback(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    problem = _create_problem("Destroy via legacy problem id", owner)
    contest_problem = ContestProblem.objects.create(contest=contest, problem=problem, order=0)

    api_client.force_authenticate(user=owner)
    response = api_client.delete(f"/api/v1/contests/{contest.id}/problems/{problem.id}/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ContestProblem.objects.filter(id=contest_problem.id).exists()


@pytest.mark.django_db
def test_contest_problem_destroy_cleans_orphan_asset(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    """When a coding problem has no bank membership and its last binding is
    removed, both the CodingProblem and QuestionAsset should be deleted."""
    from apps.question_bank.models import ContestQuestionBinding, QuestionAsset, QuestionBankMembership

    problem = _create_problem("Orphan cleanup test", owner)
    # Create QuestionAsset for the problem
    asset = QuestionAsset.objects.create(
        owner=owner,
        asset_type=QuestionAsset.AssetType.CODING,
        title=problem.title,
    )
    problem.question_asset = asset
    problem.save(update_fields=["question_asset"])

    binding = ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=asset,
        coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING,
        order=0,
        score=100,
    )

    api_client.force_authenticate(user=owner)
    response = api_client.delete(f"/api/v1/contests/{contest.id}/problems/{binding.id}/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ContestQuestionBinding.objects.filter(id=binding.id).exists()
    assert not Problem.objects.filter(id=problem.id).exists()
    assert not QuestionAsset.objects.filter(id=asset.id).exists()


@pytest.mark.django_db
def test_contest_problem_destroy_keeps_asset_when_in_bank(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    """When a coding problem belongs to a question bank, destroy only removes
    the binding; the CodingProblem and QuestionAsset must survive."""
    from apps.question_bank.models import (
        ContestQuestionBinding, QuestionAsset, QuestionBank, QuestionBankMembership,
    )

    problem = _create_problem("Bank member test", owner)
    asset = QuestionAsset.objects.create(
        owner=owner,
        asset_type=QuestionAsset.AssetType.CODING,
        title=problem.title,
    )
    problem.question_asset = asset
    problem.save(update_fields=["question_asset"])

    bank = QuestionBank.objects.create(name="Test Bank", owner=owner)
    QuestionBankMembership.objects.create(bank=bank, question_asset=asset)

    binding = ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=asset,
        coding_problem=problem,
        binding_type=QuestionAsset.AssetType.CODING,
        order=0,
        score=100,
    )

    api_client.force_authenticate(user=owner)
    response = api_client.delete(f"/api/v1/contests/{contest.id}/problems/{binding.id}/")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ContestQuestionBinding.objects.filter(id=binding.id).exists()
    # Problem and asset should still exist
    assert Problem.objects.filter(id=problem.id).exists()
    assert QuestionAsset.objects.filter(id=asset.id).exists()


@pytest.mark.django_db
def test_contest_question_mutations_blocked_when_question_edit_locked(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    contest.question_edit_locked = True
    contest.question_edit_lock_trigger = Contest.QuestionEditLockTrigger.CODING_SUBMISSION
    contest.question_edit_locked_at = timezone.now()
    contest.save(
        update_fields=[
            "question_edit_locked",
            "question_edit_lock_trigger",
            "question_edit_locked_at",
        ]
    )
    problem = _create_problem("Locked Contest Problem", owner)
    contest_problem = contest.contest_problems.create(problem=problem, order=0, max_score=20)

    api_client.force_authenticate(user=owner)

    add_resp = api_client.post(
        f"/api/v1/contests/{contest.id}/add_problem/",
        {"title": "Should Fail"},
        format="json",
    )
    assert add_resp.status_code == status.HTTP_409_CONFLICT
    assert "CONTEST_QUESTION_EDIT_LOCKED" in str(add_resp.data)

    reorder_resp = api_client.post(
        f"/api/v1/contests/{contest.id}/reorder_problems/",
        {"orders": [{"id": contest_problem.id, "order": 0}]},
        format="json",
    )
    assert reorder_resp.status_code == status.HTTP_409_CONFLICT
    assert "CONTEST_QUESTION_EDIT_LOCKED" in str(reorder_resp.data)

    score_resp = api_client.patch(
        f"/api/v1/contests/{contest.id}/problems/{contest_problem.id}/score/",
        {"max_score": 30},
        format="json",
    )
    assert score_resp.status_code == status.HTTP_409_CONFLICT
    assert "CONTEST_QUESTION_EDIT_LOCKED" in str(score_resp.data)


@pytest.mark.django_db
def test_reorder_problems_updates_and_normalizes_order(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    p1 = _create_problem("P1", owner)
    p2 = _create_problem("P2", owner)
    cp1 = contest.contest_problems.create(problem=p1, order=0)
    cp2 = contest.contest_problems.create(problem=p2, order=1)
    api_client.force_authenticate(user=owner)

    no_orders = api_client.post(
        f"/api/v1/contests/{contest.id}/reorder_problems/",
        {"orders": []},
        format="json",
    )
    assert no_orders.status_code == status.HTTP_400_BAD_REQUEST

    reordered = api_client.post(
        f"/api/v1/contests/{contest.id}/reorder_problems/",
        {"orders": [{"id": cp1.id, "order": 1}, {"id": cp2.id, "order": 0}]},
        format="json",
    )
    assert reordered.status_code == status.HTTP_200_OK
    cp1.refresh_from_db()
    cp2.refresh_from_db()
    assert cp2.order == 0
    assert cp1.order == 1


@pytest.mark.django_db
def test_contest_detail_exposes_question_edit_lock_fields(
    api_client: APIClient,
    owner: User,
    contest: Contest,
) -> None:
    locked_at = timezone.now()
    contest.question_edit_locked = True
    contest.question_edit_locked_at = locked_at
    contest.question_edit_lock_trigger = Contest.QuestionEditLockTrigger.CODING_SUBMISSION
    contest.save(
        update_fields=[
            "question_edit_locked",
            "question_edit_locked_at",
            "question_edit_lock_trigger",
        ]
    )

    api_client.force_authenticate(user=owner)
    response = api_client.get(f"/api/v1/contests/{contest.id}/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["question_edit_locked"] is True
    assert response.data["question_edit_lock_trigger"] == "coding_submission"
    assert response.data["question_edit_locked_at"] is not None


@pytest.mark.django_db
def test_export_results_generates_csv_with_problem_cells(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = SimpleNamespace(
        problems=[
            {"id": 1, "order": 0, "label": "A", "title": "Sum"},
            {"id": 2, "order": 1, "title": "Sort"},
        ],
        standings=[
            {
                "rank": 1,
                "user": {"username": "alice", "email": "alice@example.com"},
                "display_name": "Alice",
                "solved": 1,
                "total_score": 100,
                "time": 5,
                "problems": {
                    1: {"status": "AC", "tries": 2, "time": 5},
                    2: {"status": "WA", "tries": 3, "time": 0},
                },
            }
        ],
    )
    monkeypatch.setattr(contest_view_module.ScoreboardService, "calculate", staticmethod(lambda *_a, **_k: result))
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/export_results/")

    assert response.status_code == status.HTTP_200_OK
    assert "text/csv" in response["Content-Type"]
    csv_body = response.content.decode("utf-8-sig")
    assert "A (Sum)" in csv_body
    assert "B (Sort)" in csv_body
    assert "AC (2 tries, 5m)" in csv_body
    assert "WA (3 tries)" in csv_body


@pytest.mark.django_db
def test_download_returns_400_on_export_validation_error(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_validation(*args, **kwargs):
        from apps.contests.services.export_service import ExportValidationError
        raise ExportValidationError("invalid export options")

    monkeypatch.setattr(contest_view_module, "build_contest_download_response", _raise_validation)
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/download/?scale=1.0")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"] == "Export validation failed"


@pytest.mark.django_db
def test_download_returns_500_on_unexpected_exception(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_unexpected(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(contest_view_module, "build_contest_download_response", _raise_unexpected)
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/download/?scale=1.0")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data["error"] == "Failed to generate file"


@pytest.mark.django_db
def test_participant_report_error_paths(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_client.force_authenticate(user=owner)

    user_not_found = api_client.get(f"/api/v1/contests/{contest.id}/participants/999999/report/?scale=1.0")
    assert user_not_found.status_code == status.HTTP_404_NOT_FOUND

    not_participant = api_client.get(
        f"/api/v1/contests/{contest.id}/participants/{student.id}/report/?scale=1.0"
    )
    assert not_participant.status_code == status.HTTP_404_NOT_FOUND

    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.SUBMITTED)

    def _raise_report(*args, **kwargs):
        raise RuntimeError("report failed")

    monkeypatch.setattr(contest_view_module, "build_student_report_response", _raise_report)
    report_failed = api_client.get(
        f"/api/v1/contests/{contest.id}/participants/{student.id}/report/?scale=1.0"
    )
    assert report_failed.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert report_failed.data["error"] == "Failed to generate report"


@pytest.mark.django_db
def test_my_report_returns_500_when_report_generation_fails(
    api_client: APIClient,
    contest: Contest,
    student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ContestParticipant.objects.create(contest=contest, user=student, exam_status=ExamStatus.SUBMITTED)

    def _raise_report(*args, **kwargs):
        raise RuntimeError("personal report failed")

    monkeypatch.setattr(contest_view_module, "build_student_report_response", _raise_report)
    api_client.force_authenticate(user=student)

    response = api_client.get(f"/api/v1/contests/{contest.id}/my_report/?scale=1.0")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.data["error"] == "Failed to generate report"


# ---------------------------------------------------------------------------
# Lifecycle permission tests (IsContestLifecycleOwner)
# ---------------------------------------------------------------------------

@pytest.fixture
def co_owner_user(contest: Contest) -> User:
    u = User.objects.create_user(
        username="lifecycle_co_owner",
        email="lifecycle_co_owner@example.com",
        password="pass",
        role="teacher",
    )
    contest.admins.add(u)
    return u


@pytest.fixture
def platform_admin_user() -> User:
    return User.objects.create_superuser(
        username="lifecycle_platform_admin",
        email="lifecycle_platform_admin@example.com",
        password="pass",
    )


@pytest.mark.django_db
def test_co_owner_cannot_toggle_status(
    api_client: APIClient, contest: Contest, co_owner_user: User
) -> None:
    """co_owner must be blocked from toggle_status (lifecycle-only)."""
    api_client.force_authenticate(user=co_owner_user)
    response = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_co_owner_cannot_archive(
    api_client: APIClient, contest: Contest, co_owner_user: User
) -> None:
    """co_owner must be blocked from archive (lifecycle-only)."""
    api_client.force_authenticate(user=co_owner_user)
    response = api_client.post(f"/api/v1/contests/{contest.id}/archive/", {}, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_co_owner_cannot_add_admin(
    api_client: APIClient, contest: Contest, co_owner_user: User
) -> None:
    """co_owner must be blocked from add_admin."""
    api_client.force_authenticate(user=co_owner_user)
    response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": "someone"},
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_co_owner_cannot_delete_contest(
    api_client: APIClient, contest: Contest, co_owner_user: User
) -> None:
    """co_owner must be blocked from deleting a contest."""
    api_client.force_authenticate(user=co_owner_user)
    response = api_client.delete(f"/api/v1/contests/{contest.id}/")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert Contest.objects.filter(id=contest.id).exists()


@pytest.mark.django_db
def test_owner_can_toggle_status(
    api_client: APIClient, contest: Contest, owner: User
) -> None:
    api_client.force_authenticate(user=owner)
    response = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_platform_admin_can_toggle_status(
    api_client: APIClient, contest: Contest, platform_admin_user: User
) -> None:
    api_client.force_authenticate(user=platform_admin_user)
    response = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_platform_admin_can_archive(
    api_client: APIClient, contest: Contest, platform_admin_user: User
) -> None:
    api_client.force_authenticate(user=platform_admin_user)
    response = api_client.post(f"/api/v1/contests/{contest.id}/archive/", {}, format="json")
    assert response.status_code == status.HTTP_200_OK
    contest.refresh_from_db()
    assert contest.status == "archived"


@pytest.mark.django_db
def test_classroom_bound_contest_blocks_admin_management_endpoints(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    other_teacher: User,
) -> None:
    classroom = Classroom.objects.create(
        name="Bound Classroom",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    ClassroomContest.objects.create(classroom=classroom, contest=contest)
    api_client.force_authenticate(user=owner)

    admins_response = api_client.get(f"/api/v1/contests/{contest.id}/admins/")
    assert admins_response.status_code == status.HTTP_403_FORBIDDEN
    assert admins_response.data["error"]["code"] == "contest_managed_by_classroom"

    add_response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_admin/",
        {"username": other_teacher.username},
        format="json",
    )
    assert add_response.status_code == status.HTTP_403_FORBIDDEN
    assert add_response.data["error"]["code"] == "contest_managed_by_classroom"

    remove_response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_admin/",
        {"user_id": other_teacher.id},
        format="json",
    )
    assert remove_response.status_code == status.HTTP_403_FORBIDDEN
    assert remove_response.data["error"]["code"] == "contest_managed_by_classroom"


@pytest.mark.django_db
def test_classroom_bound_contest_blocks_participant_roster_mutation_endpoints(
    api_client: APIClient,
    contest: Contest,
    owner: User,
    other_teacher: User,
) -> None:
    classroom = Classroom.objects.create(
        name="Bound Classroom",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    ClassroomContest.objects.create(classroom=classroom, contest=contest)
    api_client.force_authenticate(user=owner)

    add_response = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {"username": other_teacher.username},
        format="json",
    )
    assert add_response.status_code == status.HTTP_403_FORBIDDEN
    assert add_response.data["error"]["code"] == "contest_managed_by_classroom"

    participant = ContestParticipant.objects.create(contest=contest, user=other_teacher)
    remove_response = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": participant.user_id},
        format="json",
    )
    assert remove_response.status_code == status.HTTP_403_FORBIDDEN
    assert remove_response.data["error"]["code"] == "contest_managed_by_classroom"


@pytest.mark.django_db
def test_contest_detail_includes_classroom_binding_flags(
    api_client: APIClient,
    contest: Contest,
    owner: User,
) -> None:
    api_client.force_authenticate(user=owner)
    standalone_response = api_client.get(f"/api/v1/contests/{contest.id}/")
    assert standalone_response.status_code == status.HTTP_200_OK
    assert standalone_response.data["is_classroom_bound"] is False
    assert standalone_response.data["bound_classroom_id"] is None

    classroom = Classroom.objects.create(
        name="Bound Classroom Flags",
        description="",
        owner=owner,
        invite_code=uuid4().hex[:8].upper(),
    )
    ClassroomContest.objects.create(classroom=classroom, contest=contest)

    bound_response = api_client.get(f"/api/v1/contests/{contest.id}/")
    assert bound_response.status_code == status.HTTP_200_OK
    assert bound_response.data["is_classroom_bound"] is True
    assert bound_response.data["bound_classroom_id"] == str(classroom.uuid)


# ---------------------------------------------------------------------------
# remove_participant: evidence-data protection
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_remove_participant_blocked_when_evidence_job_exists(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    """Roster removal is gated; evidence checks are not reached for unbound contests."""
    from apps.contests.models import ExamEvidenceJob, EvidenceJobStatus

    api_client.force_authenticate(user=owner)

    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        started_at=timezone.now() - timedelta(minutes=30),
        left_at=timezone.now(),
    )
    ExamEvidenceJob.objects.create(
        contest=contest,
        participant=participant,
        upload_session_id="sess-001",
        status=EvidenceJobStatus.PENDING,
    )

    resp = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": student.id},
        format="json",
    )

    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "contest_requires_classroom_binding"
    assert ContestParticipant.objects.filter(pk=participant.pk).exists()
    assert ExamEvidenceJob.objects.filter(participant=participant).exists()


@pytest.mark.django_db
def test_remove_participant_allowed_without_evidence(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    """Manual roster removal requires classroom binding or is classroom-managed."""
    api_client.force_authenticate(user=owner)

    ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
        started_at=timezone.now() - timedelta(minutes=30),
        left_at=timezone.now(),
    )

    resp = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": student.id},
        format="json",
    )

    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "contest_requires_classroom_binding"
    assert ContestParticipant.objects.filter(contest=contest, user=student).exists()


@pytest.mark.django_db
def test_remove_participant_blocked_even_for_succeeded_evidence(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
) -> None:
    """Roster removal gate runs before evidence enforcement for unbound contests."""
    from apps.contests.models import ExamEvidenceJob, EvidenceJobStatus

    api_client.force_authenticate(user=owner)

    participant = ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.SUBMITTED,
    )
    ExamEvidenceJob.objects.create(
        contest=contest,
        participant=participant,
        upload_session_id="sess-done",
        status=EvidenceJobStatus.SUCCESS,
        raw_count=10,
    )

    resp = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": student.id},
        format="json",
    )

    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data["error"]["code"] == "contest_requires_classroom_binding"
    assert ContestParticipant.objects.filter(pk=participant.pk).exists()


@pytest.mark.django_db
def test_overview_metrics_uses_heartbeat_as_primary_online_count(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.IN_PROGRESS,
    )

    recent_heartbeat = (timezone.now() - timedelta(seconds=20)).isoformat()
    monkeypatch.setattr(
        contest_view_module,
        "get_last_heartbeat",
        lambda contest_id, user_id: recent_heartbeat if user_id == student.id else None,
    )
    monkeypatch.setattr(
        contest_view_module,
        "get_active_session",
        lambda contest_id, user_id: {"device_id": "device-a"} if user_id == student.id else None,
    )

    api_client.force_authenticate(user=owner)
    response = api_client.get(f"/api/v1/contests/{contest.id}/overview-metrics/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["online_now"] == 1
    assert response.data["online_active_sessions"] == 1
    assert response.data["exam"]["status"] == "running"
    assert response.data["exam"]["contest_type"] == contest.contest_type


@pytest.mark.django_db
def test_overview_metrics_allows_active_session_without_recent_heartbeat(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ContestParticipant.objects.create(
        contest=contest,
        user=student,
        exam_status=ExamStatus.PAUSED,
    )

    stale_heartbeat = (timezone.now() - timedelta(minutes=5)).isoformat()
    monkeypatch.setattr(
        contest_view_module,
        "get_last_heartbeat",
        lambda contest_id, user_id: stale_heartbeat if user_id == student.id else None,
    )
    monkeypatch.setattr(
        contest_view_module,
        "get_active_session",
        lambda contest_id, user_id: {"device_id": "device-b"} if user_id == student.id else None,
    )

    api_client.force_authenticate(user=owner)
    response = api_client.get(f"/api/v1/contests/{contest.id}/overview-metrics/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["online_now"] == 0
    assert response.data["online_active_sessions"] == 1


@pytest.mark.django_db
def test_overview_metrics_handles_exam_status_and_time_progress_boundaries(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(contest_view_module, "get_last_heartbeat", lambda *args, **kwargs: None)
    monkeypatch.setattr(contest_view_module, "get_active_session", lambda *args, **kwargs: None)

    api_client.force_authenticate(user=owner)

    contest.start_time = timezone.now() + timedelta(minutes=10)
    contest.end_time = timezone.now() + timedelta(hours=1, minutes=10)
    contest.save(update_fields=["start_time", "end_time"])

    upcoming = api_client.get(f"/api/v1/contests/{contest.id}/overview-metrics/")
    assert upcoming.status_code == status.HTTP_200_OK
    assert upcoming.data["exam"]["status"] == "upcoming"
    assert upcoming.data["time_progress"]["progress_percent"] == 0
    assert upcoming.data["time_progress"]["is_started"] is False

    contest.start_time = timezone.now() - timedelta(minutes=5)
    contest.end_time = timezone.now() + timedelta(minutes=55)
    contest.save(update_fields=["start_time", "end_time"])

    running = api_client.get(f"/api/v1/contests/{contest.id}/overview-metrics/")
    assert running.status_code == status.HTTP_200_OK
    assert running.data["exam"]["status"] == "running"
    assert 0 < running.data["time_progress"]["progress_percent"] < 100
    assert running.data["time_progress"]["is_started"] is True
    assert running.data["time_progress"]["is_ended"] is False

    contest.start_time = timezone.now() - timedelta(hours=2)
    contest.end_time = timezone.now() - timedelta(minutes=1)
    contest.save(update_fields=["start_time", "end_time"])

    ended = api_client.get(f"/api/v1/contests/{contest.id}/overview-metrics/")
    assert ended.status_code == status.HTTP_200_OK
    assert ended.data["exam"]["status"] == "ended"
    assert ended.data["time_progress"]["progress_percent"] == 100
    assert ended.data["time_progress"]["remaining_seconds"] == 0
    assert ended.data["time_progress"]["is_ended"] is True
