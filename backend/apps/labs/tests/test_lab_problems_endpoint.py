import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.labs.models import Lab, LabProblem
from apps.problems.models import Problem
from apps.users.models import User


@pytest.mark.django_db
def test_get_lab_problems_returns_200():
    client = APIClient()
    teacher = User.objects.create_user(
        username="teacher_lab",
        email="teacher_lab@example.com",
        password="testpass123",
        role="teacher",
    )
    lab = Lab.objects.create(title="Lab", owner=teacher, is_published=True)
    problem = Problem.objects.create(
        title="P1",
        slug="p1",
        is_visible=True,
        is_practice_visible=True,
        created_by=teacher,
    )
    LabProblem.objects.create(lab=lab, problem=problem, order=0)

    client.force_authenticate(user=teacher)
    resp = client.get(f"/api/v1/labs/{lab.id}/problems/")
    assert resp.status_code == status.HTTP_200_OK
    assert isinstance(resp.data, list)
    assert len(resp.data) == 1
