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

    cursor.execute('ALTER TABLE "ai_aisession" ADD COLUMN IF NOT EXISTS "created_problem_id_uuid" uuid')
    if _column_udt_name(cursor, "ai_aisession", "created_problem_id") == "uuid":
        cursor.execute(
            """
            UPDATE "ai_aisession" s
            SET "created_problem_id_uuid" = s."created_problem_id"
            WHERE s."created_problem_id" IS NOT NULL
            """
        )
    else:
        cursor.execute(
            """
            UPDATE "ai_aisession" s
            SET "created_problem_id_uuid" = p."id"
            FROM "problems" p
            WHERE s."created_problem_id" = p."legacy_int_id"
            """
        )

    cursor.execute('ALTER TABLE "ai_aipendingaction" ADD COLUMN IF NOT EXISTS "target_problem_id_uuid" uuid')
    if _column_udt_name(cursor, "ai_aipendingaction", "target_problem_id") == "uuid":
        cursor.execute(
            """
            UPDATE "ai_aipendingaction" a
            SET "target_problem_id_uuid" = a."target_problem_id"
            WHERE a."target_problem_id" IS NOT NULL
            """
        )
    else:
        cursor.execute(
            """
            UPDATE "ai_aipendingaction" a
            SET "target_problem_id_uuid" = p."id"
            FROM "problems" p
            WHERE a."target_problem_id" = p."legacy_int_id"
            """
        )

    for table, column in [
        ("ai_aisession", "created_problem_id"),
        ("ai_aipendingaction", "target_problem_id"),
    ]:
        _drop_constraints_for_column(cursor, table, column)
        _drop_indexes_for_column(cursor, table, column)
        cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN IF EXISTS "{column}"')
        cursor.execute(f'ALTER TABLE "{table}" RENAME COLUMN "{column}_uuid" TO "{column}"')

    cursor.execute(
        """
        ALTER TABLE "ai_aisession"
        ADD CONSTRAINT "ai_aisession_created_problem_id_fk_problems_id"
        FOREIGN KEY ("created_problem_id") REFERENCES "problems"("id")
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "ai_aipendingaction"
        ADD CONSTRAINT "ai_aipendingaction_target_problem_id_fk_problems_id"
        FOREIGN KEY ("target_problem_id") REFERENCES "problems"("id")
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
        """
    )

    cursor.execute('CREATE INDEX IF NOT EXISTS "ai_aisession_created_problem_id_idx" ON "ai_aisession" ("created_problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "ai_aipendingaction_target_problem_id_idx" ON "ai_aipendingaction" ("target_problem_id")')


class Migration(migrations.Migration):
    dependencies = [
        ("ai", "0007_remove_aisession_ai_aisessio_user_id_3156dc_idx_and_more"),
        ("problems", "0015_problem_pk_uuid_cutover"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
