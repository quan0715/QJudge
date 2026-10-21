"""
Preflight checks before UUID cutover.

Usage:
    python manage.py preflight_uuid_cutover
    python manage.py preflight_uuid_cutover --output /tmp/uuid-preflight.json
    python manage.py preflight_uuid_cutover --fail-on-issues
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from apps.core.management import uuid_cutover


TARGET_ROW_COUNT_TABLES = (
    "question_banks",
    "question_assets",
    "question_bank_memberships",
    "contest_question_bindings",
    "problems",
    "exam_questions",
    "exam_answers",
    "submissions",
)


class Command(BaseCommand):
    help = "Audit DB readiness for UUID cutover (question/problem domain)."

    def add_arguments(self, parser):
        parser.add_argument("--output", type=str, help="Write JSON report to this path.")
        parser.add_argument(
            "--fail-on-issues",
            action="store_true",
            help="Exit non-zero if integer FK candidates or non-UUID PK types are found.",
        )

    def handle(self, *args, **options):
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "row_counts": uuid_cutover.collect_row_counts(TARGET_ROW_COUNT_TABLES),
            "pk_types": uuid_cutover.collect_pk_types(),
            "int_fk_candidates": uuid_cutover.collect_int_fk_candidates(),
        }

        payload = json.dumps(report, ensure_ascii=False, indent=2)
        self.stdout.write(payload)

        output = options.get("output")
        if output:
            path = Path(output)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(payload, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Report written: {path}"))

        if options.get("fail_on_issues"):
            non_uuid_pk = [
                item
                for item in report["pk_types"]
                if item.get("udt_name") != "uuid"
            ]
            if report["int_fk_candidates"] or non_uuid_pk:
                raise CommandError("Preflight detected UUID cutover issues. See JSON report.")
