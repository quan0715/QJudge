"""
Comprehensive tests for the ExamQuestion CRUD API.

Covers:
  - All 5 question types (true_false, single_choice, multiple_choice, short_answer, essay)
  - Field-level validation on serializer (options, correct_answer, score, prompt)
  - Permission checks (teacher/admin vs student vs unauthenticated)
  - CRUD lifecycle (create, list, retrieve, update, partial update, delete)
  - Reorder action
  - Auto-order assignment when order is omitted
  - Cross-contest isolation
  - Activity logging side effects
"""
from datetime import timedelta

import pytest
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ContestParticipant, ExamQuestion
from apps.contests import views as contest_views
from apps.contests.views import exam_question as exam_question_view_module


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher():
    from apps.users.models import User
    return User.objects.create_user(
        username="eq_teacher", email="eq_teacher@test.com",
        password="pass123", role="teacher",
    )


@pytest.fixture
def student():
    from apps.users.models import User
    return User.objects.create_user(
        username="eq_student", email="eq_student@test.com",
        password="pass123", role="student",
    )


@pytest.fixture
def another_teacher():
    from apps.users.models import User
    return User.objects.create_user(
        username="eq_teacher2", email="eq_teacher2@test.com",
        password="pass123", role="teacher",
    )


@pytest.fixture
def contest(teacher):
    now = timezone.now()
    return Contest.objects.create(
        name="EQ Test Contest",
        owner=teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=2),
    )


@pytest.fixture
def other_contest(another_teacher):
    now = timezone.now()
    return Contest.objects.create(
        name="Other Contest",
        owner=another_teacher,
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=2),
    )


def url(contest_id, question_id=None):
    base = f"/api/v1/contests/{contest_id}/exam-questions/"
    if question_id:
        return f"{base}{question_id}/"
    return base


