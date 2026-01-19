import pytest
from rest_framework import status

from apps.labs.models import Lab, LabProblem
from apps.problems.models import Problem


@pytest.mark.django_db
def test_teacher_can_create_lab(api_client, user_factory):
    teacher = user_factory(username="teacher1", email="teacher1@example.com", role="teacher")
    api_client.force_authenticate(user=teacher)

    response = api_client.post(
        "/api/v1/labs/",
        {"title": "Lab 1", "description": "Intro lab", "is_published": True},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["title"] == "Lab 1"
    assert response.data["is_published"] is True


@pytest.mark.django_db
def test_student_cannot_create_lab(api_client, user_factory):
    student = user_factory(username="student1", email="student1@example.com", role="student")
    api_client.force_authenticate(user=student)

    response = api_client.post(
        "/api/v1/labs/",
        {"title": "Lab 1", "description": "Intro lab", "is_published": True},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_teacher_can_add_problem_to_lab(api_client, user_factory):
    teacher = user_factory(username="teacher2", email="teacher2@example.com", role="teacher")
    lab = Lab.objects.create(title="Lab 2", owner=teacher, is_published=True)
    problem = Problem.objects.create(
        title="Practice Problem",
        slug="practice-problem",
        is_visible=True,
        is_practice_visible=True,
        created_by=teacher,
    )

    api_client.force_authenticate(user=teacher)
    response = api_client.post(
        f"/api/v1/labs/{lab.id}/problems/",
        {"problem_id": problem.id},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert LabProblem.objects.filter(lab=lab, problem=problem).exists()
