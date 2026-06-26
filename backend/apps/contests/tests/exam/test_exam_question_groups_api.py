from datetime import timedelta
from unittest.mock import ANY

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamQuestion


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher():
    from apps.users.models import User

    return User.objects.create_user(
        username="group_teacher",
        email="group_teacher@test.com",
        password="pass123",
        role="teacher",
    )


@pytest.fixture
def student():
    from apps.users.models import User

    return User.objects.create_user(
        username="group_student",
        email="group_student@test.com",
        password="pass123",
        role="student",
    )


@pytest.fixture
def contest(teacher):
    now = timezone.now()
    return Contest.objects.create(
        name="Grouped Paper Contest",
        owner=teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=2),
    )


def groups_url(contest_id, group_id=None):
    base = f"/api/v1/contests/{contest_id}/exam-question-groups/"
    if group_id:
        return f"{base}{group_id}/"
    return base


def questions_url(contest_id, question_id=None):
    base = f"/api/v1/contests/{contest_id}/exam-questions/"
    if question_id:
        return f"{base}{question_id}/"
    return base


def paper_url(contest_id):
    return f"/api/v1/contests/{contest_id}/exam-paper/"


@pytest.mark.django_db
class TestExamQuestionGroupsApi:
    def test_teacher_can_create_group_and_assign_child_questions(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)

        group_res = api_client.post(
            groups_url(contest.id),
            {
                "title": "12-14 題為題組",
                "shared_stem_markdown": "設 $f(x)=x^2$，回答下列問題。",
                "order": 1,
            },
            format="json",
        )

        assert group_res.status_code == status.HTTP_201_CREATED
        assert group_res.data["total_score"] == 0

        q_res = api_client.post(
            questions_url(contest.id),
            {
                "question_type": "essay",
                "prompt": "求 f'(2)。",
                "score": 4,
                "order": 1,
                "group_id": group_res.data["id"],
                "order_in_group": 1,
                "answer_format": "markdown_math",
            },
            format="json",
        )

        assert q_res.status_code == status.HTTP_201_CREATED
        assert q_res.data["group_id"] == group_res.data["id"]
        assert q_res.data["order_in_group"] == 1
        assert q_res.data["answer_format"] == "markdown_math"

        list_res = api_client.get(groups_url(contest.id))
        assert list_res.status_code == status.HTTP_200_OK
        assert list_res.data[0]["total_score"] == 4

    def test_group_reorder_updates_group_and_child_question_orders(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        intro = ExamQuestion.objects.create(
            contest=contest,
            question_type="essay",
            prompt="Intro",
            score=1,
            order=0,
        )
        group_res = api_client.post(
            groups_url(contest.id),
            {
                "title": "Grouped",
                "shared_stem_markdown": "stem",
                "order": 1,
            },
            format="json",
        )
        group_id = group_res.data["id"]
        child_a = ExamQuestion.objects.create(
            contest=contest,
            question_type="essay",
            prompt="A",
            score=2,
            order=1,
            group_id=group_id,
            order_in_group=1,
        )
        child_b = ExamQuestion.objects.create(
            contest=contest,
            question_type="essay",
            prompt="B",
            score=3,
            order=2,
            group_id=group_id,
            order_in_group=2,
        )

        res = api_client.post(
            groups_url(contest.id) + "reorder/",
            {"groups": [{"id": group_id, "order": 0}]},
            format="json",
        )

        assert res.status_code == status.HTTP_200_OK
        intro.refresh_from_db()
        child_a.refresh_from_db()
        child_b.refresh_from_db()
        assert [child_a.order, child_b.order, intro.order] == [0, 1, 2]
        assert res.data[0]["id"] == group_id
        assert res.data[0]["order"] == 0

    def test_student_composite_paper_returns_flat_questions_and_group_index(self, api_client, student, teacher, contest):
        api_client.force_authenticate(user=teacher)
        group_res = api_client.post(
            groups_url(contest.id),
            {
                "title": "15-16 題為題組",
                "shared_stem_markdown": "令 $a_n=n^2$。",
                "order": 0,
            },
            format="json",
        )
        group_id = group_res.data["id"]
        first = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="a_2 = ?",
            options=["2", "4"],
            correct_answer=1,
            score=3,
            order=0,
            group_id=group_id,
            order_in_group=1,
        )
        second = ExamQuestion.objects.create(
            contest=contest,
            question_type="essay",
            prompt="說明一般項。",
            score=5,
            order=1,
            group_id=group_id,
            order_in_group=2,
            answer_format="markdown_math",
        )
        ExamQuestion.objects.create(
            contest=contest,
            question_type="essay",
            prompt="非題組題",
            correct_answer="hidden",
            score=2,
            order=2,
        )
        participant = ContestParticipant.objects.create(
            contest=contest,
            user=student,
            exam_status="in_progress",
            started_at=timezone.now(),
        )

        api_client.force_authenticate(user=student)
        res = api_client.get(paper_url(contest.id))

        assert participant.started_at is not None
        assert res.status_code == status.HTTP_200_OK
        assert [item["id"] for item in res.data["questions"]] == [str(first.id), str(second.id), ANY]
        assert "correct_answer" not in res.data["questions"][0]
        assert res.data["questions"][1]["answer_format"] == "markdown_math"
        assert res.data["groups"] == [
            {
                "id": group_id,
                "title": "15-16 題為題組",
                "shared_stem_markdown": "令 $a_n=n^2$。",
                "order": 0,
                "total_score": 8,
            }
        ]

    def test_question_type_enum_is_not_extended_for_math_work(self):
        from apps.contests.models import ExamQuestionType

        assert list(ExamQuestionType.values) == [
            "true_false",
            "single_choice",
            "multiple_choice",
            "short_answer",
            "essay",
        ]
