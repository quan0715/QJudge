from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.contests.models import ExamQuestion
from apps.problems.models import Problem
from apps.question_bank.models import Question
from apps.question_bank.question_assets import (
    ensure_contest_binding_for_exam_question,
    ensure_question_asset_for_bank_question,
    sync_exam_question_question_asset,
    sync_problem_question_asset,
)


class Command(BaseCommand):
    help = "Backfill canonical question assets / versions / memberships / bindings for legacy rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview counts without writing",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))

        stats = {
            "problems_synced": 0,
            "problems_skipped_missing_owner": 0,
            "exam_questions_synced": 0,
            "bank_questions_synced": 0,
            "exam_question_bindings_synced": 0,
        }

        with transaction.atomic():
            for problem in Problem.objects.order_by("created_at", "id"):
                try:
                    if not dry_run:
                        sync_problem_question_asset(problem=problem, actor=problem.created_by)
                    stats["problems_synced"] += 1
                except ValueError as exc:
                    stats["problems_skipped_missing_owner"] += 1
                    self.stdout.write(self.style.WARNING(str(exc)))

            for exam_question in ExamQuestion.objects.select_related("contest").order_by("created_at", "id"):
                if not dry_run:
                    sync_exam_question_question_asset(
                        exam_question=exam_question,
                        actor=exam_question.contest.owner,
                    )
                stats["exam_questions_synced"] += 1

            for question in Question.objects.select_related("bank", "created_by", "question_asset").order_by("created_at", "id"):
                if not dry_run:
                    ensure_question_asset_for_bank_question(
                        question=question,
                        actor=question.created_by or question.bank.owner,
                    )
                stats["bank_questions_synced"] += 1

            for exam_question in ExamQuestion.objects.select_related("contest").order_by("created_at", "id"):
                if not dry_run:
                    ensure_contest_binding_for_exam_question(
                        exam_question=exam_question,
                        actor=exam_question.contest.owner,
                    )
                stats["exam_question_bindings_synced"] += 1

            if dry_run:
                transaction.set_rollback(True)

        for key, value in stats.items():
            self.stdout.write(f"{key}={value}")
