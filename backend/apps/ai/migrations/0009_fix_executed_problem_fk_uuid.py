"""Fix executed_problem_id column type: bigint → uuid.

Migration 0008 converted created_problem_id and target_problem_id to uuid
but missed executed_problem_id on ai_aipendingaction.
"""
from django.db import migrations


def _column_udt_name(cursor, table: str, column: str) -> str | None:
    cursor.execute(
        """
        SELECT c.udt_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = %s
          AND c.column_name = %s
        """,
        [table, column],
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _drop_constraints_for_column(cursor, table: str, column: str) -> None:
    cursor.execute(
        """
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = rel.oid
        WHERE rel.relname = %s
          AND att.attnum = ANY(con.conkey)
          AND att.attname = %s
        """,
        [table, column],
    )
    for (constraint_name,) in cursor.fetchall():
        cursor.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{constraint_name}"')


def _drop_indexes_for_column(cursor, table: str, column: str) -> None:
    cursor.execute(
        """
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = %s
          AND indexdef ILIKE %s
          AND indexname NOT ILIKE %s
        """,
        [table, f"%({column})%", "%pkey%"],
    )
    for (index_name,) in cursor.fetchall():
        cursor.execute(f'DROP INDEX IF EXISTS "{index_name}"')


def forwards(apps, schema_editor):
    cursor = schema_editor.connection.cursor()
    table = "ai_aipendingaction"
    column = "executed_problem_id"

    udt = _column_udt_name(cursor, table, column)
    if udt == "uuid":
        # Already correct — nothing to do (idempotent).
        return

    # 1. Add temp uuid column (old int values are unmappable — legacy_int_id
    #    was already dropped, so we intentionally lose the stale references).
    cursor.execute(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{column}_uuid" uuid')

    # 3. Drop old column constraints/indexes, swap columns
    _drop_constraints_for_column(cursor, table, column)
    _drop_indexes_for_column(cursor, table, column)
    cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN IF EXISTS "{column}"')
    cursor.execute(f'ALTER TABLE "{table}" RENAME COLUMN "{column}_uuid" TO "{column}"')

    # 4. Re-add FK + index
    cursor.execute(
        f"""
        ALTER TABLE "{table}"
        ADD CONSTRAINT "{table}_{column}_fk_problems_id"
        FOREIGN KEY ("{column}") REFERENCES "problems"("id")
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(f'CREATE INDEX IF NOT EXISTS "{table}_{column}_idx" ON "{table}" ("{column}")')


class Migration(migrations.Migration):
    dependencies = [
        ("ai", "0008_problem_fk_uuid"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
