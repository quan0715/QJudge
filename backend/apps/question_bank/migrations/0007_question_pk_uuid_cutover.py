import uuid

from django.db import migrations, models
import django.db.models.deletion


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

    # 1) Prepare UUID shadow FK columns while integer PK is still present.
    cursor.execute('ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "source_question_id_uuid" uuid')
    cursor.execute(
        """
        UPDATE "questions" q
        SET "source_question_id_uuid" = src."uuid"
        FROM "questions" src
        WHERE q."source_question_id" = src."id"
        """
    )

    cursor.execute('ALTER TABLE "questions_coding_ext" ADD COLUMN IF NOT EXISTS "question_id_uuid" uuid')
    cursor.execute(
        """
        UPDATE "questions_coding_ext" ext
        SET "question_id_uuid" = q."uuid"
        FROM "questions" q
        WHERE ext."question_id" = q."id"
        """
    )
    cursor.execute('ALTER TABLE "questions_coding_ext" ALTER COLUMN "question_id_uuid" SET NOT NULL')

    # 2) Drop old FK/index/unique objects tied to integer columns.
    _drop_constraints_for_column(cursor, "questions", "source_question_id")
    _drop_indexes_for_column(cursor, "questions", "source_question_id")

    _drop_constraints_for_column(cursor, "questions_coding_ext", "question_id")
    _drop_indexes_for_column(cursor, "questions_coding_ext", "question_id")

    # 3) Swap FK columns.
    cursor.execute('ALTER TABLE "questions" DROP COLUMN IF EXISTS "source_question_id"')
    cursor.execute('ALTER TABLE "questions" RENAME COLUMN "source_question_id_uuid" TO "source_question_id"')

    cursor.execute('ALTER TABLE "questions_coding_ext" DROP COLUMN IF EXISTS "question_id"')
    cursor.execute('ALTER TABLE "questions_coding_ext" RENAME COLUMN "question_id_uuid" TO "question_id"')

    # 4) Swap question PK from integer id to existing uuid.
    cursor.execute('ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_pkey"')
    cursor.execute('ALTER TABLE "questions" RENAME COLUMN "id" TO "legacy_int_id"')
    cursor.execute('ALTER TABLE "questions" RENAME COLUMN "uuid" TO "id"')
    cursor.execute('ALTER TABLE "questions" ALTER COLUMN "legacy_int_id" DROP IDENTITY IF EXISTS')
    cursor.execute('ALTER TABLE "questions" ALTER COLUMN "legacy_int_id" DROP NOT NULL')

    cursor.execute('ALTER TABLE "questions" ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id")')
    cursor.execute('ALTER TABLE "questions" ADD CONSTRAINT "questions_legacy_int_id_key" UNIQUE ("legacy_int_id")')

    # 5) Recreate constraints/indexes on UUID-based columns.
    cursor.execute(
        """
        ALTER TABLE "questions"
        ADD CONSTRAINT "questions_source_question_id_fk_questions_id"
        FOREIGN KEY ("source_question_id") REFERENCES "questions"("id")
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "questions_coding_ext"
        ADD CONSTRAINT "questions_coding_ext_question_id_fk_questions_id"
        FOREIGN KEY ("question_id") REFERENCES "questions"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        'ALTER TABLE "questions_coding_ext" ADD CONSTRAINT "questions_coding_ext_question_id_key" UNIQUE ("question_id")'
    )

    cursor.execute(
        'CREATE INDEX IF NOT EXISTS "questions_source__unified_idx" ON "questions" ("source_bank_id", "source_question_id")'
    )
    cursor.execute(
        'CREATE INDEX IF NOT EXISTS "questions_source_question_uuid_idx" ON "questions" ("source_question_id")'
    )


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0006_questionbank_review_workflow"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(forwards, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="question",
                    name="id",
                ),
                migrations.AddField(
                    model_name="question",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                migrations.AddField(
                    model_name="question",
                    name="legacy_int_id",
                    field=models.PositiveIntegerField(
                        blank=True,
                        db_index=True,
                        null=True,
                        unique=True,
                    ),
                ),
                migrations.RemoveField(
                    model_name="question",
                    name="uuid",
                ),
                migrations.AlterField(
                    model_name="questioncodingext",
                    name="question",
                    field=models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="coding_ext",
                        to="question_bank.question",
                    ),
                ),
                migrations.AlterModelOptions(
                    name="question",
                    options={
                        "db_table": "questions",
                        "ordering": ["order", "created_at"],
                    },
                ),
            ],
        )
    ]
