"""Read-only database probes shared by UUID cutover commands."""
from django.db import connection


TARGET_PK_TABLES = (
    "problems",
    "question_assets",
    "question_bank_memberships",
    "contest_question_bindings",
    "exam_questions",
)
TARGET_FK_COLUMN_NAMES = (
    "problem_id",
    "question_asset_id",
    "source_question_id",
)
INTEGER_UDT_NAMES = {"int2", "int4", "int8"}


def table_exists(table_name: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass(%s)", [f"public.{table_name}"])
        return cursor.fetchone()[0] is not None


def collect_row_counts(table_names: tuple[str, ...]) -> dict[str, int]:
    counts: dict[str, int] = {}
    with connection.cursor() as cursor:
        for table_name in table_names:
            if not table_exists(table_name):
                continue
            cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
            counts[table_name] = int(cursor.fetchone()[0])
    return counts


def collect_pk_types() -> list[dict[str, str]]:
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


def collect_int_fk_candidates() -> list[dict[str, str]]:
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
