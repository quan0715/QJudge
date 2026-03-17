"""
Seed migration command for Phase1C.

Migrate:
- practice problems (public)
- exam questions (reconstructible only)

Generate a migration report with skipped exam entries.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.contests.models import ExamQuestion
from apps.problems.models import Problem
from apps.question_bank.models import QuestionBank
from apps.question_bank.services import (
    upsert_exam_question_into_bank,
    upsert_problem_into_bank,
    validate_exam_question_reconstructibility,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Migrate seed data into official question banks and output report"

    def add_arguments(self, parser):
        parser.add_argument(
            "--report-path",
            type=str,
            required=False,
            help="Optional report output path",
        )

    def handle(self, *args, **options):
        platform_owner = (
            User.objects.filter(is_staff=True).order_by("id").first()
            or User.objects.filter(role="admin").order_by("id").first()
        )

        coding_bank, _ = QuestionBank.objects.get_or_create(
            owner=platform_owner,
            category=QuestionBank.Category.CODING,
            is_archived=False,
            defaults={
                "name": "平台官方程式題庫",
                "description": "平台官方提供的 public 題庫",
                "visibility": QuestionBank.Visibility.PUBLIC,
                "verified": True,
            },
        )
        exam_bank, _ = QuestionBank.objects.get_or_create(
            owner=platform_owner,
            category=QuestionBank.Category.EXAM,
            is_archived=False,
            defaults={
                "name": "平台官方考卷題庫",
                "description": "平台官方提供的 public 考卷題",
                "visibility": QuestionBank.Visibility.PUBLIC,
                "verified": True,
            },
        )

        migrated_practice = 0
        migrated_exam = 0
        skipped_exam: list[dict] = []

        practice_qs = Problem.objects.filter(visibility=Problem.ProblemVisibility.PUBLIC).order_by("id")
        for problem in practice_qs:
            upsert_problem_into_bank(problem=problem, bank=coding_bank, created_by=platform_owner)
            migrated_practice += 1

        exam_qs = ExamQuestion.objects.select_related("contest").order_by("contest_id", "order", "id")
        for exam_question in exam_qs:
            result = validate_exam_question_reconstructibility(exam_question)
            if not result.is_reconstructible:
                skipped_exam.append(
                    {
                        "question_id": exam_question.id,
                        "contest_id": exam_question.contest_id,
                        "reason": result.reason,
                    }
                )
                continue

            upsert_exam_question_into_bank(
                exam_question=exam_question,
                bank=exam_bank,
                created_by=platform_owner,
            )
            migrated_exam += 1

        report = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "migrated_practice_questions": migrated_practice,
            "migrated_exam_questions": migrated_exam,
            "skipped_exam_questions": skipped_exam,
        }

        report_path = options.get("report_path")
        if not report_path:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            report_path = f"backend/reports/question_bank_migration_report_{ts}.json"

        report_file = Path(report_path)
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

        self.stdout.write(
            self.style.SUCCESS(
                f"Migration done. practice={migrated_practice}, exam={migrated_exam}, skipped_exam={len(skipped_exam)}"
            )
        )
        self.stdout.write(self.style.SUCCESS(f"Report: {report_file}"))
