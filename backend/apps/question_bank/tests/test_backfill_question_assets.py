from __future__ import annotations

from io import StringIO

from django.core.management import call_command

import pytest

from apps.contests.models import Contest, ExamQuestion
from apps.contests.tests import bind_problem_to_contest
from apps.problems.models import CodingProblem
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset
from apps.users.models import User


@pytest.mark.django_db
def test_backfill_question_assets_populates_problem_exam_assets_and_bindings():
    teacher = User.objects.create_user(
        username="teacher_backfill_assets",
        email="teacher_backfill_assets@example.com",
        password="pass123",
        role="teacher",
    )
    coding_contest = Contest.objects.create(
        name="Backfill Coding Contest",
        owner=teacher,
        contest_type="coding",
        status="draft",
    )
    problem = CodingProblem.objects.create(
        slug="canonical-backfill-problem",
        created_by=teacher,
    )
    bind_problem_to_contest(coding_contest, problem, order=0)
    exam_contest = Contest.objects.create(
        name="Backfill Assets Contest",
        owner=teacher,
        contest_type="paper_exam",
        status="draft",
    )
    exam_question = ExamQuestion.objects.create(
        contest=exam_contest,
        question_type="single_choice",
        prompt="Canonical exam question",
        options=["A", "B"],
        correct_answer=0,
        score=2,
        order=0,
    )

    call_command("backfill_question_assets")

    problem.refresh_from_db()
    exam_question.refresh_from_db()

    assert problem.question_asset_id is not None
    assert problem.question_asset.asset_type == QuestionAsset.AssetType.CODING
    assert exam_question.question_asset_id is not None
    assert exam_question.question_version_id is not None
    assert ContestQuestionBinding.objects.filter(exam_question=exam_question).exists()


@pytest.mark.django_db
def test_backfill_question_assets_dry_run_does_not_mutate():
    teacher = User.objects.create_user(
        username="teacher_backfill_assets_dry",
        email="teacher_backfill_assets_dry@example.com",
        password="pass123",
        role="teacher",
    )
    problem = CodingProblem.objects.create(
        slug="dry-run-problem",
        created_by=teacher,
    )
    stdout = StringIO()

    call_command("backfill_question_assets", dry_run=True, stdout=stdout)

    problem.refresh_from_db()
    assert problem.question_asset_id is None
    assert "problems_synced=1" in stdout.getvalue()


@pytest.mark.django_db
def test_backfill_question_assets_resolves_problem_owner_from_contest_binding():
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
    problem = CodingProblem.objects.create(
        slug="contest-linked-problem",
        created_by=teacher,
    )
    bind_problem_to_contest(contest, problem, order=0)

    call_command("backfill_question_assets")

    problem.refresh_from_db()
    assert problem.question_asset_id is not None
    assert problem.question_asset.owner_id == teacher.id


@pytest.mark.django_db
def test_backfill_question_assets_skips_unresolvable_problem_but_continues():
    unresolved_problem = CodingProblem.objects.create(
        slug="unowned-canonical-problem",
        created_by=None,
    )
    stdout = StringIO()

    call_command("backfill_question_assets", stdout=stdout)

    unresolved_problem.refresh_from_db()
    assert unresolved_problem.question_asset_id is None
    output = stdout.getvalue()
    assert "problems_skipped_missing_owner=1" in output
