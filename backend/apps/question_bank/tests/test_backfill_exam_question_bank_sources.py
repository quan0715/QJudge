from __future__ import annotations

from django.core.management import call_command

import pytest

from apps.contests.models import Contest, ExamQuestion
from apps.question_bank.models import QuestionAsset, QuestionBank
from apps.question_bank.question_assets import create_question_asset, ensure_question_bank_membership
from apps.users.models import User


def _create_exam_membership(*, bank: QuestionBank, teacher: User, exam_question: ExamQuestion, order: int = 0):
    asset, _version = create_question_asset(
        owner=teacher,
        asset_type=QuestionAsset.AssetType.SINGLE_CHOICE,
        title=exam_question.prompt,
        prompt=exam_question.prompt,
        visibility=QuestionAsset.Visibility.PRIVATE,
        payload={
            "question_type": exam_question.question_type,
            "options": exam_question.options,
            "correct_answer": exam_question.correct_answer,
            "score": exam_question.score,
            "order": order,
            "source_type": "exam_question",
            "source_id": str(exam_question.id),
            "source_contest_id": str(exam_question.contest_id),
        },
        actor=teacher,
    )
    return ensure_question_bank_membership(
        bank=bank,
        question_asset=asset,
        order=order,
        actor=teacher,
    )


@pytest.mark.django_db
def test_backfill_exam_question_bank_sources_updates_canonical_membership_linked_exam_questions():
    teacher = User.objects.create_user(
        username="teacher_backfill_qb",
        email="teacher_backfill_qb@example.com",
        password="pass123",
        role="teacher",
    )
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Exam Bank Backfill",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    contest = Contest.objects.create(
        name="Backfill Exam Contest",
        owner=teacher,
        contest_type="paper_exam",
    )
    exam_question = ExamQuestion.objects.create(
        contest=contest,
        question_type="single_choice",
        prompt="Backfill me",
        options=["A", "B"],
        correct_answer=0,
        score=2,
        order=0,
        source_mode="manual",
    )
    membership = _create_exam_membership(bank=bank, teacher=teacher, exam_question=exam_question)

    call_command(
        "backfill_exam_question_bank_sources",
        contest_id=str(contest.id),
    )

    exam_question.refresh_from_db()
    assert str(exam_question.source_bank_id) == str(bank.uuid)
    assert exam_question.source_bank_name == bank.name
    assert str(exam_question.source_question_id) == str(membership.id)
    assert exam_question.source_mode == "copy"


@pytest.mark.django_db
def test_backfill_exam_question_bank_sources_skips_when_duplicate_memberships_exist(capsys):
    teacher = User.objects.create_user(
        username="teacher_backfill_dup_qb",
        email="teacher_backfill_dup_qb@example.com",
        password="pass123",
        role="teacher",
    )
    first_bank = QuestionBank.objects.create(
        owner=teacher,
        name="Exam Bank First",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    first_bank.is_archived = True
    first_bank.save(update_fields=["is_archived"])
    second_bank = QuestionBank.objects.create(
        owner=teacher,
        name="Exam Bank Second",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    contest = Contest.objects.create(
        name="Backfill Exam Contest Duplicate",
        owner=teacher,
        contest_type="paper_exam",
    )
    exam_question = ExamQuestion.objects.create(
        contest=contest,
        question_type="single_choice",
        prompt="Backfill me carefully",
        options=["A", "B"],
        correct_answer=0,
        score=2,
        order=0,
        source_mode="manual",
    )
    _create_exam_membership(bank=first_bank, teacher=teacher, exam_question=exam_question)
    _create_exam_membership(bank=second_bank, teacher=teacher, exam_question=exam_question, order=1)

    call_command(
        "backfill_exam_question_bank_sources",
        contest_id=str(contest.id),
    )

    exam_question.refresh_from_db()
    captured = capsys.readouterr().out
    assert "Skipping exam_question=" in captured
    assert "duplicate_memberships=1" in captured
    assert "skipped_due_to_duplicate_memberships=1" in captured
    assert exam_question.source_bank_id is None
    assert exam_question.source_question_id is None
    assert exam_question.source_mode == "manual"
