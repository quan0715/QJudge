import pytest
from rest_framework import status
from apps.problems.models import Problem


@pytest.mark.django_db
def test_teacher_can_create_problem(api_client, user_factory):
    teacher = user_factory(
        username="teacher1",
        email="teacher@example.com",
        role="teacher",
        is_staff=False,
    )
    api_client.force_authenticate(user=teacher)

    response = api_client.post(
        "/api/v1/problems/",
        {
            "title": "Two Sum",
            "slug": "two-sum",
            "difficulty": "easy",
            "is_practice_visible": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    problem = Problem.objects.get(slug="two-sum")
    assert problem.created_by == teacher
    assert problem.difficulty == "easy"


@pytest.mark.django_db
def test_student_cannot_create_problem(authenticated_client):
    client, _user = authenticated_client

    response = client.post(
        "/api/v1/problems/",
        {"title": "Forbidden", "slug": "forbidden"},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_teacher_can_update_own_problem(api_client, user_factory):
    teacher = user_factory(
        username="teacher2",
        email="teacher2@example.com",
        role="teacher",
    )
    api_client.force_authenticate(user=teacher)

    create_response = api_client.post(
        "/api/v1/problems/",
        {"title": "Original Title", "slug": "original-title"},
        format="json",
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    problem_id = create_response.json()["id"]

    update_response = api_client.patch(
        f"/api/v1/problems/{problem_id}/",
        {"title": "Updated Title"},
        format="json",
    )

    assert update_response.status_code == status.HTTP_200_OK
    problem = Problem.objects.get(id=problem_id)
    assert problem.title == "Updated Title"
    assert problem.created_by == teacher
