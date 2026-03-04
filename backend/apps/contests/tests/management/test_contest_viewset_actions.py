from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ContestActivity, ExamStatus
from apps.contests import views as contest_views
from apps.problems.models import Problem
from apps.users.models import User


def _create_problem(title: str, owner: User, **kwargs) -> Problem:
    visibility = kwargs.pop("visibility", "private")
    return Problem.objects.create(
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{uuid4().hex[:8]}",
        visibility=visibility,
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
def test_create_contest_sets_owner(api_client: APIClient, owner: User) -> None:
    api_client.force_authenticate(user=owner)

    response = api_client.post(
        "/api/v1/contests/",
        {"name": "Created By API"},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    created = Contest.objects.get(id=response.data["id"])
    assert created.owner_id == owner.id
    assert created.status == "draft"


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
    api_client.force_authenticate(user=owner)

    first = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")
    second = api_client.post(f"/api/v1/contests/{contest.id}/toggle_status/", {}, format="json")

    assert first.status_code == status.HTTP_200_OK
    assert first.data["status"] == "draft"
    assert second.status_code == status.HTTP_200_OK
    assert second.data["status"] == "published"


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
    assert second.data["error"] == "Contest is already archived"


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
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/participants/")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["user"]["id"] == student.id


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
    assert response.data["error"] == "Warning: User has not finished the exam."


@pytest.mark.django_db
def test_participant_management_add_and_remove(
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

    user_not_found = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {"username": "missing-user"},
        format="json",
    )
    assert user_not_found.status_code == status.HTTP_404_NOT_FOUND

    added = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {"username": student.username},
        format="json",
    )
    assert added.status_code == status.HTTP_200_OK
    assert ContestParticipant.objects.filter(contest=contest, user=student).exists()

    duplicate = api_client.post(
        f"/api/v1/contests/{contest.id}/add_participant/",
        {"username": student.username},
        format="json",
    )
    assert duplicate.status_code == status.HTTP_400_BAD_REQUEST

    missing_user_id = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {},
        format="json",
    )
    assert missing_user_id.status_code == status.HTTP_400_BAD_REQUEST

    removed = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": student.id},
        format="json",
    )
    assert removed.status_code == status.HTTP_200_OK
    assert not ContestParticipant.objects.filter(contest=contest, user=student).exists()

    not_found = api_client.post(
        f"/api/v1/contests/{contest.id}/remove_participant/",
        {"user_id": student.id},
        format="json",
    )
    assert not_found.status_code == status.HTTP_404_NOT_FOUND


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
        {"problem_id": 999999},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data["error"] == "Problem not found"


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
def test_publish_problem_to_practice_not_found_and_already_published(
    api_client: APIClient,
    owner: User,
) -> None:
    archived_contest = Contest.objects.create(
        name="Archived Contest For Single Publish",
        owner=owner,
        status="archived",
    )
    source_problem = _create_problem(
        "Publish Source",
        owner,
        created_in_contest=archived_contest,
    )
    archived_contest.contest_problems.create(problem=source_problem, order=0)
    api_client.force_authenticate(user=owner)

    not_found = api_client.post(
        f"/api/v1/contests/{archived_contest.id}/problems/999999/publish/",
        {},
        format="json",
    )
    assert not_found.status_code == status.HTTP_404_NOT_FOUND

    _create_problem(
        "Published Copy",
        owner,
        visibility="public",
        origin_problem=source_problem,
        created_in_contest=archived_contest,
    )
    already_published = api_client.post(
        f"/api/v1/contests/{archived_contest.id}/problems/{source_problem.id}/publish/",
        {},
        format="json",
    )
    assert already_published.status_code == status.HTTP_400_BAD_REQUEST
    assert already_published.data["message"] == "Problem already published to practice"


@pytest.mark.django_db
def test_publish_problems_to_practice_accepts_string_problem_ids(
    api_client: APIClient,
    owner: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    archived_contest = Contest.objects.create(
        name="Archived Contest For Bulk Publish",
        owner=owner,
        status="archived",
    )
    source_problem = _create_problem(
        "Bulk Source",
        owner,
        created_in_contest=archived_contest,
    )
    archived_contest.contest_problems.create(problem=source_problem, order=0)

    from apps.problems import services as problem_services

    created_ids: list[int] = []

    def _clone_problem_to_practice(**kwargs):
        copied = _create_problem(
            "Bulk Copy",
            owner,
            visibility="public",
            created_in_contest=archived_contest,
            origin_problem=source_problem,
        )
        created_ids.append(copied.id)
        return copied

    monkeypatch.setattr(
        problem_services.ProblemService,
        "clone_problem_to_practice",
        staticmethod(_clone_problem_to_practice),
    )

    api_client.force_authenticate(user=owner)
    response = api_client.post(
        f"/api/v1/contests/{archived_contest.id}/publish_to_practice/",
        {"problem_ids": f"{source_problem.id}"},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["created_problem_ids"] == created_ids
    assert len(response.data["created_problem_ids"]) == 1


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
    monkeypatch.setattr(contest_views.ScoreboardService, "calculate", staticmethod(lambda *_a, **_k: result))
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
        raise contest_views.ExportValidationError("invalid export options")

    monkeypatch.setattr(contest_views, "build_contest_download_response", _raise_validation)
    api_client.force_authenticate(user=owner)

    response = api_client.get(f"/api/v1/contests/{contest.id}/download/?scale=1.0")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["error"] == "invalid export options"


@pytest.mark.django_db
def test_download_returns_500_on_unexpected_exception(
    api_client: APIClient,
    owner: User,
    contest: Contest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_unexpected(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(contest_views, "build_contest_download_response", _raise_unexpected)
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

    monkeypatch.setattr(contest_views, "build_student_report_response", _raise_report)
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

    monkeypatch.setattr(contest_views, "build_student_report_response", _raise_report)
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
