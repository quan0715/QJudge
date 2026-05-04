import pytest
from rest_framework.exceptions import ValidationError

from apps.question_bank.models import Question, QuestionBank, QuestionBankMembership
from apps.question_bank.question_assets import ensure_question_asset_for_bank_question
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
def test_resolve_bank_question_for_import_materializes_membership_and_enforces_type(
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
    question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.EXAM,
        title="Short answer",
        prompt="Explain the result.",
        created_by=teacher,
    )
    ensure_question_asset_for_bank_question(question=question, actor=teacher)
    membership = QuestionBankMembership.objects.get(legacy_question=question)

    with pytest.raises(ValidationError, match="Only coding bank questions can be imported here"):
        resolve_bank_question_for_import(
            user=teacher,
            question_bank_id=bank.uuid,
            question_id=membership.id,
            allowed_question_types={Question.QuestionType.CODING},
            invalid_type_message="Only coding bank questions can be imported here",
        )

    resolved_bank, resolved_question = resolve_bank_question_for_import(
        user=teacher,
        question_bank_id=bank.uuid,
        question_id=membership.id,
        allowed_question_types={Question.QuestionType.EXAM},
    )

    assert resolved_bank == bank
    assert resolved_question == question
