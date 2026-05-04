"""Renumber ExamQuestion.order so each contest has contiguous 0..N-1 orders.

The exam editor used to send explicit ``order`` values from the client
(e.g. ``source.order + 1`` when duplicating a question), and the
backend honoured them without checking for collisions. That left
contests with multiple questions sharing the same ``order`` value,
which then surfaced in the question stats gallery as ``Q0`` repeating
several times.

This command finds every contest with duplicate ``order`` values and
re-assigns the orders to a contiguous range, preserving the existing
sort by ``(order, created_at, id)``. It uses a two-pass update with a
negative pivot range so it stays legal even after the deferrable
``UniqueConstraint(contest, order)`` is applied.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.contests.models import ExamQuestion


class Command(BaseCommand):
    help = (
        "Renumber ExamQuestion.order so every contest has contiguous 0..N-1 "
        "orders. Resolves duplicate-order data introduced before the unique "
        "constraint landed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--contest-id",
            help=(
                "Renumber a single contest only (UUID). Without this flag, "
                "scans every contest that currently has duplicate orders."
            ),
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help=(
                "Renumber every contest, even ones that look fine. Useful "
                "for backfilling gaps in ``order`` after deletes."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report planned changes without writing.",
        )

    def handle(self, *args, **options):
        contest_id = options.get("contest_id")
        run_all = options.get("all", False)
        dry_run = options.get("dry_run", False)

        if contest_id:
            contest_ids = [contest_id]
        elif run_all:
            contest_ids = list(
                ExamQuestion.objects.values_list("contest_id", flat=True).distinct()
            )
        else:
            contest_ids = list(
                ExamQuestion.objects.values("contest_id", "order")
                .annotate(count=Count("id"))
                .filter(count__gt=1)
                .values_list("contest_id", flat=True)
                .distinct()
            )

        if not contest_ids:
            self.stdout.write(
                self.style.SUCCESS(
                    "No contests with duplicate exam question orders."
                )
            )
            return

        renumbered = 0
        skipped = 0
        for cid in contest_ids:
            changed = self._renumber_contest(cid, dry_run=dry_run)
            if changed:
                renumbered += 1
            else:
                skipped += 1

        verb = "would renumber" if dry_run else "renumbered"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {renumbered} contest(s); {skipped} already contiguous."
            )
        )

    def _renumber_contest(self, contest_id, *, dry_run: bool) -> bool:
        questions = list(
            ExamQuestion.objects.filter(contest_id=contest_id)
            .order_by("order", "created_at", "id")
        )
        if not questions:
            self.stdout.write(f"Contest {contest_id}: no questions, skipping.")
            return False

        plan = [
            (q.id, q.order, new_order)
            for new_order, q in enumerate(questions)
            if q.order != new_order
        ]
        if not plan:
            return False

        self.stdout.write(
            f"Contest {contest_id}: {len(plan)} question(s) need renumbering."
        )
        for qid, old, new in plan[:5]:
            self.stdout.write(f"  - {qid}: {old} -> {new}")
        if len(plan) > 5:
            self.stdout.write(f"  ... (+{len(plan) - 5} more)")

        if dry_run:
            return True

        with transaction.atomic():
            # Two-pass write: shift to a disjoint negative range first so we
            # never collide with the existing rows (or with the deferrable
            # unique constraint) while we re-allocate orders.
            for new_order, q in enumerate(questions):
                ExamQuestion.objects.filter(pk=q.id).update(order=-1 - new_order)
            for new_order, q in enumerate(questions):
                ExamQuestion.objects.filter(pk=q.id).update(order=new_order)

        return True
