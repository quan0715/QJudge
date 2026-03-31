from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand

from apps.contests.models import ExamQuestion
from apps.question_bank.models import Question
from apps.question_bank.bank_workflows import sync_exam_question_bank_source


class Command(BaseCommand):
    help = "Backfill ExamQuestion.source_bank_* fields from question bank legacy metadata."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview backfill results without writing DB",
        )
        parser.add_argument(
            "--contest-id",
            type=str,
            default="",
            help="Optional contest UUID to backfill only one contest",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options.get("dry_run"))
        contest_id: str = (options.get("contest_id") or "").strip()

        legacy_rows = (
            Question.objects.filter(metadata__legacy_exam_question_id__isnull=False)
            .select_related("bank")
            .order_by("-updated_at", "-id")
        )

        latest_by_exam_question_id: dict[str, Question] = {}
        duplicate_counts: defaultdict[str, int] = defaultdict(int)
        for row in legacy_rows:
            legacy_id = str((row.metadata or {}).get("legacy_exam_question_id") or "").strip()
            if not legacy_id:
                continue
            duplicate_counts[legacy_id] += 1
            latest_by_exam_question_id.setdefault(legacy_id, row)

        exam_questions = ExamQuestion.objects.all().order_by("contest_id", "order", "id")
        if contest_id:
            exam_questions = exam_questions.filter(contest_id=contest_id)

        stats = {
            "total": 0,
            "matched": 0,
            "updated": 0,
            "already_synced": 0,
            "missing_bank_link": 0,
            "duplicate_legacy_rows": 0,
            "skipped_due_to_duplicate_legacy_rows": 0,
        }

        for exam_question in exam_questions:
            stats["total"] += 1
            bank_question = latest_by_exam_question_id.get(str(exam_question.id))
            if bank_question is None:
                stats["missing_bank_link"] += 1
                continue

            stats["matched"] += 1
            if duplicate_counts[str(exam_question.id)] > 1:
                stats["duplicate_legacy_rows"] += 1
                stats["skipped_due_to_duplicate_legacy_rows"] += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping exam_question={exam_question.id} contest={exam_question.contest_id} "
                        "because multiple bank questions share the same legacy_exam_question_id"
                    )
                )
                continue

            synced = (
                str(exam_question.source_bank_id or "") == str(bank_question.bank.uuid)
                and str(exam_question.source_question_id or "") == str(bank_question.id)
                and (exam_question.source_bank_name or "") == (bank_question.bank.name or "")
                and exam_question.source_mode == "copy"
            )
            if synced:
                stats["already_synced"] += 1
                continue

            if dry_run:
                self.stdout.write(
                    self.style.WARNING(
                        f"[DRY-RUN] exam_question={exam_question.id} "
                        f"contest={exam_question.contest_id} "
                        f"bank={bank_question.bank.uuid} bank_question={bank_question.id}"
                    )
                )
                stats["updated"] += 1
                continue

            sync_exam_question_bank_source(
                exam_question=exam_question,
                bank_question=bank_question,
            )
            stats["updated"] += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"Backfilled exam_question={exam_question.id} "
                    f"contest={exam_question.contest_id} "
                    f"bank={bank_question.bank.uuid} bank_question={bank_question.id}"
                )
            )

        self.stdout.write("")
        self.stdout.write("=== Backfill Report ===")
        for key, value in stats.items():
            self.stdout.write(f"{key}={value}")
