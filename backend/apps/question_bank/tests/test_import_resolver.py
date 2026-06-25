import pytest
from rest_framework.exceptions import ValidationError

from apps.question_bank.models import QuestionAsset, QuestionBank
from apps.question_bank.question_assets import create_question_asset, ensure_question_bank_membership
from apps.users.models import User


@pytest.fixture
def teacher() -> User:
    return User.objects.create_user(
        username="teacher-import-resolver",
        email="teacher-import-resolver@example.com",
        password="pass",
        role="teacher",
    )


@pytest.mark.django_db
def test_resolve_bank_question_for_import_resolves_membership_and_enforces_type(
    teacher: User,
):
    from apps.question_bank import import_resolver

    assert hasattr(import_resolver, "resolve_bank_question_for_import")
    resolve_bank_question_for_import = import_resolver.resolve_bank_question_for_import

    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Exam Bank",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    asset, _version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.SINGLE_CHOICE,
        title="Short answer",
        prompt="Explain the result.",
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "question_type": "single_choice",
            "options": ["A", "B"],
            "correct_answer": 0,
            "score": 1,
            "order": 0,
        },
        actor=teacher,
    )
    membership = ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=0,
        actor=teacher,
    )

    with pytest.raises(ValidationError, match="Only coding bank questions can be imported here"):
        resolve_bank_question_for_import(
            user=teacher,
            question_bank_id=bank.uuid,
            question_id=membership.id,
            allowed_question_types={"coding"},
            invalid_type_message="Only coding bank questions can be imported here",
        )

    resolved_bank, resolved_item = resolve_bank_question_for_import(
        user=teacher,
        question_bank_id=bank.uuid,
        question_id=membership.id,
        allowed_question_types={"exam"},
    )

    assert resolved_bank == bank
    assert resolved_item.membership == membership
    assert resolved_item.question_asset == asset
    assert resolved_item.question_type == "exam"
