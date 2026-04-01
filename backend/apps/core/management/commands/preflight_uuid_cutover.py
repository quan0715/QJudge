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
from django.db import connection


TARGET_PK_TABLES = ("problems", "questions", "exam_questions")
TARGET_ROW_COUNT_TABLES = (
    "question_banks",
    "questions",
    "questions_coding_ext",
    "problems",
    "contest_problems",
    "exam_questions",
    "exam_answers",
    "submissions",
)
TARGET_FK_COLUMN_NAMES = (
    "problem_id",
    "question_id",
    "source_question_id",
)
INTEGER_UDT_NAMES = {"int2", "int4", "int8"}


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
            "row_counts": self._collect_row_counts(),
            "pk_types": self._collect_pk_types(),
            "int_fk_candidates": self._collect_int_fk_candidates(),
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

    def _table_exists(self, table_name: str) -> bool:
        with connection.cursor() as cursor:
            cursor.execute("SELECT to_regclass(%s)", [f"public.{table_name}"])
            return cursor.fetchone()[0] is not None

    def _collect_row_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        with connection.cursor() as cursor:
            for table_name in TARGET_ROW_COUNT_TABLES:
                if not self._table_exists(table_name):
                    continue
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                counts[table_name] = int(cursor.fetchone()[0])
        return counts

    def _collect_pk_types(self) -> list[dict[str, str]]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.table_name, c.column_name, c.data_type, c.udt_name
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name = ANY(%s)
                  AND c.column_name = 'id'
                ORDER BY c.table_name
                """,
                [list(TARGET_PK_TABLES)],
            )
            rows = cursor.fetchall()
        return [
            {
                "table_name": row[0],
                "column_name": row[1],
                "data_type": row[2],
                "udt_name": row[3],
            }
            for row in rows
        ]

    def _collect_int_fk_candidates(self) -> list[dict[str, str]]:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.table_name, c.column_name, c.data_type, c.udt_name
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.column_name = ANY(%s)
                  AND c.udt_name = ANY(%s)
                ORDER BY c.table_name, c.column_name
                """,
                [list(TARGET_FK_COLUMN_NAMES), list(INTEGER_UDT_NAMES)],
            )
            rows = cursor.fetchall()
        return [
            {
                "table_name": row[0],
                "column_name": row[1],
                "data_type": row[2],
                "udt_name": row[3],
            }
            for row in rows
        ]
