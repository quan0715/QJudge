from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.contests.models import Contest, ExamQuestion
from apps.problems.models import Problem
from apps.question_bank.models import (
    ContestQuestionBinding,
    Question,
    QuestionAsset,
    QuestionBank,
    QuestionBankMembership,
)
from apps.question_bank.question_assets import create_question_asset, ensure_question_bank_membership
from apps.users.models import User


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="teacher_asset_int",
        email="teacher_asset_int@example.com",
        password="pass123",
        role="teacher",
    )


@pytest.fixture
def contest(teacher: User) -> Contest:
    now = timezone.now()
    return Contest.objects.create(
        name="Asset Integration Contest",
        owner=teacher,
        contest_type="paper_exam",
        status="published",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
    )


@pytest.mark.django_db
def test_problem_api_create_and_update_dual_write_question_asset(api_client: APIClient, teacher: User):
    api_client.force_authenticate(user=teacher)
    create_resp = api_client.post(
        "/api/v1/problems/",
        {
            "title": "Canonical Coding Problem",
            "slug": "canonical-coding-problem",
            "difficulty": "easy",
            "time_limit": 1000,
            "memory_limit": 128,
            "translations": [
                {
                    "language": "zh-TW",
                    "title": "Canonical Coding Problem",
                    "description": "desc v1",
                    "input_description": "in",
                    "output_description": "out",
                    "hint": "",
                }
            ],
            "test_cases": [
                {
                    "input_data": "1",
                    "output_data": "1",
                    "is_sample": True,
                    "score": 100,
                    "weight_percent": 100,
                    "order": 0,
                    "is_hidden": False,
                }
            ],
            "language_configs": [],
        },
        format="json",
    )
    assert create_resp.status_code == status.HTTP_201_CREATED
    assert create_resp.data["question_asset_id"] is not None
    assert create_resp.data["question_version_id"] is not None

    problem = Problem.objects.get(id=create_resp.data["id"])
    assert problem.question_asset_id is not None
    assert problem.question_version_id is not None
    assert problem.question_asset.asset_type == QuestionAsset.AssetType.CODING
    assert problem.question_asset.latest_version_id == problem.question_version_id
    assert problem.question_asset.versions.count() == 1

    update_resp = api_client.patch(
        f"/api/v1/problems/{problem.id}/",
        {"title": "Canonical Coding Problem v2"},
        format="json",
    )
    assert update_resp.status_code == status.HTTP_200_OK

    problem.refresh_from_db()
    assert problem.question_asset.versions.count() == 2
    assert problem.question_asset.latest_version_id == problem.question_version_id
    assert problem.question_asset.title == "Canonical Coding Problem v2"


@pytest.mark.django_db
def test_exam_question_api_dual_writes_asset_and_binding(
    api_client: APIClient,
    teacher: User,
    contest: Contest,
):
    api_client.force_authenticate(user=teacher)
    resp = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "single_choice",
            "prompt": "What is 1+1?",
            "options": ["1", "2", "3"],
            "correct_answer": 1,
            "score": 3,
            "order": 0,
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["question_asset_id"] is not None
    assert resp.data["question_version_id"] is not None
    assert resp.data["binding_id"] is not None

    exam_question = ExamQuestion.objects.get(id=resp.data["id"])
    assert exam_question.question_asset_id is not None
    assert exam_question.question_version_id is not None
    binding = ContestQuestionBinding.objects.get(legacy_exam_question=exam_question)
    assert binding.contest_id == contest.id
    assert binding.question_asset_id == exam_question.question_asset_id
    assert binding.question_version_id == exam_question.question_version_id
    assert binding.binding_type == QuestionAsset.AssetType.SINGLE_CHOICE


