from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamQuestion
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="exam_teacher",
        email="exam_teacher@example.com",
        password="testpass123",
        role="teacher",
    )


@pytest.fixture
def student() -> User:
    return User.objects.create_user(
        username="exam_student",
        email="exam_student@example.com",
        password="testpass123",
        role="student",
    )


@pytest.fixture
def contest(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Exam Question Contest",
        owner=teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=2),
    )


@pytest.mark.django_db
def test_teacher_can_crud_exam_questions(
    api_client: APIClient,
    teacher: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=teacher)

    create_res = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "single_choice",
            "prompt": "2 + 2 = ?",
            "options": ["3", "4", "5"],
            "correct_answer": 1,
            "score": 5,
            "order": 0,
        },
        format="json",
    )
    assert create_res.status_code == status.HTTP_201_CREATED
    question_id = create_res.data["id"]

    list_res = api_client.get(f"/api/v1/contests/{contest.id}/exam-questions/")
    assert list_res.status_code == status.HTTP_200_OK
    assert len(list_res.data) == 1
    assert list_res.data[0]["id"] == question_id

    patch_res = api_client.patch(
        f"/api/v1/contests/{contest.id}/exam-questions/{question_id}/",
        {"prompt": "2 + 3 = ?", "correct_answer": 2},
        format="json",
    )
    assert patch_res.status_code == status.HTTP_200_OK
    assert patch_res.data["prompt"] == "2 + 3 = ?"

    second = ExamQuestion.objects.create(
        contest=contest,
        question_type="essay",
        prompt="Explain your steps.",
        score=10,
        order=1,
    )

    reorder_res = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/reorder/",
        {"orders": [{"id": second.id, "order": 0}, {"id": question_id, "order": 1}]},
        format="json",
    )
    assert reorder_res.status_code == status.HTTP_200_OK
    reordered_ids = [item["id"] for item in reorder_res.data]
    assert reordered_ids == [second.id, question_id]

    delete_res = api_client.delete(
        f"/api/v1/contests/{contest.id}/exam-questions/{question_id}/"
    )
    assert delete_res.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_student_cannot_manage_exam_questions(
    api_client: APIClient,
    student: User,
    contest: Contest,
) -> None:
    ContestParticipant.objects.create(contest=contest, user=student)
    api_client.force_authenticate(user=student)

    list_res = api_client.get(f"/api/v1/contests/{contest.id}/exam-questions/")
    assert list_res.status_code == status.HTTP_403_FORBIDDEN

    create_res = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "essay",
            "prompt": "Not allowed",
            "score": 5,
            "order": 0,
        },
        format="json",
    )
    assert create_res.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_create_question_without_order_uses_next_order(
    api_client: APIClient,
    teacher: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=teacher)
    ExamQuestion.objects.create(
        contest=contest,
        question_type="essay",
        prompt="Q1",
        score=3,
        order=0,
    )

    create_res = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "essay",
            "prompt": "Q2",
            "score": 4,
        },
        format="json",
    )
    assert create_res.status_code == status.HTTP_201_CREATED
    assert create_res.data["order"] == 1


@pytest.mark.django_db
def test_validation_for_objective_and_essay_questions(
    api_client: APIClient,
    teacher: User,
    contest: Contest,
) -> None:
    api_client.force_authenticate(user=teacher)

    # objective question missing correct_answer
    missing_answer_res = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "single_choice",
            "prompt": "Choose one",
            "options": ["A", "B"],
            "score": 2,
            "order": 0,
        },
        format="json",
    )
    assert missing_answer_res.status_code == status.HTTP_400_BAD_REQUEST
    details = missing_answer_res.data.get("error", {}).get("details", {})
    assert "correct_answer" in details

    # essay question should not carry options
    essay_with_options_res = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "essay",
            "prompt": "Explain",
            "options": ["N/A"],
            "score": 5,
            "order": 0,
        },
        format="json",
    )
    assert essay_with_options_res.status_code == status.HTTP_400_BAD_REQUEST
    details = essay_with_options_res.data.get("error", {}).get("details", {})
    assert "options" in details
