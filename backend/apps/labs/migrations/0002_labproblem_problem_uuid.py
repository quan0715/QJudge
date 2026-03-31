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

    cursor.execute('ALTER TABLE "lab_problems" ADD COLUMN IF NOT EXISTS "problem_id_uuid" uuid')
    if _column_udt_name(cursor, "lab_problems", "problem_id") == "uuid":
        cursor.execute(
            """
            UPDATE "lab_problems" lp
            SET "problem_id_uuid" = lp."problem_id"
            WHERE lp."problem_id" IS NOT NULL
            """
        )
    else:
        cursor.execute(
            """
            UPDATE "lab_problems" lp
            SET "problem_id_uuid" = p."id"
            FROM "problems" p
            WHERE lp."problem_id" = p."legacy_int_id"
            """
        )
    cursor.execute('ALTER TABLE "lab_problems" ALTER COLUMN "problem_id_uuid" SET NOT NULL')

    _drop_constraints_for_column(cursor, "lab_problems", "problem_id")
    _drop_indexes_for_column(cursor, "lab_problems", "problem_id")

    cursor.execute('ALTER TABLE "lab_problems" DROP COLUMN IF EXISTS "problem_id"')
    cursor.execute('ALTER TABLE "lab_problems" RENAME COLUMN "problem_id_uuid" TO "problem_id"')

    cursor.execute(
        """
        ALTER TABLE "lab_problems"
        ADD CONSTRAINT "lab_problems_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        'ALTER TABLE "lab_problems" ADD CONSTRAINT "lab_problems_lab_id_problem_id_uniq" UNIQUE ("lab_id", "problem_id")'
    )
    cursor.execute('CREATE INDEX IF NOT EXISTS "lab_problems_problem_id_idx" ON "lab_problems" ("problem_id")')


class Migration(migrations.Migration):
    dependencies = [
        ("labs", "0001_initial"),
        ("problems", "0015_problem_pk_uuid_cutover"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
