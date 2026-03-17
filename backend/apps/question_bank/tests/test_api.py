import json
from pathlib import Path

import pytest
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ExamQuestion
from apps.problems.models import Problem, ProblemTranslation, TestCase as ProblemTestCase
from apps.question_bank.models import Question, QuestionBank
from apps.question_bank.services import sync_exam_question_to_question_bank, sync_problem_to_question_bank
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="teacher_qb",
        email="teacher_qb@example.com",
        password="pass123",
        role="teacher",
    )


@pytest.fixture
def admin_user() -> User:
    return User.objects.create_user(
        username="admin_qb",
        email="admin_qb@example.com",
        password="pass123",
        role="admin",
        is_staff=True,
    )


@pytest.fixture
def public_platform_bank(admin_user: User) -> QuestionBank:
    return QuestionBank.objects.create(
        owner=admin_user,
        name="官方程式題庫",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PUBLIC,
        verified=True,
    )


@pytest.fixture
def teacher_private_bank(teacher: User) -> QuestionBank:
    return QuestionBank.objects.create(
        owner=teacher,
        name="我的題庫",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
        verified=False,
    )


@pytest.mark.django_db
class TestQuestionBankAPI:
    def test_list_and_create_mine_banks(self, api_client: APIClient, teacher: User):
        api_client.force_authenticate(user=teacher)

        create_resp = api_client.post(
            "/api/v1/question-banks/",
            {
                "name": "My Coding Bank",
                "description": "desc",
                "category": "coding",
                "visibility": "private",
                "verified": False,
            },
            format="json",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED

        list_resp = api_client.get("/api/v1/question-banks/")
        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.data[0]["name"] == "My Coding Bank"

    def test_explore_returns_platform_public_only(
        self,
        api_client: APIClient,
        teacher: User,
        public_platform_bank: QuestionBank,
    ):
        QuestionBank.objects.create(
            owner=teacher,
            name="teacher public bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
            verified=True,
        )
        QuestionBank.objects.create(
            owner=public_platform_bank.owner,
            name="platform not verified",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
            verified=False,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get("/api/v1/question-banks/explore/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["count"] == 1
        assert resp.data["results"][0]["name"] == "官方程式題庫"

    def test_clone_from_explore_into_my_bank(
        self,
        api_client: APIClient,
        teacher: User,
        public_platform_bank: QuestionBank,
    ):
        source = Question.objects.create(
            bank=public_platform_bank,
            question_type=Question.QuestionType.CODING,
            title="A+B",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/questions/{source.id}/clone-to-my-bank/",
            {},
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED

        my_bank = QuestionBank.objects.get(owner=teacher, category=QuestionBank.Category.CODING)
        assert Question.objects.filter(bank=my_bank, title="A+B").exists()

    def test_list_bank_questions_with_uuid_lookup(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        Question.objects.create(
            bank=teacher_private_bank,
            question_type=Question.QuestionType.CODING,
            title="UUID Question",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/"
        )

        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert resp.data[0]["title"] == "UUID Question"

    def test_sync_problem_and_exam_question_dual_write(self, teacher: User):
        problem = Problem.objects.create(
            title="Legacy Problem",
            slug="legacy-problem",
            difficulty="easy",
            created_by=teacher,
            visibility=Problem.ProblemVisibility.PRIVATE,
            display_id="P777",
        )
        ProblemTranslation.objects.create(
            problem=problem,
            language="zh-TW",
            title="Legacy Problem",
            description="legacy description",
            input_description="in",
            output_description="out",
            hint="",
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)

        synced_problem_q = sync_problem_to_question_bank(problem, actor=teacher)
        assert synced_problem_q is not None
        assert synced_problem_q.source_problem_id == problem.id

        contest = Contest.objects.create(name="Exam A", owner=teacher)
        exam_question = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="what?",
            options=["a", "b"],
            correct_answer=0,
            score=2,
            order=0,
        )

        synced_exam_q = sync_exam_question_to_question_bank(exam_question, actor=teacher)
        assert synced_exam_q is not None
        assert synced_exam_q.source_exam_question_id == exam_question.id

    def test_seed_migration_command_outputs_report(
        self,
        tmp_path: Path,
        admin_user: User,
    ):
        Problem.objects.create(
            title="Public P",
            slug="public-p",
            created_by=admin_user,
            visibility=Problem.ProblemVisibility.PUBLIC,
            display_id="P001",
        )

        contest = Contest.objects.create(name="Exam Seed", owner=admin_user)
        ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="",
            options=["A"],
            correct_answer=0,
            score=2,
        )

        report_file = tmp_path / "report.json"
        call_command("migrate_question_bank_seed", report_path=str(report_file))

        assert report_file.exists()
        report = json.loads(report_file.read_text(encoding="utf-8"))
        assert report["migrated_practice_questions"] >= 1
        assert len(report["skipped_exam_questions"]) >= 1

    def test_inbox_lists_unsynced_sources(self, api_client: APIClient, teacher: User):
        problem = Problem.objects.create(
            title="Inbox Coding",
            slug="inbox-coding",
            created_by=teacher,
            visibility=Problem.ProblemVisibility.PRIVATE,
        )
        ProblemTranslation.objects.create(
            problem=problem,
            language="zh-TW",
            title="Inbox Coding",
            description="desc",
            input_description="in",
            output_description="out",
            hint="",
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)

        contest = Contest.objects.create(name="Inbox Exam", owner=teacher, contest_type="paper_exam")
        ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Q?",
            options=["A", "B"],
            correct_answer=0,
            score=2,
            order=0,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get("/api/v1/question-banks/inbox/")

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["counts"]["coding"] >= 1
        assert resp.data["counts"]["exam"] >= 1
        assert any(item["source_type"] == "problem" for item in resp.data["coding"])
        assert any(item["source_type"] == "exam_question" for item in resp.data["exam"])

    def test_inbox_ingest_moves_unsynced_problem_into_selected_bank(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        target_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Target Coding Bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PRIVATE,
            verified=False,
        )
        problem = Problem.objects.create(
            title="Needs Ingest",
            slug="needs-ingest",
            created_by=teacher,
            visibility=Problem.ProblemVisibility.PRIVATE,
        )
        ProblemTranslation.objects.create(
            problem=problem,
            language="zh-TW",
            title="Needs Ingest",
            description="desc",
            input_description="in",
            output_description="out",
            hint="",
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)

        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            "/api/v1/question-banks/inbox/ingest/",
            {
                "target_bank_id": str(target_bank.uuid),
                "items": [{"source_type": "problem", "source_id": problem.id}],
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["ingested_count"] == 1
        assert Question.objects.filter(
            bank=target_bank,
            source_problem=problem,
        ).exists()
