"""
Post-migration verification for UUID cutover.

Usage:
    python manage.py verify_uuid_cutover
    python manage.py verify_uuid_cutover --baseline /tmp/uuid-preflight.json
    python manage.py verify_uuid_cutover --fail-on-issues
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
    "contest_clarifications",
    "exam_questions",
    "exam_answers",
    "submissions",
    "ai_aisession",
    "ai_aipendingaction",
    "lab_problems",
)
TARGET_FK_COLUMN_NAMES = (
    "problem_id",
    "question_id",
    "source_question_id",
)
INTEGER_UDT_NAMES = {"int2", "int4", "int8"}

ORPHAN_CHECKS = (
    (
        "contest_problems.problem_id -> problems.id",
        """
        SELECT COUNT(*)
        FROM contest_problems cp
        LEFT JOIN problems p ON p.id = cp.problem_id
        WHERE cp.problem_id IS NOT NULL
          AND p.id IS NULL
        """,
    ),
    (
        "contest_problems.source_question_id -> questions.id",
        """
        SELECT COUNT(*)
        FROM contest_problems cp
        LEFT JOIN questions q ON q.id = cp.source_question_id
        WHERE cp.source_question_id IS NOT NULL
          AND q.id IS NULL
        """,
    ),
    (
        "contest_clarifications.problem_id -> problems.id",
        """
        SELECT COUNT(*)
        FROM contest_clarifications cc
        LEFT JOIN problems p ON p.id = cc.problem_id
        WHERE cc.problem_id IS NOT NULL
          AND p.id IS NULL
        """,
    ),
    (
        "exam_questions.source_question_id -> questions.id",
        """
        SELECT COUNT(*)
        FROM exam_questions eq
        LEFT JOIN questions q ON q.id = eq.source_question_id
        WHERE eq.source_question_id IS NOT NULL
          AND q.id IS NULL
        """,
    ),
    (
        "exam_answers.question_id -> exam_questions.id",
        """
        SELECT COUNT(*)
        FROM exam_answers ea
        LEFT JOIN exam_questions eq ON eq.id = ea.question_id
        WHERE ea.question_id IS NOT NULL
          AND eq.id IS NULL
        """,
    ),
    (
        "submissions.problem_id -> problems.id",
        """
        SELECT COUNT(*)
        FROM submissions s
        LEFT JOIN problems p ON p.id = s.problem_id
        WHERE s.problem_id IS NOT NULL
          AND p.id IS NULL
        """,
    ),
    (
        "questions.source_question_id -> questions.id",
        """
        SELECT COUNT(*)
        FROM questions child
        LEFT JOIN questions src ON src.id = child.source_question_id
        WHERE child.source_question_id IS NOT NULL
          AND src.id IS NULL
        """,
    ),
    (
        "questions_coding_ext.question_id -> questions.id",
        """
        SELECT COUNT(*)
        FROM questions_coding_ext ext
        LEFT JOIN questions q ON q.id = ext.question_id
        WHERE ext.question_id IS NOT NULL
          AND q.id IS NULL
        """,
    ),
    (
        "ai_aisession.created_problem_id -> problems.id",
        """
        SELECT COUNT(*)
        FROM ai_aisession s
        LEFT JOIN problems p ON p.id = s.created_problem_id
        WHERE s.created_problem_id IS NOT NULL
          AND p.id IS NULL
        """,
    ),
    (
        "ai_aipendingaction.target_problem_id -> problems.id",
        """
        SELECT COUNT(*)
        FROM ai_aipendingaction a
        LEFT JOIN problems p ON p.id = a.target_problem_id
        WHERE a.target_problem_id IS NOT NULL
          AND p.id IS NULL
        """,
    ),
    (
        "lab_problems.problem_id -> problems.id",
        """
        SELECT COUNT(*)
        FROM lab_problems lp
        LEFT JOIN problems p ON p.id = lp.problem_id
        WHERE lp.problem_id IS NOT NULL
          AND p.id IS NULL
        """,
    ),
)


class Command(BaseCommand):
    help = "Verify UUID cutover integrity (row counts, PK/FK type, orphan FKs)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--baseline",
            type=str,
            help="Path to preflight JSON report. When present, row counts are compared.",
        )
        parser.add_argument(
            "--output",
            type=str,
            help="Write JSON report to this path.",
        )
        parser.add_argument(
            "--fail-on-issues",
            action="store_true",
            help="Exit non-zero when mismatches/orphans/non-UUID types are found.",
        )

    def handle(self, *args, **options):
        baseline = self._read_baseline(options.get("baseline"))
        row_counts = self._collect_row_counts()
        pk_types = self._collect_pk_types()
        int_fk_candidates = self._collect_int_fk_candidates()
        orphan_counts = self._collect_orphan_counts()
        row_count_diffs = self._diff_row_counts(
            baseline.get("row_counts", {}) if baseline else {},
            row_counts,
        )

        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "baseline_path": options.get("baseline"),
            "row_counts": row_counts,
            "row_count_diffs": row_count_diffs,
            "pk_types": pk_types,
            "int_fk_candidates": int_fk_candidates,
            "orphan_counts": orphan_counts,
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
                item for item in pk_types if item.get("udt_name") != "uuid"
            ]
            orphan_issues = [item for item in orphan_counts if item.get("count", 0) > 0]
            row_count_issues = [item for item in row_count_diffs if item.get("delta") != 0]
            if non_uuid_pk or int_fk_candidates or orphan_issues or row_count_issues:
                raise CommandError("UUID cutover verification detected issues. See JSON report.")

    def _read_baseline(self, path: str | None) -> dict | None:
        if not path:
            return None
        baseline_path = Path(path)
        if not baseline_path.exists():
            raise CommandError(f"Baseline file not found: {baseline_path}")
        try:
            return json.loads(baseline_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid baseline JSON: {exc}") from exc

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

    def _diff_row_counts(self, baseline: dict, current: dict[str, int]) -> list[dict[str, int]]:
        rows: list[dict[str, int]] = []
        for table_name, current_count in current.items():
            previous = baseline.get(table_name)
            if previous is None:
                continue
            rows.append(
                {
                    "table_name": table_name,
                    "baseline": int(previous),
                    "current": current_count,
                    "delta": current_count - int(previous),
                }
            )
        return rows

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

    def _collect_orphan_counts(self) -> list[dict[str, int | str]]:
        report: list[dict[str, int | str]] = []
        with connection.cursor() as cursor:
            for name, sql in ORPHAN_CHECKS:
                # Skip checks for tables not present in this runtime schema.
                tables = self._extract_table_names(sql)
                if not all(self._table_exists(table) for table in tables):
                    report.append({"check": name, "count": 0, "skipped": "table_missing"})
                    continue
                cursor.execute(sql)
                report.append({"check": name, "count": int(cursor.fetchone()[0])})
        return report

    @staticmethod
    def _extract_table_names(sql: str) -> set[str]:
        tokens = sql.replace("\n", " ").split()
        tables: set[str] = set()
        for idx, token in enumerate(tokens):
            normalized = token.lower()
            if normalized in {"from", "join"} and idx + 1 < len(tokens):
                raw_table = tokens[idx + 1].strip('"')
                tables.add(raw_table)
        return tables
