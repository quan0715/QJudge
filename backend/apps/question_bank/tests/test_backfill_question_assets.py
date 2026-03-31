from __future__ import annotations

from io import StringIO

from django.core.management import call_command

import pytest

from apps.contests.models import Contest, ContestProblem, ExamQuestion
from apps.problems.models import Problem
from apps.question_bank.models import (
    ContestQuestionBinding,
    Question,
    QuestionBank,
    QuestionBankMembership,
)
from apps.users.models import User


@pytest.mark.django_db
def test_backfill_question_assets_populates_assets_memberships_and_bindings():
    teacher = User.objects.create_user(
        username="teacher_backfill_assets",
        email="teacher_backfill_assets@example.com",
        password="pass123",
        role="teacher",
    )
    contest = Contest.objects.create(
        name="Backfill Assets Contest",
        owner=teacher,
        contest_type="paper_exam",
        status="draft",
    )
    coding_contest = Contest.objects.create(
        name="Backfill Coding Contest",
        owner=teacher,
        contest_type="coding",
        status="draft",
    )
    problem = Problem.objects.create(
        title="Legacy Problem",
        slug="legacy-problem-backfill",
        created_by=teacher,
        difficulty="easy",
    )
    contest_problem = ContestProblem.objects.create(
        contest=coding_contest,
        problem=problem,
        order=0,
        max_score=100,
    )
    exam_question = ExamQuestion.objects.create(
        contest=contest,
        question_type="single_choice",
        prompt="Legacy exam question",
        options=["A", "B"],
        correct_answer=0,
        score=2,
        order=0,
    )
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Backfill Asset Bank",
        category=QuestionBank.Category.EXAM,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    bank_question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.EXAM,
        title="Legacy Bank Question",
        prompt="Legacy exam question",
        options=["A", "B"],
        correct_answer=0,
        score=2,
        order=0,
        created_by=teacher,
    )

    call_command("backfill_question_assets")

    problem.refresh_from_db()
    contest_problem.refresh_from_db()
    exam_question.refresh_from_db()
    bank_question.refresh_from_db()

    assert problem.question_asset_id is not None
    assert problem.question_version_id is not None
    assert contest_problem.question_asset_id == problem.question_asset_id
    assert ContestQuestionBinding.objects.filter(legacy_contest_problem=contest_problem).exists()

    assert exam_question.question_asset_id is not None
    assert exam_question.question_version_id is not None
    assert ContestQuestionBinding.objects.filter(legacy_exam_question=exam_question).exists()

    assert bank_question.question_asset_id is not None
    assert bank_question.question_version_id is not None
    assert QuestionBankMembership.objects.filter(legacy_question=bank_question).exists()


@pytest.mark.django_db
def test_backfill_question_assets_dry_run_does_not_mutate():
    teacher = User.objects.create_user(
        username="teacher_backfill_assets_dry",
        email="teacher_backfill_assets_dry@example.com",
        password="pass123",
        role="teacher",
    )
    problem = Problem.objects.create(
        title="Dry Run Problem",
        slug="dry-run-problem",
        created_by=teacher,
        difficulty="easy",
    )
    stdout = StringIO()

    call_command("backfill_question_assets", dry_run=True, stdout=stdout)

    problem.refresh_from_db()
    assert problem.question_asset_id is None
    assert "problems_synced=1" in stdout.getvalue()


@pytest.mark.django_db
def test_backfill_question_assets_resolves_problem_owner_from_contest_owner():
    teacher = User.objects.create_user(
        username="teacher_backfill_owner",
        email="teacher_backfill_owner@example.com",
        password="pass123",
        role="teacher",
    )
    contest = Contest.objects.create(
        name="Owner Fallback Contest",
        owner=teacher,
        contest_type="coding",
        status="draft",
    )
    problem = Problem.objects.create(
        title="Legacy Null Owner Problem",
        slug="legacy-null-owner-problem",
        created_by=None,
        difficulty="easy",
    )
    contest_problem = ContestProblem.objects.create(
        contest=contest,
        problem=problem,
        order=0,
        max_score=100,
    )

    call_command("backfill_question_assets")

    problem.refresh_from_db()
    contest_problem.refresh_from_db()
    assert problem.question_asset_id is not None
    assert problem.question_asset.owner_id == teacher.id
    assert contest_problem.question_asset_id == problem.question_asset_id


@pytest.mark.django_db
def test_backfill_question_assets_skips_unresolvable_problem_but_continues():
    teacher = User.objects.create_user(
        username="teacher_backfill_continue",
        email="teacher_backfill_continue@example.com",
        password="pass123",
        role="teacher",
    )
    unresolved_problem = Problem.objects.create(
        title="Unowned Legacy Problem",
        slug="unowned-legacy-problem",
        created_by=None,
        difficulty="easy",
    )
    bank = QuestionBank.objects.create(
        owner=teacher,
        name="Continue Backfill Bank",
        category=QuestionBank.Category.CODING,
        visibility=QuestionBank.Visibility.PRIVATE,
    )
    bank_question = Question.objects.create(
        bank=bank,
        question_type=Question.QuestionType.CODING,
        title="Legacy Bank Question",
        prompt="prompt",
        score=100,
        order=0,
        created_by=teacher,
    )
    stdout = StringIO()

    call_command("backfill_question_assets", stdout=stdout)

    unresolved_problem.refresh_from_db()
    bank_question.refresh_from_db()
    assert unresolved_problem.question_asset_id is None
    assert bank_question.question_asset_id is not None
    assert QuestionBankMembership.objects.filter(legacy_question=bank_question).exists()
    output = stdout.getvalue()
    assert "problems_skipped_missing_owner=1" in output
