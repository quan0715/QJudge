from __future__ import annotations

import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.contests.models import Contest, ExamQuestion
from apps.question_bank.models import (
    ContestQuestionBinding,
    Question,
    QuestionAsset,
    QuestionBank,
    QuestionBankMembership,
    QuestionCodingExt,
    QuestionVersion,
)
from apps.users.models import User


def _teacher() -> User:
    return User.objects.create_user(
        username="legacy_audit_teacher",
        email="legacy_audit_teacher@example.com",
        password="pass123",
        role="teacher",
    )


def _canonical_asset(owner: User, *, title: str = "Canonical Question") -> tuple[QuestionAsset, QuestionVersion]:
    asset = QuestionAsset.objects.create(
        owner=owner,
        asset_type=QuestionAsset.AssetType.CODING,
        title=title,
        prompt="Prompt",
        payload={"score": 100, "difficulty": "medium"},
    )
    version = QuestionVersion.objects.create(
        question_asset=asset,
        version_number=1,
        title=title,
        prompt="Prompt",
        payload={"score": 100, "difficulty": "medium"},
        created_by=owner,
    )
    asset.latest_version = version
    asset.save(update_fields=["latest_version", "updated_at"])
    return asset, version


@pytest.mark.django_db
def test_audit_question_bank_legacy_passes_for_canonical_membership_only():
    teacher = _teacher()
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Canonical Bank",
        category=QuestionBank.Category.CODING,
    )
    asset, _version = _canonical_asset(teacher)
    QuestionBankMembership.objects.create(
        bank=bank,
        question_asset=asset,
        added_by=teacher,
    )

    stdout = StringIO()
    call_command("audit_question_bank_legacy", json=True, stdout=stdout)

    payload = json.loads(stdout.getvalue())
    assert payload["status"] == "PASS"
    assert payload["blockers"] == []


@pytest.mark.django_db
def test_audit_question_bank_legacy_fails_with_legacy_rows_and_links():
    teacher = _teacher()
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Legacy Bank",
        category=QuestionBank.Category.CODING,
    )
    asset, version = _canonical_asset(teacher, title="Legacy Linked Asset")
    legacy_question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.CODING,
        title="Legacy Question",
        prompt="Legacy prompt",
        question_asset=asset,
        question_version=version,
        created_by=teacher,
    )
    QuestionCodingExt.objects.create(
        question=legacy_question,
        test_cases=[{"input": "1", "output": "1"}],
    )
    QuestionBankMembership.objects.create(
        bank=bank,
        question_asset=asset,
        legacy_question=legacy_question,
        added_by=teacher,
    )

    contest = Contest.objects.create(
        name="Legacy Binding Contest",
        owner=teacher,
        contest_type="paper_exam",
        status="draft",
    )
    exam_question = ExamQuestion.objects.create(
        contest=contest,
        question_type="essay",
        prompt="Legacy exam prompt",
        score=5,
        order=0,
    )
    ContestQuestionBinding.objects.create(
        contest=contest,
        question_asset=asset,
        question_version=version,
        legacy_exam_question=exam_question,
        binding_type=QuestionAsset.AssetType.ESSAY,
        score=5,
        created_by=teacher,
    )

    stdout = StringIO()
    with pytest.raises(CommandError):
        call_command("audit_question_bank_legacy", json=True, stdout=stdout)

    payload = json.loads(stdout.getvalue())
    assert payload["status"] == "FAIL"
    assert payload["metrics"]["legacy_questions"]["count"] == 1
    assert payload["metrics"]["legacy_coding_ext"]["count"] == 1
    assert payload["metrics"]["memberships_with_legacy_question"]["count"] == 1
    assert payload["metrics"]["contest_bindings_with_legacy_exam_question"]["count"] == 1


@pytest.mark.django_db
def test_audit_question_bank_legacy_flags_membership_without_latest_version():
    teacher = _teacher()
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Broken Canonical Bank",
        category=QuestionBank.Category.CODING,
    )
    asset = QuestionAsset.objects.create(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.CODING,
        title="Missing Version",
        prompt="Prompt",
    )
    QuestionBankMembership.objects.create(
        bank=bank,
        question_asset=asset,
        added_by=teacher,
    )

    stdout = StringIO()
    with pytest.raises(CommandError):
        call_command("audit_question_bank_legacy", json=True, stdout=stdout)

    payload = json.loads(stdout.getvalue())
    assert payload["status"] == "FAIL"
    assert payload["metrics"]["memberships_without_latest_version"]["count"] == 1
