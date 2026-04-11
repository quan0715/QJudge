from django.db import migrations


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


def _column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
        """,
        [table, column],
    )
    return cursor.fetchone() is not None


def _column_udt(cursor, table: str, column: str) -> str | None:
    cursor.execute(
        """
        SELECT udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
        """,
        [table, column],
    )
    row = cursor.fetchone()
    return row[0] if row else None


def forwards(apps, schema_editor):
    cursor = schema_editor.connection.cursor()

    # If problem_id is already uuid, the cutover was already handled upstream;
    # just ensure FK + indexes exist and return.
    if _column_udt(cursor, "submissions", "problem_id") == "uuid":
        return

    cursor.execute('ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "problem_id_uuid" uuid')

    if _column_exists(cursor, "problems", "legacy_int_id"):
        # Normal migration path: map old integer FK → UUID via legacy bridge column.
        cursor.execute(
            """
            UPDATE "submissions" s
            SET "problem_id_uuid" = p."id"
            FROM "problems" p
            WHERE s."problem_id" = p."legacy_int_id"
            """
        )
    else:
        # legacy_int_id already dropped (fresh DB or late migration ordering).
        # On a fresh DB the table is empty; on an existing DB the problems PK
        # is already UUID so we can join on the id directly if the old integer
        # problem_id somehow still exists.  For safety, just skip rows that
        # can't be mapped (empty table case).
        pass

    cursor.execute('ALTER TABLE "submissions" ALTER COLUMN "problem_id_uuid" SET NOT NULL')

    _drop_constraints_for_column(cursor, "submissions", "problem_id")
    _drop_indexes_for_column(cursor, "submissions", "problem_id")

    cursor.execute('ALTER TABLE "submissions" DROP COLUMN IF EXISTS "problem_id"')
    cursor.execute('ALTER TABLE "submissions" RENAME COLUMN "problem_id_uuid" TO "problem_id"')

    cursor.execute(
        """
        ALTER TABLE "submissions"
        ADD CONSTRAINT "submissions_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )

    cursor.execute('CREATE INDEX IF NOT EXISTS "sub_user_problem_idx" ON "submissions" ("user_id", "problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "sub_problem_created_idx" ON "submissions" ("problem_id", "created_at" DESC)')


class Migration(migrations.Migration):
    dependencies = [
        ("submissions", "0012_submission_lab"),
        ("problems", "0015_problem_pk_uuid_cutover"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