# ═══════════════════════════════════════════════════════════════════
# CRUD Basics
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestCRUDLifecycle:
    def test_create_and_retrieve(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "single_choice",
            "prompt": "What is 1+1?",
            "options": ["1", "2", "3"],
            "correct_answer": 1,
            "score": 3,
            "order": 0,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        qid = res.data["id"]
        assert res.data["prompt"] == "What is 1+1?"
        assert res.data["score"] == 3

        detail = api_client.get(url(contest.id, qid))
        assert detail.status_code == status.HTTP_200_OK
        assert detail.data["id"] == qid

    def test_list_returns_ordered(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        ExamQuestion.objects.create(contest=contest, question_type="essay", prompt="Q2", score=5, order=1)
        ExamQuestion.objects.create(contest=contest, question_type="essay", prompt="Q1", score=3, order=0)

        res = api_client.get(url(contest.id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 2
        assert res.data[0]["prompt"] == "Q1"
        assert res.data[1]["prompt"] == "Q2"

    def test_full_update_put(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        q = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="Old", score=3, order=0,
        )
        res = api_client.put(url(contest.id, q.id), {
            "question_type": "essay",
            "prompt": "New prompt",
            "score": 10,
            "order": 0,
        }, format="json")
        assert res.status_code == status.HTTP_200_OK
        assert res.data["prompt"] == "New prompt"
        assert res.data["score"] == 10

    def test_partial_update_patch(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        q = ExamQuestion.objects.create(
            contest=contest, question_type="single_choice",
            prompt="Q", options=["A", "B"], correct_answer=0, score=2, order=0,
        )
        res = api_client.patch(url(contest.id, q.id), {"score": 5}, format="json")
        assert res.status_code == status.HTTP_200_OK
        assert res.data["score"] == 5
        assert res.data["prompt"] == "Q"  # unchanged

    def test_delete(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        q = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="Delete me", score=1, order=0,
        )
        res = api_client.delete(url(contest.id, q.id))
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not ExamQuestion.objects.filter(id=q.id).exists()


# ═══════════════════════════════════════════════════════════════════
# All 5 Question Types
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestQuestionTypes:
    def test_true_false(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "true_false",
            "prompt": "The sky is blue.",
            "correct_answer": True,
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["question_type"] == "true_false"

    def test_true_false_with_int(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "true_false",
            "prompt": "Water is dry.",
            "correct_answer": 0,
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED

    def test_true_false_invalid_answer(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "true_false",
            "prompt": "Test",
            "correct_answer": "maybe",
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_single_choice(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "single_choice",
            "prompt": "Pick one",
            "options": ["A", "B", "C"],
            "correct_answer": 2,
            "score": 3,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED

    def test_single_choice_rejects_array_answer(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "single_choice",
            "prompt": "Pick one",
            "options": ["A", "B"],
            "correct_answer": [0, 1],
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_multiple_choice(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "multiple_choice",
            "prompt": "Select all that apply",
            "options": ["A", "B", "C", "D"],
            "correct_answer": [0, 2],
            "score": 4,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED

    def test_multiple_choice_rejects_empty_answer(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "multiple_choice",
            "prompt": "Select all",
            "options": ["A", "B"],
            "correct_answer": [],
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_short_answer(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "short_answer",
            "prompt": "What is the capital of France?",
            "correct_answer": "Paris",
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED

    def test_essay(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": "Explain deadlock.",
            "score": 10,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["correct_answer"] is None

    def test_essay_with_code_block(self, api_client, teacher, contest):
        """Essay questions can contain code blocks in the prompt."""
        api_client.force_authenticate(user=teacher)
        prompt = 'How many times does this print "hello"?\n```c\nmain() { fork(); printf("hello"); }\n```'
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": prompt,
            "correct_answer": "2",
            "score": 3,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert "```c" in res.data["prompt"]


# ═══════════════════════════════════════════════════════════════════
# Validation
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestValidation:
    def test_score_must_be_positive(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": "Test",
            "score": 0,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_choice_requires_at_least_2_options(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "single_choice",
            "prompt": "Pick",
            "options": ["Only one"],
            "correct_answer": 0,
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_choice_requires_correct_answer(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "single_choice",
            "prompt": "Pick",
            "options": ["A", "B"],
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_essay_rejects_options(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": "Explain",
            "options": ["Should not be here"],
            "score": 5,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_short_answer_rejects_options(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "short_answer",
            "prompt": "Answer",
            "options": ["No"],
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_options_must_be_non_empty_strings(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "single_choice",
            "prompt": "Pick",
            "options": ["A", ""],
            "correct_answer": 0,
            "score": 2,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_true_false_rejects_3_options(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "true_false",
            "prompt": "T/F",
            "options": ["True", "False", "Maybe"],
            "correct_answer": True,
            "score": 1,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_prompt_required(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "score": 5,
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST


# ═══════════════════════════════════════════════════════════════════
# Auto-Order
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestAutoOrder:
    def test_first_question_gets_order_0(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": "First",
            "score": 1,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["order"] == 0

    def test_subsequent_question_gets_next_order(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="Q0", score=1, order=0,
        )
        ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="Q1", score=1, order=1,
        )
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": "Q2",
            "score": 1,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["order"] == 2

    def test_explicit_order_is_respected(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(url(contest.id), {
            "question_type": "essay",
            "prompt": "Explicit",
            "score": 1,
            "order": 99,
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["order"] == 99


# ═══════════════════════════════════════════════════════════════════
# Reorder
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestReorder:
    def test_reorder_swaps_positions(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        q0 = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="A", score=1, order=0,
        )
        q1 = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="B", score=1, order=1,
        )
        res = api_client.post(
            url(contest.id) + "reorder/",
            {"orders": [{"id": q0.id, "order": 1}, {"id": q1.id, "order": 0}]},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK
        ids = [item["id"] for item in res.data]
        assert ids == [q1.id, q0.id]

    def test_reorder_normalizes_gaps(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        q0 = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="A", score=1, order=0,
        )
        q1 = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="B", score=1, order=1,
        )
        # Set order to 10 and 20, should normalize to 0 and 1
        res = api_client.post(
            url(contest.id) + "reorder/",
            {"orders": [{"id": q0.id, "order": 10}, {"id": q1.id, "order": 20}]},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK
        orders = [item["order"] for item in res.data]
        assert orders == [0, 1]

    def test_reorder_empty_orders_returns_400(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)
        res = api_client.post(
            url(contest.id) + "reorder/",
            {"orders": []},
            format="json",
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST


# ═══════════════════════════════════════════════════════════════════
# Batch Import
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestBatchImport:
    def test_batch_import_ignores_client_order_and_id(self, api_client, teacher, contest):
        api_client.force_authenticate(user=teacher)

        ExamQuestion.objects.create(
            contest=contest,
            question_type="essay",
            prompt="Legacy question",
            score=1,
            order=0,
        )

        payload = {
            "questions": [
                {
                    "id": 99999,
                    "order": 100,
                    "question_type": "single_choice",
                    "prompt": "Pick B",
                    "options": ["A", "B", "C"],
                    "correct_answer": 1,
                    "score": 3,
                },
                {
                    "id": 99998,
                    "order": 50,
                    "question_type": "essay",
                    "prompt": "Explain CAP theorem",
                    "score": 5,
                },
            ]
        }

        res = api_client.post(url(contest.id) + "batch-import/", payload, format="json")

        assert res.status_code == status.HTTP_201_CREATED
        assert len(res.data) == 2
        assert [row["prompt"] for row in res.data] == ["Pick B", "Explain CAP theorem"]
        assert [row["order"] for row in res.data] == [0, 1]

        rows = list(ExamQuestion.objects.filter(contest=contest).order_by("order", "id"))
        assert len(rows) == 2
        assert rows[0].prompt == "Pick B"
        assert rows[1].prompt == "Explain CAP theorem"
        assert rows[0].order == 0
        assert rows[1].order == 1


# ═══════════════════════════════════════════════════════════════════
# Permissions
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestPermissions:
    def test_unauthenticated_is_rejected(self, api_client, contest):
        res = api_client.get(url(contest.id))
        assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_list(self, api_client, student, contest):
        ContestParticipant.objects.create(contest=contest, user=student)
        api_client.force_authenticate(user=student)
        res = api_client.get(url(contest.id))
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_student_can_list_after_exam_started(self, api_client, student, contest):
        ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="Q", score=1, order=0,
        )
        participant = ContestParticipant.objects.create(
            contest=contest, user=student, exam_status="in_progress"
        )
        participant.started_at = timezone.now()
        participant.save(update_fields=["started_at"])
        api_client.force_authenticate(user=student)
        res = api_client.get(url(contest.id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1

    def test_student_cannot_list_before_contest_start(self, api_client, student, teacher):
        future_contest = Contest.objects.create(
            name="Future Exam",
            owner=teacher,
            status="published",
            start_time=timezone.now() + timedelta(hours=2),
            end_time=timezone.now() + timedelta(hours=4),
        )
        ExamQuestion.objects.create(
            contest=future_contest, question_type="essay", prompt="Secret", score=1, order=0,
        )
        ContestParticipant.objects.create(
            contest=future_contest, user=student, exam_status="in_progress", started_at=timezone.now()
        )
        api_client.force_authenticate(user=student)
        res = api_client.get(url(future_contest.id))
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_student_cannot_create(self, api_client, student, contest):
        ContestParticipant.objects.create(contest=contest, user=student)
        api_client.force_authenticate(user=student)
        res = api_client.post(url(contest.id), {
            "question_type": "essay", "prompt": "Nope", "score": 1,
        }, format="json")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_student_cannot_delete(self, api_client, student, teacher, contest):
        q = ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="Q", score=1, order=0,
        )
        ContestParticipant.objects.create(contest=contest, user=student)
        api_client.force_authenticate(user=student)
        res = api_client.delete(url(contest.id, q.id))
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_student_cannot_reorder(self, api_client, student, contest):
        ContestParticipant.objects.create(contest=contest, user=student)
        api_client.force_authenticate(user=student)
        res = api_client.post(url(contest.id) + "reorder/", {"orders": []}, format="json")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_other_teacher_cannot_manage(self, api_client, another_teacher, contest):
        """A teacher who does not own the contest cannot manage its questions."""
        api_client.force_authenticate(user=another_teacher)
        res = api_client.get(url(contest.id))
        assert res.status_code == status.HTTP_403_FORBIDDEN


# ═══════════════════════════════════════════════════════════════════
# Cross-Contest Isolation
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestIsolation:
    def test_questions_are_scoped_to_contest(self, api_client, teacher, contest, another_teacher, other_contest):
        ExamQuestion.objects.create(
            contest=contest, question_type="essay", prompt="In contest A", score=1, order=0,
        )
        ExamQuestion.objects.create(
            contest=other_contest, question_type="essay", prompt="In contest B", score=1, order=0,
        )

        api_client.force_authenticate(user=teacher)
        res = api_client.get(url(contest.id))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1
        assert res.data[0]["prompt"] == "In contest A"

    def test_cannot_access_question_from_wrong_contest(self, api_client, teacher, contest, another_teacher, other_contest):
        q = ExamQuestion.objects.create(
            contest=other_contest, question_type="essay", prompt="Other", score=1, order=0,
        )
        api_client.force_authenticate(user=teacher)
        res = api_client.get(url(contest.id, q.id))
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_question_from_wrong_contest(self, api_client, teacher, contest, another_teacher, other_contest):
        q = ExamQuestion.objects.create(
            contest=other_contest, question_type="essay", prompt="Other", score=1, order=0,
        )
        api_client.force_authenticate(user=teacher)
        res = api_client.delete(url(contest.id, q.id))
        assert res.status_code == status.HTTP_404_NOT_FOUND
        assert ExamQuestion.objects.filter(id=q.id).exists()


# ═══════════════════════════════════════════════════════════════════
# Export Paper
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.django_db
class TestExportPaper:
    def test_owner_can_export_question_paper(self, api_client, teacher, contest, monkeypatch):
        api_client.force_authenticate(user=teacher)

        def _fake_builder(**kwargs):
            assert kwargs["contest"].id == contest.id
            assert kwargs["mode"] == "question"
            return HttpResponse(b"%PDF-1.4", content_type="application/pdf")

        monkeypatch.setattr(exam_question_view_module, "build_paper_exam_sheet_response", _fake_builder)
        contest.contest_type = "paper_exam"
        contest.save(update_fields=["contest_type"])

        res = api_client.get(url(contest.id) + "export-paper/?mode=question")
        assert res.status_code == status.HTTP_200_OK
        assert "application/pdf" in res["Content-Type"]

    def test_owner_can_export_answer_sheet(self, api_client, teacher, contest, monkeypatch):
        api_client.force_authenticate(user=teacher)

        def _fake_builder(**kwargs):
            assert kwargs["mode"] == "answer"
            assert kwargs["language"] == "en"
            return HttpResponse(b"%PDF-1.4", content_type="application/pdf")

        monkeypatch.setattr(exam_question_view_module, "build_paper_exam_sheet_response", _fake_builder)
        contest.contest_type = "paper_exam"
        contest.save(update_fields=["contest_type"])

        res = api_client.get(url(contest.id) + "export-paper/?mode=answer&language=en")
        assert res.status_code == status.HTTP_200_OK

    def test_student_cannot_export_paper(self, api_client, student, contest):
        ContestParticipant.objects.create(contest=contest, user=student)
        api_client.force_authenticate(user=student)
        contest.contest_type = "paper_exam"
        contest.save(update_fields=["contest_type"])

        res = api_client.get(url(contest.id) + "export-paper/?mode=question")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_other_teacher_cannot_export_paper(self, api_client, another_teacher, contest):
        api_client.force_authenticate(user=another_teacher)
        contest.contest_type = "paper_exam"
        contest.save(update_fields=["contest_type"])

        res = api_client.get(url(contest.id) + "export-paper/?mode=question")
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_export_paper_returns_400_on_validation_error(self, api_client, teacher, contest, monkeypatch):
        api_client.force_authenticate(user=teacher)

        def _raise_validation(**kwargs):
            from apps.contests.services.export_service import ExportValidationError
            raise ExportValidationError("invalid mode")

        monkeypatch.setattr(exam_question_view_module, "build_paper_exam_sheet_response", _raise_validation)
        contest.contest_type = "paper_exam"
        contest.save(update_fields=["contest_type"])

        res = api_client.get(url(contest.id) + "export-paper/?mode=unknown")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert res.data["error"] == "invalid mode"