@pytest.mark.django_db
def test_contest_create_problem_title_mode_creates_asset_and_binding(
    api_client: APIClient,
    teacher: User,
):
    contest = Contest.objects.create(
        name="Coding Asset Contest",
        owner=teacher,
        contest_type="coding",
        status="draft",
    )
    api_client.force_authenticate(user=teacher)

    resp = api_client.post(
        f"/api/v1/contests/{contest.id}/problems/",
        {"title": "Contest-created coding problem"},
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["question_asset_id"] is not None
    assert resp.data["question_version_id"] is not None

    binding = ContestQuestionBinding.objects.get(contest=contest)
    assert binding.question_asset_id is not None
    assert binding.coding_problem is not None
    assert binding.coding_problem.question_asset_id == binding.question_asset_id


@pytest.mark.django_db
def test_question_bank_question_create_builds_asset_and_membership(
    api_client: APIClient,
    teacher: User,
):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Asset Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    api_client.force_authenticate(user=teacher)
    resp = api_client.post(
        f"/api/v1/question-banks/{bank.uuid}/questions/",
        {
            "question_type": "coding",
            "title": "Bank Coding Asset",
            "prompt": "prompt",
            "score": 100,
            "order": 0,
            "coding_ext": {
                "translations": [],
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": [],
                "required_keywords": [],
            },
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED

    membership = QuestionBankMembership.objects.get(id=resp.data["id"])
    question = membership.legacy_question
    assert question.question_asset_id is not None
    assert question.question_version_id is not None
    assert question.question_asset.latest_version_id == question.question_version_id
    assert question.question_asset.versions.count() == 1
    assert question.question_asset.asset_type == QuestionAsset.AssetType.CODING
    assert question.question_asset.latest_version.payload["translations"] == []
    assert question.question_asset.latest_version.payload["test_cases"] == []
    assert membership.bank_id == bank.id
    assert membership.question_asset_id == question.question_asset_id


@pytest.mark.django_db
def test_question_bank_question_patch_publishes_new_version_via_write_workflow(
    api_client: APIClient,
    teacher: User,
):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Patch Asset Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.CODING,
        title="Patch Me",
        prompt="prompt v1",
        score=100,
        created_by=teacher,
    )
    from apps.question_bank.question_assets import ensure_question_asset_for_bank_question

    ensure_question_asset_for_bank_question(question=question, actor=teacher)
    original_version_id = question.question_version_id
    original_version_count = question.question_asset.versions.count()

    api_client.force_authenticate(user=teacher)
    resp = api_client.patch(
        f"/api/v1/question-bank-items/{question.id}/",
        {
            "title": "Patch Me v2",
            "coding_ext": {
                "translations": [],
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": ["scanf"],
                "required_keywords": [],
            },
        },
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    question.refresh_from_db()
    assert question.question_version_id != original_version_id
    assert question.question_asset.versions.count() == original_version_count + 1
    assert question.question_asset.latest_version_id == question.question_version_id
    assert question.question_version.payload["forbidden_keywords"] == ["scanf"]
    assert question.question_version.title == "Patch Me v2"
    assert QuestionBankMembership.objects.get(legacy_question=question).question_asset_id == question.question_asset_id


@pytest.mark.django_db
def test_exam_question_ingest_reuses_existing_question_asset(
    api_client: APIClient,
    teacher: User,
    contest: Contest,
):
    target_bank = QuestionBank.objects.create(
        owner=teacher,
        name="Exam Asset Bank",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    api_client.force_authenticate(user=teacher)

    create_resp = api_client.post(
        f"/api/v1/contests/{contest.id}/exam-questions/",
        {
            "question_type": "single_choice",
            "prompt": "Bank me",
            "options": ["A", "B"],
            "correct_answer": 0,
            "score": 2,
            "order": 0,
        },
        format="json",
    )
    assert create_resp.status_code == status.HTTP_201_CREATED
    exam_question = ExamQuestion.objects.get(id=create_resp.data["id"])

    ingest_resp = api_client.post(
        "/api/v1/question-banks/inbox/ingest/",
        {
            "target_bank_id": str(target_bank.uuid),
            "items": [{"source_type": "exam_question", "source_id": str(exam_question.id)}],
        },
        format="json",
    )
    assert ingest_resp.status_code == status.HTTP_200_OK

    bank_question = Question.objects.get(
        bank=target_bank,
        metadata__legacy_exam_question_id=str(exam_question.id),
    )
    assert bank_question.question_asset_id == exam_question.question_asset_id
    assert QuestionBankMembership.objects.filter(
        bank=target_bank,
        question_asset_id=exam_question.question_asset_id,
    ).exists()


@pytest.mark.django_db
def test_reading_set_asset_fits_bank_and_contest_binding_shape(teacher: User):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Reading Set Bank",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    contest = Contest.objects.create(
        name="Reading Set Contest",
        owner=teacher,
        contest_type="paper_exam",
        status="draft",
    )
    asset, version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.READING_SET,
        title="Passage 1",
        prompt="A long passage",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "passage": "A long passage",
            "child_items": [
                {"kind": "single_choice", "prompt": "Q1", "options": ["A", "B"], "correct_answer": 0}
            ],
        },
        actor=teacher,
    )

    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=0,
        actor=teacher,
    )
    binding = ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=asset,
        question_version=version,
        binding_type=QuestionAsset.AssetType.READING_SET,
        order=0,
        score=5,
        created_by=teacher,
    )

    assert membership.question_asset_id == asset.id
    assert binding.question_asset_id == asset.id
    assert binding.question_version_id == version.id


