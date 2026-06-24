import json
import uuid
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient
from PIL import Image

from apps.contests.models import Contest, ExamQuestion
from apps.contests.tests import bind_problem_to_contest
from apps.problems.models import CodingProblem, TestCase as ProblemTestCase
from apps.question_bank.bank_workflows import (
    clone_membership_to_bank,
    is_publicly_accessible_bank,
    upsert_exam_question_into_bank,
    upsert_problem_into_bank,
)
from apps.question_bank.models import QuestionAsset, QuestionBank, QuestionBankMembership
from apps.question_bank.question_assets import create_question_asset, ensure_question_bank_membership
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
        review_status=QuestionBank.ReviewStatus.APPROVED,
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


def create_bank_membership(
    *,
    bank: QuestionBank,
    owner: User,
    title: str = "Bank Item",
    prompt: str = "desc",
    question_type: str = "coding",
    score: int = 100,
    order: int = 0,
    metadata: dict | None = None,
    payload_extra: dict | None = None,
) -> QuestionBankMembership:
    if question_type == "coding":
        asset_type = QuestionAsset.AssetType.CODING
        payload = {
            "score": score,
            "order": order,
            "difficulty": "easy",
            "time_limit": 1000,
            "memory_limit": 128,
            "options": [],
            "correct_answer": None,
            "metadata": metadata or {},
            "description": prompt,
            "input_description": "",
            "output_description": "",
            "hint": "",
            "test_cases": [],
            "language_configs": [],
            "forbidden_keywords": [],
            "required_keywords": [],
        }
    else:
        asset_type = QuestionAsset.AssetType.SINGLE_CHOICE
        payload = {
            "question_type": "single_choice",
            "score": score,
            "order": order,
            "options": ["A", "B"],
            "correct_answer": 0,
            "metadata": metadata or {},
        }
    payload.update(payload_extra or {})
    asset, _version = create_question_asset(
        owner=owner,
        asset_type=asset_type,
        title=title,
        prompt=prompt,
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload=payload,
        actor=owner,
    )
    return ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=order,
        actor=owner,
    )


