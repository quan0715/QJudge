import pytest
from rest_framework.exceptions import ValidationError

from apps.problems.serializers import ProblemAdminSerializer
from apps.users.models import User


@pytest.mark.django_db
def test_problem_admin_serializer_accepts_weight_percent_total_100():
    teacher = User.objects.create_user(
        username="serializer_teacher",
        email="serializer_teacher@example.com",
        password="pass123",
        role="teacher",
    )
    payload = {
        "title": "Weighted Problem",
        "slug": "weighted-problem",
        "difficulty": "easy",
        "time_limit": 1000,
        "memory_limit": 128,
        "visibility": "private",
        "translations": [
            {
                "language": "zh-TW",
                "title": "Weighted Problem",
                "description": "desc",
                "input_description": "in",
                "output_description": "out",
                "hint": "",
            }
        ],
        "test_cases": [
            {"input_data": "1", "output_data": "1", "is_sample": True, "weight_percent": 30, "order": 0},
            {"input_data": "2", "output_data": "2", "is_sample": False, "weight_percent": 70, "order": 1},
        ],
        "language_configs": [],
    }

    serializer = ProblemAdminSerializer(data=payload, context={"request": None})
    assert serializer.is_valid(), serializer.errors
    problem = serializer.save(created_by=teacher)

    rows = list(problem.test_cases.order_by("order").values_list("weight_percent", "score"))
    assert rows == [(30, 30), (70, 70)]


@pytest.mark.django_db
def test_problem_admin_serializer_rejects_weight_percent_total_not_100():
    teacher = User.objects.create_user(
        username="serializer_teacher_invalid",
        email="serializer_teacher_invalid@example.com",
        password="pass123",
        role="teacher",
    )
    payload = {
        "title": "Invalid Weighted Problem",
        "slug": "invalid-weighted-problem",
        "difficulty": "easy",
        "time_limit": 1000,
        "memory_limit": 128,
        "visibility": "private",
        "translations": [
            {
                "language": "zh-TW",
                "title": "Invalid Weighted Problem",
                "description": "desc",
                "input_description": "in",
                "output_description": "out",
                "hint": "",
            }
        ],
        "test_cases": [
            {"input_data": "1", "output_data": "1", "is_sample": True, "weight_percent": 40, "order": 0},
            {"input_data": "2", "output_data": "2", "is_sample": False, "weight_percent": 40, "order": 1},
        ],
        "language_configs": [],
    }

    serializer = ProblemAdminSerializer(data=payload, context={"request": None})
    assert serializer.is_valid(), serializer.errors
    with pytest.raises(ValidationError):
        serializer.save(created_by=teacher)