@pytest.mark.django_db
def test_question_viewset_can_retrieve_canonical_only_membership(
    api_client: APIClient,
    teacher: User,
):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Canonical Only Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    asset, _version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.CODING,
        title="Canonical Only Item",
        prompt="prompt",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "score": 100,
            "order": 0,
            "difficulty": "easy",
            "time_limit": 1000,
            "memory_limit": 128,
            "options": [],
            "correct_answer": None,
            "metadata": {},
            "translations": [],
            "test_cases": [],
            "language_configs": [],
            "forbidden_keywords": [],
            "required_keywords": [],
        },
        actor=teacher,
    )
    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=0,
        actor=teacher,
    )

    api_client.force_authenticate(user=teacher)
    resp = api_client.get(f"/api/v1/question-bank-items/{membership.id}/")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["id"] == str(membership.id)
    assert resp.data["bank_item_id"] == str(membership.id)
    assert resp.data["adapter_question_id"] is None
    assert resp.data["question_asset_id"] == str(asset.id)
    assert resp.data["title"] == "Canonical Only Item"


@pytest.mark.django_db
def test_question_bank_item_route_can_retrieve_canonical_membership(
    api_client: APIClient,
    teacher: User,
):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Canonical Alias Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    asset, _version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.CODING,
        title="Alias Item",
        prompt="prompt",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "score": 100,
            "order": 0,
            "difficulty": "easy",
            "time_limit": 1000,
            "memory_limit": 128,
            "options": [],
            "correct_answer": None,
            "metadata": {},
            "translations": [],
            "test_cases": [],
            "language_configs": [],
            "forbidden_keywords": [],
            "required_keywords": [],
        },
        actor=teacher,
    )
    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=0,
        actor=teacher,
    )

    api_client.force_authenticate(user=teacher)
    resp = api_client.get(f"/api/v1/question-bank-items/{membership.id}/")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["id"] == str(membership.id)
    assert resp.data["bank_item_id"] == str(membership.id)
    assert resp.data["adapter_question_id"] is None


@pytest.mark.django_db
def test_question_viewset_can_patch_canonical_only_membership(
    api_client: APIClient,
    teacher: User,
):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Canonical Patch Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    asset, _version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.CODING,
        title="Before Patch",
        prompt="prompt",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "score": 100,
            "order": 0,
            "difficulty": "easy",
            "time_limit": 1000,
            "memory_limit": 128,
            "options": [],
            "correct_answer": None,
            "metadata": {},
            "translations": [],
            "test_cases": [],
            "language_configs": [],
            "forbidden_keywords": [],
            "required_keywords": [],
        },
        actor=teacher,
    )
    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=0,
        actor=teacher,
    )

    api_client.force_authenticate(user=teacher)
    resp = api_client.patch(
        f"/api/v1/question-bank-items/{membership.id}/",
        {
            "title": "After Patch",
            "coding_ext": {
                "translations": [],
                "test_cases": [],
                "language_configs": [],
                "forbidden_keywords": ["scanf"],
                "required_keywords": [],
            },
        },
        format="json",
    )

    assert resp.status_code == status.HTTP_200_OK
    membership.refresh_from_db()
    assert membership.legacy_question_id is not None
    membership.legacy_question.refresh_from_db()
    assert membership.legacy_question.title == "After Patch"
    assert membership.question_asset.latest_version.title == "After Patch"
    assert membership.question_asset.latest_version.payload["forbidden_keywords"] == ["scanf"]


@pytest.mark.django_db
def test_question_viewset_can_delete_canonical_only_membership(
    api_client: APIClient,
    teacher: User,
):
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Canonical Delete Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    asset, _version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.CODING,
        title="Delete Me",
        prompt="prompt",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "score": 100,
            "order": 0,
            "difficulty": "easy",
            "time_limit": 1000,
            "memory_limit": 128,
            "options": [],
            "correct_answer": None,
            "metadata": {},
            "translations": [],
            "test_cases": [],
            "language_configs": [],
            "forbidden_keywords": [],
            "required_keywords": [],
        },
        actor=teacher,
    )
    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=0,
        actor=teacher,
    )

    api_client.force_authenticate(user=teacher)
    resp = api_client.delete(f"/api/v1/question-bank-items/{membership.id}/")

    assert resp.status_code == status.HTTP_204_NO_CONTENT
    assert not QuestionBankMembership.objects.filter(id=membership.id).exists()
