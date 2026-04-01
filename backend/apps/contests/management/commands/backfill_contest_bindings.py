"""
Backfill ContestQuestionBinding rows for existing ContestProblems.

Safe to run multiple times (idempotent via update_or_create on legacy_contest_problem).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.contests.models import ContestProblem
from apps.question_bank.models import ContestQuestionBinding, QuestionAsset


class Command(BaseCommand):
    help = "Backfill ContestQuestionBinding for every ContestProblem that lacks one."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Report only, don't write.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        qs = (
            ContestProblem.objects.select_related("problem", "contest")
            .order_by("contest_id", "order", "id")
        )

        total = qs.count()
        created = 0
        updated = 0
        skipped_no_asset = 0

        for cp in qs.iterator(chunk_size=200):
            # Resolve asset
            asset_id = cp.question_asset_id or (cp.problem.question_asset_id if cp.problem_id else None)
            version_id = cp.question_version_id or (cp.problem.question_version_id if cp.problem_id else None)

            if not asset_id and cp.problem_id:
                # Try to auto-create asset
                try:
                    from apps.question_bank.question_assets import sync_problem_question_asset
                    asset, version = sync_problem_question_asset(
                        problem=cp.problem,
                        actor=cp.problem.created_by or cp.contest.owner,
                    )
                    asset_id = asset.pk
                    version_id = version.pk
                except Exception as e:
                    self.stderr.write(f"  SKIP ContestProblem {cp.id}: cannot create asset: {e}")
                    skipped_no_asset += 1
                    continue

            if not asset_id:
                skipped_no_asset += 1
                continue

            if dry_run:
                exists = ContestQuestionBinding.objects.filter(legacy_contest_problem=cp).exists()
                if not exists:
                    created += 1
                else:
                    updated += 1
                continue

            with transaction.atomic():
                _, was_created = ContestQuestionBinding.objects.update_or_create(
                    legacy_contest_problem=cp,
                    defaults={
                        "contest": cp.contest,
                        "question_asset_id": asset_id,
                        "question_version_id": version_id,
                        "coding_problem_id": cp.problem_id,
                        "binding_type": QuestionAsset.AssetType.CODING,
                        "order": cp.order,
                        "score": cp.max_score or 100,
                        "source_bank_id": cp.source_bank_id,
                        "source_bank_name": cp.source_bank_name,
                        "source_question_id": cp.source_question_id,
                        "source_mode": cp.source_mode,
                    },
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            f"{prefix}Total: {total}, Created: {created}, Updated: {updated}, "
            f"Skipped (no asset): {skipped_no_asset}"
        )
