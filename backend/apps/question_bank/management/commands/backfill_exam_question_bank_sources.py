from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.contests.models import ExamQuestion
from apps.question_bank.bank_workflows import sync_exam_question_bank_source
from apps.question_bank.models import QuestionBankMembership


class Command(BaseCommand):
    help = "Backfill ExamQuestion.source_bank_* fields from canonical bank memberships."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview backfill results without writing DB.",
        )
        parser.add_argument(
            "--contest-id",
            type=str,
            default="",
            help="Optional contest UUID to backfill only one contest.",
        )

    def handle(self, *args, **options):
        dry_run: bool = bool(options.get("dry_run"))
        contest_id: str = (options.get("contest_id") or "").strip()

        membership_by_exam_question_id: dict[str, QuestionBankMembership] = {}
        duplicate_source_ids: set[str] = set()
        memberships = (
            QuestionBankMembership.objects.select_related(
                "bank",
                "question_asset",
                "question_asset__latest_version",
            )
            .filter(question_asset__latest_version__payload__source_type="exam_question")
            .order_by("-updated_at", "-id")
        )
        for membership in memberships:
            payload = membership.question_asset.latest_version.payload or {}
            source_id = str(payload.get("source_id") or "").strip()
            if not source_id:
                continue
            if source_id in membership_by_exam_question_id:
                duplicate_source_ids.add(source_id)
                continue
            membership_by_exam_question_id[source_id] = membership

        exam_questions = ExamQuestion.objects.all().order_by("contest_id", "order", "id")
        if contest_id:
            exam_questions = exam_questions.filter(contest_id=contest_id)

        stats = {
            "total": 0,
            "matched": 0,
            "updated": 0,
            "already_synced": 0,
            "missing_bank_link": 0,
            "duplicate_memberships": 0,
            "skipped_due_to_duplicate_memberships": 0,
        }

        for exam_question in exam_questions:
            stats["total"] += 1
            membership = membership_by_exam_question_id.get(str(exam_question.id))
            if membership is None:
                stats["missing_bank_link"] += 1
                continue

            stats["matched"] += 1
            if str(exam_question.id) in duplicate_source_ids:
                stats["duplicate_memberships"] += 1
                stats["skipped_due_to_duplicate_memberships"] += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping exam_question={exam_question.id} contest={exam_question.contest_id} "
                        "because multiple bank memberships share the same source_id"
                    )
                )
                continue

            synced = (
                str(exam_question.source_bank_id or "") == str(membership.bank.uuid)
                and str(exam_question.source_question_id or "") == str(membership.id)
                and (exam_question.source_bank_name or "") == (membership.bank.name or "")
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
                        f"bank={membership.bank.uuid} bank_item={membership.id}"
                    )
                )
                stats["updated"] += 1
                continue

            sync_exam_question_bank_source(
                exam_question=exam_question,
                membership=membership,
            )
            stats["updated"] += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"Backfilled exam_question={exam_question.id} "
                    f"contest={exam_question.contest_id} "
                    f"bank={membership.bank.uuid} bank_item={membership.id}"
                )
            )

        self.stdout.write("")
        self.stdout.write("=== Backfill Report ===")
        for key, value in stats.items():
            self.stdout.write(f"{key}={value}")