@pytest.mark.django_db
class TestQuestionBankAPI:
    @staticmethod
    def _png_file(name: str = "cover.png", size=(8, 8)) -> SimpleUploadedFile:
        buf = BytesIO()
        Image.new("RGB", size=size, color=(220, 45, 89)).save(buf, format="PNG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")

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

    def test_patch_and_get_bank_icon_cover(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=teacher)

        patch_resp = api_client.patch(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/",
            {
                "icon": "code",
                "cover_url": "https://example.com/bank-cover.png",
            },
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK
        assert patch_resp.data["icon"] == "code"
        assert patch_resp.data["cover_url"] == "https://example.com/bank-cover.png"

        get_resp = api_client.get(f"/api/v1/question-banks/{teacher_private_bank.uuid}/")
        assert get_resp.status_code == status.HTTP_200_OK
        assert get_resp.data["icon"] == "code"
        assert get_resp.data["cover_url"] == "https://example.com/bank-cover.png"

    def test_create_multiple_active_banks_same_category(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=teacher)

        resp = api_client.post(
            "/api/v1/question-banks/",
            {
                "name": "Another Coding Bank",
                "description": "desc",
                "category": "coding",
                "visibility": "private",
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_201_CREATED
        assert QuestionBank.objects.filter(
            owner=teacher,
            category=QuestionBank.Category.CODING,
            is_archived=False,
        ).count() == 2

    @patch("apps.question_bank.views.store_markdown_image")
    @patch("apps.question_bank.views.build_markdown_image_object_key", return_value="question-bank/cover-1.png")
    def test_upload_cover_success(
        self,
        _mock_key,
        _mock_store,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/upload_cover/",
            {"file": self._png_file()},
            format="multipart",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert "cover_url" in resp.data
        teacher_private_bank.refresh_from_db()
        assert teacher_private_bank.cover_url == resp.data["cover_url"]

    def test_upload_cover_missing_file(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/upload_cover/",
            {},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data["success"] is False

    def test_upload_cover_invalid_format(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=teacher)
        bad = SimpleUploadedFile("cover.txt", b"not-an-image", content_type="text/plain")
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/upload_cover/",
            {"file": bad},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    @override_settings(MARKDOWN_IMAGE_MAX_BYTES=10)
    def test_upload_cover_too_large(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/upload_cover/",
            {"file": self._png_file()},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_explore_returns_public_approved_banks(
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
            review_status=QuestionBank.ReviewStatus.APPROVED,
        )
        QuestionBank.objects.create(
            owner=User.objects.create_user(
                username="admin2_qb", email="admin2_qb@example.com", password="x", role="admin", is_staff=True
            ),
            name="platform not verified",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
            verified=False,
            review_status=QuestionBank.ReviewStatus.PENDING,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get("/api/v1/question-banks/explore/")
        assert resp.status_code == status.HTTP_200_OK
        names = {row["name"] for row in resp.data["results"]}
        assert resp.data["count"] == 2
        assert "官方程式題庫" in names
        assert "teacher public bank" in names

    def test_teacher_submit_for_review_and_admin_approve(
        self,
        api_client: APIClient,
        teacher: User,
        admin_user: User,
        teacher_private_bank: QuestionBank,
    ):
        create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Needs Review",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        submit_resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/submit-for-review/",
            {},
            format="json",
        )
        assert submit_resp.status_code == status.HTTP_200_OK
        assert submit_resp.data["review_status"] == QuestionBank.ReviewStatus.PENDING
        assert submit_resp.data["visibility"] == QuestionBank.Visibility.PUBLIC

        api_client.force_authenticate(user=admin_user)
        review_resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/review/",
            {"decision": "approve", "note": "LGTM"},
            format="json",
        )
        assert review_resp.status_code == status.HTTP_200_OK
        assert review_resp.data["review_status"] == QuestionBank.ReviewStatus.APPROVED
        assert review_resp.data["verified"] is True

        teacher_private_bank.refresh_from_db()
        assert teacher_private_bank.review_status == QuestionBank.ReviewStatus.APPROVED
        assert teacher_private_bank.verified is True
        assert teacher_private_bank.reviewed_by_id == admin_user.id

    def test_teacher_submit_for_review_and_admin_reject(
        self,
        api_client: APIClient,
        teacher: User,
        admin_user: User,
        teacher_private_bank: QuestionBank,
    ):
        create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Needs Review",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        submit_resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/submit-for-review/",
            {},
            format="json",
        )
        assert submit_resp.status_code == status.HTTP_200_OK

        api_client.force_authenticate(user=admin_user)
        review_resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/review/",
            {"decision": "reject", "note": "Need better tests"},
            format="json",
        )
        assert review_resp.status_code == status.HTTP_200_OK
        assert review_resp.data["review_status"] == QuestionBank.ReviewStatus.REJECTED
        assert review_resp.data["verified"] is False

    def test_review_requires_admin(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Needs Review",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        submit_resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/submit-for-review/",
            {},
            format="json",
        )
        assert submit_resp.status_code == status.HTTP_200_OK

        review_resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/review/",
            {"decision": "approve", "note": "should fail"},
            format="json",
        )
        assert review_resp.status_code == status.HTTP_403_FORBIDDEN

    def test_submit_for_review_requires_owner(
        self,
        api_client: APIClient,
        admin_user: User,
        teacher_private_bank: QuestionBank,
    ):
        api_client.force_authenticate(user=admin_user)
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/submit-for-review/",
            {},
            format="json",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_clone_from_explore_into_my_bank(
        self,
        api_client: APIClient,
        teacher: User,
        public_platform_bank: QuestionBank,
    ):
        source = create_bank_membership(
            bank=public_platform_bank,
            owner=public_platform_bank.owner,
            title="A+B",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{public_platform_bank.uuid}/questions/{source.id}/clone-to-my-bank/",
            {},
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED

        my_bank = QuestionBank.objects.get(owner=teacher, category=QuestionBank.Category.CODING)
        cloned = QuestionBankMembership.objects.get(bank=my_bank)
        source.refresh_from_db()
        assert source.question_asset_id is not None
        assert cloned.question_asset_id == source.question_asset_id

    def test_clone_from_explore_reuses_existing_asset_entry_in_target_bank(
        self,
        api_client: APIClient,
        teacher: User,
        public_platform_bank: QuestionBank,
    ):
        source = create_bank_membership(
            bank=public_platform_bank,
            owner=public_platform_bank.owner,
            title="Reusable",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        first_resp = api_client.post(
            f"/api/v1/question-banks/{public_platform_bank.uuid}/questions/{source.id}/clone-to-my-bank/",
            {},
            format="json",
        )
        assert first_resp.status_code == status.HTTP_201_CREATED

        second_resp = api_client.post(
            f"/api/v1/question-banks/{public_platform_bank.uuid}/questions/{source.id}/clone-to-my-bank/",
            {},
            format="json",
        )
        assert second_resp.status_code == status.HTTP_201_CREATED

        my_bank = QuestionBank.objects.get(owner=teacher, category=QuestionBank.Category.CODING)
        assert QuestionBankMembership.objects.filter(bank=my_bank, question_asset=source.question_asset).count() == 1
        cloned = QuestionBankMembership.objects.get(bank=my_bank, question_asset=source.question_asset)
        assert str(second_resp.data["id"]) == str(cloned.id)

    def test_list_bank_questions_with_uuid_lookup(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
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

    def test_list_platform_public_bank_questions_is_allowed_for_non_owner(
        self,
        api_client: APIClient,
        teacher: User,
        public_platform_bank: QuestionBank,
    ):
        create_bank_membership(
            bank=public_platform_bank,
            owner=public_platform_bank.owner,
            title="Platform Question",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get(f"/api/v1/question-banks/{public_platform_bank.uuid}/questions/")

        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert resp.data[0]["title"] == "Platform Question"

    def test_list_bank_questions_stably_exposes_canonical_ids(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        membership = create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Canonical Row",
            prompt="desc",
            score=100,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get(f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/")

        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert "question_asset_id" in resp.data[0]
        assert "question_version_id" in resp.data[0]
        assert resp.data[0]["question_asset_id"] == str(membership.question_asset_id)
        assert resp.data[0]["question_version_id"] == str(membership.question_asset.latest_version_id)

    def test_list_bank_questions_projects_from_canonical_asset(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Canonical Title",
            prompt="canonical prompt",
            score=100,
            payload_extra={
                "description": "canonical description",
                "test_cases": [{"input": "1", "output": "1"}],
            },
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get(f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/")

        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert resp.data[0]["title"] == "Canonical Title"
        assert resp.data[0]["prompt"] == "canonical prompt"
        assert resp.data[0]["coding_ext"]["description"] == "canonical description"
        assert resp.data[0]["coding_ext"]["test_cases"] == [{"input": "1", "output": "1"}]

    def test_list_bank_questions_can_render_canonical_membership(
        self,
        api_client: APIClient,
        teacher: User,
        teacher_private_bank: QuestionBank,
    ):
        from apps.question_bank.question_assets import create_question_asset, ensure_question_bank_membership

        asset, version = create_question_asset(
            owner=teacher,
            asset_type="coding",
            title="Canonical Only",
            prompt="prompt",
            visibility="private",
            payload={
                "score": 100,
                "order": 0,
                "difficulty": "easy",
                "time_limit": 1000,
                "memory_limit": 128,
                "options": [],
                "correct_answer": None,
                "metadata": {},
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            },
            actor=teacher,
        )
        membership = ensure_question_bank_membership(
            bank=teacher_private_bank,
            question_asset=asset,
            order=0,
            actor=teacher,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get(f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/")

        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1
        assert resp.data[0]["id"] == str(membership.id)
        assert resp.data[0]["title"] == "Canonical Only"
        assert resp.data[0]["question_asset_id"] == str(asset.id)
        assert resp.data[0]["question_version_id"] == str(version.id)
        assert resp.data[0]["coding_ext"]["description"] == ""

    def test_upsert_problem_and_exam_question_into_bank(self, teacher: User):
        bank_coding = QuestionBank.objects.create(
            owner=teacher,
            name="Coding Bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        problem = CodingProblem.objects.create(
            slug="canonical-problem",
            created_by=teacher,
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)

        # Create asset (source of truth for content)
        from apps.question_bank.question_assets import write_coding_content_to_asset
        asset, version = write_coding_content_to_asset(
            owner=teacher, title="Canonical Problem", prompt="canonical description",
            difficulty="easy", content_fields={
                "description": "canonical description",
                "input_description": "in", "output_description": "out", "hint": "",
            }, source_type="problem", source_id=str(problem.id), actor=teacher,
        )
        problem.question_asset = asset
        problem.question_version = version
        problem.save(update_fields=["question_asset", "question_version"])

        synced_problem_membership = upsert_problem_into_bank(problem, bank=bank_coding, created_by=teacher)
        assert synced_problem_membership is not None
        problem_payload = synced_problem_membership.question_asset.latest_version.payload
        assert problem_payload["source_type"] == "problem"
        assert problem_payload["source_id"] == str(problem.id)

        bank_exam = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
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

        synced_exam_membership = upsert_exam_question_into_bank(exam_question, bank=bank_exam, created_by=teacher)
        assert synced_exam_membership is not None
        exam_payload = synced_exam_membership.question_asset.latest_version.payload
        assert exam_payload["source_type"] == "exam_question"
        assert exam_payload["source_id"] == str(exam_question.id)

    def test_create_exam_question_api_does_not_500_with_duplicate_exam_banks(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank A",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
            verified=False,
        )

        contest = Contest.objects.create(name="Exam API Duplicate", owner=teacher, contest_type="paper_exam")

        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/contests/{contest.id}/exam-questions/",
            {
                "question_type": "single_choice",
                "prompt": "API should not 500",
                "options": ["A", "B"],
                "correct_answer": 0,
                "score": 2,
                "order": 0,
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_201_CREATED

    def test_upsert_exam_question_into_bank_syncs_exam_question_source_fields(
        self,
        teacher: User,
    ):
        bank_exam = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        contest = Contest.objects.create(name="Exam Sync", owner=teacher, contest_type="paper_exam")
        exam_question = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="what?",
            options=["a", "b"],
            correct_answer=0,
            score=2,
            order=0,
        )

        synced_exam_membership = upsert_exam_question_into_bank(exam_question, bank=bank_exam, created_by=teacher)
        exam_question.refresh_from_db()

        assert synced_exam_membership is not None
        payload = synced_exam_membership.question_asset.latest_version.payload
        assert payload["source_type"] == "exam_question"
        assert payload["source_id"] == str(exam_question.id)
        assert str(exam_question.source_bank_id) == str(bank_exam.uuid)
        assert exam_question.source_bank_name == bank_exam.name
        assert str(exam_question.source_question_id) == str(synced_exam_membership.id)
        assert exam_question.source_mode == "copy"

    def test_upsert_exam_question_into_bank_rejects_non_reconstructible_question(
        self,
        teacher: User,
    ):
        bank_exam = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        contest = Contest.objects.create(name="Broken Exam Sync", owner=teacher, contest_type="paper_exam")
        exam_question = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Broken choice question",
            options=[],
            correct_answer=None,
            score=2,
            order=0,
        )

        with pytest.raises(ValueError, match="not reconstructible"):
            upsert_exam_question_into_bank(exam_question, bank=bank_exam, created_by=teacher)

        exam_question.refresh_from_db()
        assert exam_question.source_bank_id is None
        assert exam_question.source_question_id is None
        assert exam_question.source_mode == "manual"

    def test_seed_migration_command_outputs_report(
        self,
        tmp_path: Path,
        admin_user: User,
    ):
        CodingProblem.objects.create(
            slug="public-p",
            created_by=admin_user,
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
        asset = QuestionAsset.objects.create(
            owner=teacher, asset_type=QuestionAsset.AssetType.CODING,
            title="Inbox Coding",
            payload={"difficulty": "medium",
                "description": "desc", "input_description": "in",
                "output_description": "out", "hint": "",
            },
        )
        problem = CodingProblem.objects.create(
            slug="inbox-coding",
            created_by=teacher,
            question_asset=asset,
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
        ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Imported from bank",
            options=["A", "B"],
            correct_answer=1,
            score=2,
            order=1,
            source_bank_id=uuid.uuid4(),
            source_bank_name="Official Exam Bank",
            source_question_id=uuid.uuid4(),
            source_mode="reference",
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.get("/api/v1/question-banks/inbox/")

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["counts"]["coding"] >= 1
        assert resp.data["counts"]["exam"] >= 1
        assert any(item["source_type"] == "problem" for item in resp.data["coding"])
        assert any(item["source_type"] == "exam_question" for item in resp.data["exam"])
        assert all(item["title"] != "Imported from bank" for item in resp.data["exam"])

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
        problem = CodingProblem.objects.create(
            slug="needs-ingest",
            created_by=teacher,
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)

        from apps.question_bank.question_assets import write_coding_content_to_asset
        asset, version = write_coding_content_to_asset(
            owner=teacher, title="Needs Ingest", prompt="desc",
            difficulty="medium", content_fields={
                "description": "desc", "input_description": "in",
                "output_description": "out", "hint": "",
            }, source_type="problem", source_id=str(problem.id), actor=teacher,
        )
        problem.question_asset = asset
        problem.question_version = version
        problem.save(update_fields=["question_asset", "question_version"])

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
        assert QuestionBankMembership.objects.filter(
            bank=target_bank,
            question_asset=problem.question_asset,
        ).exists()

    def test_inbox_ingest_problem_when_creator_null_but_contest_owner(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        target_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Target Coding Bank Null Creator",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PRIVATE,
            verified=False,
        )
        problem = CodingProblem.objects.create(
            slug="contest-linked-no-creator",
            created_by=None,
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)

        contest = Contest.objects.create(
            name="Coding Contest For Ingest",
            owner=teacher,
            contest_type="coding",
        )
        bind_problem_to_contest(contest, problem, order=0)

        from apps.question_bank.question_assets import write_coding_content_to_asset

        asset, _version = write_coding_content_to_asset(
            owner=teacher,
            title="Contest Linked No Creator",
            prompt="desc",
            difficulty="medium",
            content_fields={},
            source_type="problem",
            source_id=str(problem.id),
            actor=teacher,
        )
        problem.question_asset = asset
        problem.question_version = _version
        problem.save(update_fields=["question_asset", "question_version"])

        api_client.force_authenticate(user=teacher)
        inbox_resp = api_client.get("/api/v1/question-banks/inbox/?category=coding")
        assert inbox_resp.status_code == status.HTTP_200_OK
        assert any(item["source_id"] == str(problem.id) for item in inbox_resp.data["coding"])

        resp = api_client.post(
            "/api/v1/question-banks/inbox/ingest/",
            {
                "target_bank_id": str(target_bank.uuid),
                "items": [{"source_type": "problem", "source_id": str(problem.id)}],
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["ingested_count"] == 1
        assert QuestionBankMembership.objects.filter(
            bank=target_bank,
            question_asset=problem.question_asset,
        ).exists()

    def test_inbox_lists_problem_when_only_existing_sync_is_inaccessible(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        other_teacher = User.objects.create_user(
            username="other_inaccessible_bank_owner",
            email="other_inaccessible_bank_owner@example.com",
            password="pass123",
            role="teacher",
        )
        target_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Teacher Coding Bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        foreign_bank = QuestionBank.objects.create(
            owner=other_teacher,
            name="Foreign Coding Bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        from apps.question_bank.question_assets import write_coding_content_to_asset

        problem = CodingProblem.objects.create(
            slug="needs-re-ingest",
            created_by=teacher,
        )
        ProblemTestCase.objects.create(problem=problem, input_data="1", output_data="1", score=100)
        asset, version = write_coding_content_to_asset(
            owner=teacher,
            title="Foreign Copy",
            prompt="desc",
            difficulty="medium",
            content_fields={
                "description": "desc", "input_description": "in",
                "output_description": "out", "hint": "",
            },
            source_type="problem",
            source_id=str(problem.id),
            actor=teacher,
        )
        problem.question_asset = asset
        problem.question_version = version
        problem.save(update_fields=["question_asset", "question_version"])
        ensure_question_bank_membership(
            bank=foreign_bank,
            question_asset=asset,
            order=0,
            actor=other_teacher,
        )

        api_client.force_authenticate(user=teacher)
        inbox_resp = api_client.get("/api/v1/question-banks/inbox/?category=coding")
        assert inbox_resp.status_code == status.HTTP_200_OK
        assert any(item["source_id"] == str(problem.id) for item in inbox_resp.data["coding"])

        ingest_resp = api_client.post(
            "/api/v1/question-banks/inbox/ingest/",
            {
                "target_bank_id": str(target_bank.uuid),
                "items": [{"source_type": "problem", "source_id": problem.id}],
            },
            format="json",
        )
        assert ingest_resp.status_code == status.HTTP_200_OK
        assert QuestionBankMembership.objects.filter(
            bank=target_bank,
            question_asset=problem.question_asset,
        ).exists()

    def test_inbox_lists_exam_question_when_only_existing_sync_is_archived(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        archived_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Archived Exam Bank",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
            is_archived=True,
        )
        contest = Contest.objects.create(name="Archived Exam Sync", owner=teacher, contest_type="paper_exam")
        exam_question = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Archived sync question",
            options=["A", "B"],
            correct_answer=0,
            score=2,
            order=0,
        )
        create_bank_membership(
            bank=archived_bank,
            owner=teacher,
            title="Archived exam copy",
            prompt=exam_question.prompt,
            score=exam_question.score,
            order=0,
            question_type="exam",
            payload_extra={
                "options": exam_question.options,
                "correct_answer": exam_question.correct_answer,
                "source_type": "exam_question",
                "source_id": str(exam_question.id),
                "source_contest_id": str(contest.id),
            },
        )

        api_client.force_authenticate(user=teacher)
        inbox_resp = api_client.get("/api/v1/question-banks/inbox/?category=exam")
        assert inbox_resp.status_code == status.HTTP_200_OK
        assert any(item["source_id"] == str(exam_question.id) for item in inbox_resp.data["exam"])

    def test_inbox_ingest_exam_question_syncs_source_fields_and_moves_bank(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        first_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank A",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        contest = Contest.objects.create(name="Inbox Exam Sync", owner=teacher, contest_type="paper_exam")
        exam_question = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Q?",
            options=["A", "B"],
            correct_answer=0,
            score=2,
            order=0,
        )

        api_client.force_authenticate(user=teacher)

        first_resp = api_client.post(
            "/api/v1/question-banks/inbox/ingest/",
            {
                "target_bank_id": str(first_bank.uuid),
                "items": [{"source_type": "exam_question", "source_id": str(exam_question.id)}],
            },
            format="json",
        )
        assert first_resp.status_code == status.HTTP_200_OK

        exam_question.refresh_from_db()
        first_membership = QuestionBankMembership.objects.get(
            bank=first_bank,
            question_asset=exam_question.question_asset,
        )
        assert str(exam_question.source_bank_id) == str(first_bank.uuid)
        assert exam_question.source_bank_name == first_bank.name
        assert str(exam_question.source_question_id) == str(first_membership.id)
        assert exam_question.source_mode == "copy"

        # Archive first bank so the constraint allows a new EXAM bank for same teacher.
        first_bank.is_archived = True
        first_bank.save(update_fields=["is_archived"])
        second_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank B",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
        )

        second_resp = api_client.post(
            "/api/v1/question-banks/inbox/ingest/",
            {
                "target_bank_id": str(second_bank.uuid),
                "items": [{"source_type": "exam_question", "source_id": str(exam_question.id)}],
            },
            format="json",
        )
        assert second_resp.status_code == status.HTTP_200_OK

        exam_question.refresh_from_db()
        moved_membership = QuestionBankMembership.objects.get(
            bank=second_bank,
            question_asset=exam_question.question_asset,
        )
        assert str(exam_question.source_bank_id) == str(second_bank.uuid)
        assert exam_question.source_bank_name == second_bank.name
        assert str(exam_question.source_question_id) == str(moved_membership.id)
        assert exam_question.source_mode == "copy"

    def test_inbox_ingest_rejects_non_reconstructible_exam_question(
        self,
        api_client: APIClient,
        teacher: User,
    ):
        target_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank Reject Invalid",
            category=QuestionBank.Category.EXAM,
            visibility=QuestionBank.Visibility.PRIVATE,
        )
        contest = Contest.objects.create(name="Inbox Invalid Exam", owner=teacher, contest_type="paper_exam")
        exam_question = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Broken exam question",
            options=[],
            correct_answer=None,
            score=2,
            order=0,
        )

        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            "/api/v1/question-banks/inbox/ingest/",
            {
                "target_bank_id": str(target_bank.uuid),
                "items": [{"source_type": "exam_question", "source_id": str(exam_question.id)}],
            },
            format="json",
        )

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data["success"] is False
        assert not QuestionBankMembership.objects.filter(
            bank=target_bank,
        ).exists()


# ---------------------------------------------------------------------------
# Additional tests: soft-delete, permissions, category validation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestQuestionBankSoftDelete:
    def test_destroy_bank_sets_is_archived(self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank):
        api_client.force_authenticate(user=teacher)
        resp = api_client.delete(f"/api/v1/question-banks/{teacher_private_bank.uuid}/")
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        teacher_private_bank.refresh_from_db()
        assert teacher_private_bank.is_archived is True

    def test_archived_bank_excluded_from_list(self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank):
        api_client.force_authenticate(user=teacher)
        api_client.delete(f"/api/v1/question-banks/{teacher_private_bank.uuid}/")
        list_resp = api_client.get("/api/v1/question-banks/")
        assert list_resp.status_code == status.HTTP_200_OK
        ids = [b["id"] for b in list_resp.data]
        assert str(teacher_private_bank.uuid) not in ids

    def test_archived_bank_returns_404_on_retrieve(self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank):
        api_client.force_authenticate(user=teacher)
        api_client.delete(f"/api/v1/question-banks/{teacher_private_bank.uuid}/")
        get_resp = api_client.get(f"/api/v1/question-banks/{teacher_private_bank.uuid}/")
        assert get_resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestQuestionCRUDPermissions:
    def test_delete_question_by_owner(self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank):
        api_client.force_authenticate(user=teacher)
        membership = create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="To Delete",
        )
        resp = api_client.delete(f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/{membership.id}/")
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not QuestionBankMembership.objects.filter(id=membership.id).exists()

    def test_delete_question_by_non_owner_is_forbidden(
        self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank
    ):
        other = User.objects.create_user(username="other_del", email="other_del@test.com", password="x", role="teacher")
        membership = create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Guarded",
        )
        api_client.force_authenticate(user=other)
        resp = api_client.delete(f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/{membership.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND  # filtered out via get_queryset

    def test_post_question_to_public_bank_by_non_owner_is_forbidden(
        self, api_client: APIClient, public_platform_bank: QuestionBank
    ):
        """Any authenticated user must NOT be able to add questions to a bank they don't own."""
        stranger = User.objects.create_user(username="stranger_q", email="str@test.com", password="x", role="teacher")
        api_client.force_authenticate(user=stranger)
        resp = api_client.post(
            f"/api/v1/question-banks/{public_platform_bank.uuid}/questions/",
            {"question_type": "coding", "title": "Injected"},
            format="json",
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_patch_question_by_owner(self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank):
        api_client.force_authenticate(user=teacher)
        membership = create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Original",
        )
        resp = api_client.patch(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/{membership.id}/",
            {"title": "Updated"},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["title"] == "Updated"
        assert resp.data["bank_item_id"]
        assert resp.data["id"] == resp.data["bank_item_id"]

    def test_patch_question_by_non_owner_is_forbidden(
        self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank
    ):
        other = User.objects.create_user(username="other_patch", email="other_p@test.com", password="x", role="teacher")
        membership = create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Original",
        )
        api_client.force_authenticate(user=other)
        resp = api_client.patch(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/{membership.id}/",
            {"title": "Hacked"},
            format="json",
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestCategoryValidation:
    def test_upsert_coding_problem_into_exam_bank_raises(self, teacher: User):
        from apps.problems.models import CodingProblem

        exam_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
        )
        problem = CodingProblem.objects.create(
            created_by=teacher,
            time_limit=1000,
            memory_limit=128,
        )
        import pytest as _pytest
        with _pytest.raises(ValueError, match="coding"):
            upsert_problem_into_bank(problem=problem, bank=exam_bank)

    def test_upsert_exam_question_into_coding_bank_raises(self, teacher: User):
        from apps.contests.models import Contest, ExamQuestion

        coding_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Coding Bank",
            category=QuestionBank.Category.CODING,
        )
        contest = Contest.objects.create(
            name="Contest",
            owner=teacher,
            contest_type="exam",
            start_time="2030-01-01T00:00:00Z",
            end_time="2030-01-02T00:00:00Z",
        )
        exam_q = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Q?",
            options=["A", "B"],
            correct_answer=0,
            score=2,
            order=0,
        )
        import pytest as _pytest
        with _pytest.raises(ValueError, match="exam"):
            upsert_exam_question_into_bank(exam_question=exam_q, bank=coding_bank)


@pytest.mark.django_db
class TestMultipleBanksPerCategory:
    def test_teacher_can_create_multiple_active_banks_same_category(self, teacher: User):
        first = QuestionBank.objects.create(owner=teacher, name="Bank A", category=QuestionBank.Category.CODING)
        second = QuestionBank.objects.create(owner=teacher, name="Bank B", category=QuestionBank.Category.CODING)
        assert first.pk is not None
        assert second.pk is not None

    def test_platform_and_user_banks_can_coexist_same_category(self, admin_user: User):
        teacher_bank = QuestionBank.objects.create(
            owner=admin_user,
            name="Official 1",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
            verified=True,
            review_status=QuestionBank.ReviewStatus.APPROVED,
        )
        platform_bank = QuestionBank.objects.create(
            owner=None,
            name="Platform Bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
        )
        assert teacher_bank.pk is not None
        assert platform_bank.pk is not None


@pytest.mark.django_db
class TestStudentAccess:
    def test_student_cannot_create_bank(self, api_client: APIClient):
        student = User.objects.create_user(username="student_s", email="student_s@test.com", password="x", role="student")
        api_client.force_authenticate(user=student)
        resp = api_client.post(
            "/api/v1/question-banks/",
            {"name": "Student Bank", "category": "coding"},
            format="json",
        )
        # Students should receive 403 from IsTeacherOrAdmin permission
        assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED)

    def test_student_can_read_public_bank_questions(
        self, api_client: APIClient, public_platform_bank: QuestionBank
    ):
        student = User.objects.create_user(username="student_r", email="student_r@test.com", password="x", role="student")
        create_bank_membership(
            bank=public_platform_bank,
            owner=public_platform_bank.owner,
            title="Public Q",
        )
        api_client.force_authenticate(user=student)
        resp = api_client.get(f"/api/v1/question-banks/{public_platform_bank.uuid}/questions/")
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data) == 1


# ---------------------------------------------------------------------------
# Review-driven tests: metadata, category POST, clone guards, upsert idempotency
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestMetadataReadOnly:
    """Source-tracking payload fields must not be modifiable via PATCH."""

    def test_patch_cannot_overwrite_source_payload_fields(self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank):
        api_client.force_authenticate(user=teacher)
        membership = create_bank_membership(
            bank=teacher_private_bank,
            owner=teacher,
            title="Meta Q",
            payload_extra={"source_type": "problem", "source_id": "original-id"},
        )
        resp = api_client.patch(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/{membership.id}/",
            {"metadata": {"source_id": "tampered"}},
            format="json",
        )
        assert resp.status_code == status.HTTP_200_OK
        membership.question_asset.refresh_from_db()
        payload = membership.question_asset.latest_version.payload
        assert payload["source_type"] == "problem"
        assert payload["source_id"] == "original-id"


@pytest.mark.django_db
class TestCategoryValidationOnPost:
    """B2: Direct POST to /banks/{uuid}/questions/ must enforce category."""

    def test_post_exam_question_to_coding_bank_returns_400(
        self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank
    ):
        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/",
            {"question_type": "exam", "title": "Wrong type", "prompt": "Q?", "score": 5},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert resp.data["success"] is False

    def test_post_coding_question_to_exam_bank_returns_400(
        self, api_client: APIClient, teacher: User
    ):
        exam_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
        )
        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{exam_bank.uuid}/questions/",
            {"question_type": "coding", "title": "Wrong type"},
            format="json",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_post_correct_category_succeeds(
        self, api_client: APIClient, teacher: User, teacher_private_bank: QuestionBank
    ):
        api_client.force_authenticate(user=teacher)
        resp = api_client.post(
            f"/api/v1/question-banks/{teacher_private_bank.uuid}/questions/",
            {"question_type": "coding", "title": "Correct type"},
            format="json",
        )
        assert resp.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
class TestCloneGuards:
    """clone_membership_to_bank must reject archived banks and category mismatches."""

    def test_clone_to_archived_bank_raises(self, teacher: User, public_platform_bank: QuestionBank):
        source_membership = create_bank_membership(
            bank=public_platform_bank,
            owner=public_platform_bank.owner,
            title="Source Q",
        )
        archived_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Archived",
            category=QuestionBank.Category.CODING,
            is_archived=True,
        )
        with pytest.raises(ValueError, match="archived"):
            clone_membership_to_bank(source_membership=source_membership, target_bank=archived_bank, user=teacher)

    def test_clone_category_mismatch_raises(self, teacher: User, public_platform_bank: QuestionBank):
        coding_membership = create_bank_membership(
            bank=public_platform_bank,
            owner=public_platform_bank.owner,
            title="Coding Q",
        )
        exam_bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
        )
        with pytest.raises(ValueError, match="coding"):
            clone_membership_to_bank(source_membership=coding_membership, target_bank=exam_bank, user=teacher)


@pytest.mark.django_db
class TestUpsertIdempotency:
    """Verify second upsert updates existing rather than creating a duplicate."""

    def test_upsert_problem_twice_updates_existing(self, teacher: User):
        bank = QuestionBank.objects.create(
            owner=teacher,
            name="Coding Bank",
            category=QuestionBank.Category.CODING,
        )
        asset = QuestionAsset.objects.create(
            owner=teacher, asset_type=QuestionAsset.AssetType.CODING,
            title="Prob", payload={"difficulty": "easy"},
        )
        problem = CodingProblem.objects.create(
            created_by=teacher,
            time_limit=1000,
            memory_limit=128,
            question_asset=asset,
        )
        q1 = upsert_problem_into_bank(problem=problem, bank=bank)
        assert bank.asset_memberships.count() == 1

        asset.title = "Updated Prob"
        asset.save()
        q2 = upsert_problem_into_bank(problem=problem, bank=bank)

        assert q1.id == q2.id  # same row updated
        assert bank.asset_memberships.count() == 1
        q2.refresh_from_db()
        assert q2.question_asset.title == "Updated Prob"

    def test_upsert_exam_question_twice_updates_existing(self, teacher: User):
        bank = QuestionBank.objects.create(
            owner=teacher,
            name="Exam Bank",
            category=QuestionBank.Category.EXAM,
        )
        contest = Contest.objects.create(name="C", owner=teacher, contest_type="paper_exam")
        eq = ExamQuestion.objects.create(
            contest=contest,
            question_type="single_choice",
            prompt="Original?",
            options=["A", "B"],
            correct_answer=0,
            score=5,
            order=0,
        )
        q1 = upsert_exam_question_into_bank(exam_question=eq, bank=bank)
        assert bank.asset_memberships.count() == 1

        eq.prompt = "Updated?"
        eq.save()
        q2 = upsert_exam_question_into_bank(exam_question=eq, bank=bank)

        assert q1.id == q2.id
        assert bank.asset_memberships.count() == 1
        q2.refresh_from_db()
        assert q2.question_asset.latest_version.prompt == "Updated?"


@pytest.mark.django_db
class TestIsPubliclyAccessibleBank:
    """Approved+verified banks are publicly accessible regardless of owner."""

    def test_teacher_approved_bank_is_public(self, teacher: User):
        bank = QuestionBank.objects.create(
            owner=teacher,
            name="Teacher Approved",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
            verified=True,
            review_status=QuestionBank.ReviewStatus.APPROVED,
        )
        assert is_publicly_accessible_bank(bank) is True

    def test_private_bank_is_not_public(self, teacher: User):
        bank = QuestionBank.objects.create(
            owner=teacher,
            name="Private Bank",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PRIVATE,
            verified=False,
        )
        assert is_publicly_accessible_bank(bank) is False

    def test_archived_approved_bank_is_not_public(self, teacher: User):
        bank = QuestionBank.objects.create(
            owner=teacher,
            name="Archived",
            category=QuestionBank.Category.CODING,
            visibility=QuestionBank.Visibility.PUBLIC,
            verified=True,
            review_status=QuestionBank.ReviewStatus.APPROVED,
            is_archived=True,
        )
        assert is_publicly_accessible_bank(bank) is False
