import uuid

from django.db import migrations, models
import django.db.models.deletion


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


def _has_column(cursor, table: str, column: str) -> bool:
    cursor.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s
              AND column_name = %s
        )
        """,
        [table, column],
    )
    return bool(cursor.fetchone()[0])


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
    cursor.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # 1) Add UUID helper column for exam_questions PK cutover.
    cursor.execute(
        'ALTER TABLE "exam_questions" ADD COLUMN IF NOT EXISTS "uuid" uuid NOT NULL DEFAULT gen_random_uuid()'
    )
    cursor.execute('ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_uuid_key" UNIQUE ("uuid")')

    # 2) Create shadow UUID columns for problem/question references.
    cursor.execute('ALTER TABLE "contest_problems" ADD COLUMN IF NOT EXISTS "problem_id_uuid" uuid')
    if _column_udt_name(cursor, "contest_problems", "problem_id") == "uuid":
        cursor.execute(
            """
            UPDATE "contest_problems" cp
            SET "problem_id_uuid" = cp."problem_id"
            WHERE cp."problem_id" IS NOT NULL
            """
        )
    else:
        cursor.execute(
            """
            UPDATE "contest_problems" cp
            SET "problem_id_uuid" = p."id"
            FROM "problems" p
            WHERE cp."problem_id" = p."legacy_int_id"
            """
        )
    cursor.execute('ALTER TABLE "contest_problems" ALTER COLUMN "problem_id_uuid" SET NOT NULL')

    cursor.execute('ALTER TABLE "contest_clarifications" ADD COLUMN IF NOT EXISTS "problem_id_uuid" uuid')
    if _column_udt_name(cursor, "contest_clarifications", "problem_id") == "uuid":
        cursor.execute(
            """
            UPDATE "contest_clarifications" cc
            SET "problem_id_uuid" = cc."problem_id"
            WHERE cc."problem_id" IS NOT NULL
            """
        )
    else:
        cursor.execute(
            """
            UPDATE "contest_clarifications" cc
            SET "problem_id_uuid" = p."id"
            FROM "problems" p
            WHERE cc."problem_id" = p."legacy_int_id"
            """
        )

    cursor.execute('ALTER TABLE "contest_problems" ADD COLUMN IF NOT EXISTS "source_question_id_uuid" uuid')
    if _column_udt_name(cursor, "contest_problems", "source_question_id") == "uuid":
        cursor.execute(
            """
            UPDATE "contest_problems" cp
            SET "source_question_id_uuid" = cp."source_question_id"
            WHERE cp."source_question_id" IS NOT NULL
            """
        )
    else:
        if _has_column(cursor, "questions", "legacy_int_id"):
            cursor.execute(
                """
                UPDATE "contest_problems" cp
                SET "source_question_id_uuid" = q."id"
                FROM "questions" q
                WHERE cp."source_question_id" = q."legacy_int_id"
                """
            )

    cursor.execute('ALTER TABLE "exam_questions" ADD COLUMN IF NOT EXISTS "source_question_id_uuid" uuid')
    if _column_udt_name(cursor, "exam_questions", "source_question_id") == "uuid":
        cursor.execute(
            """
            UPDATE "exam_questions" eq
            SET "source_question_id_uuid" = eq."source_question_id"
            WHERE eq."source_question_id" IS NOT NULL
            """
        )
    else:
        if _has_column(cursor, "questions", "legacy_int_id"):
            cursor.execute(
                """
                UPDATE "exam_questions" eq
                SET "source_question_id_uuid" = q."id"
                FROM "questions" q
                WHERE eq."source_question_id" = q."legacy_int_id"
                """
            )

    cursor.execute('ALTER TABLE "exam_answers" ADD COLUMN IF NOT EXISTS "question_id_uuid" uuid')
    if _column_udt_name(cursor, "exam_answers", "question_id") == "uuid":
        cursor.execute(
            """
            UPDATE "exam_answers" ea
            SET "question_id_uuid" = ea."question_id"
            WHERE ea."question_id" IS NOT NULL
            """
        )
    else:
        cursor.execute(
            """
            UPDATE "exam_answers" ea
            SET "question_id_uuid" = eq."uuid"
            FROM "exam_questions" eq
            WHERE ea."question_id" = eq."id"
            """
        )
    cursor.execute('ALTER TABLE "exam_answers" ALTER COLUMN "question_id_uuid" SET NOT NULL')

    # Flush deferred FK trigger queue before dropping/recreating constraints
    # on the same tables inside this migration transaction.
    cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")

    # 3) Drop old constraints/indexes and swap columns.
    swap_targets = [
        ("contest_problems", "problem_id"),
        ("contest_clarifications", "problem_id"),
        ("contest_problems", "source_question_id"),
        ("exam_questions", "source_question_id"),
        ("exam_answers", "question_id"),
    ]
    for table, column in swap_targets:
        _drop_constraints_for_column(cursor, table, column)
        _drop_indexes_for_column(cursor, table, column)
        cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN IF EXISTS "{column}"')
        cursor.execute(f'ALTER TABLE "{table}" RENAME COLUMN "{column}_uuid" TO "{column}"')

    # 4) Swap exam_questions PK.
    cursor.execute('ALTER TABLE "exam_questions" DROP CONSTRAINT IF EXISTS "exam_questions_pkey"')
    cursor.execute('ALTER TABLE "exam_questions" RENAME COLUMN "id" TO "legacy_int_id"')
    cursor.execute('ALTER TABLE "exam_questions" RENAME COLUMN "uuid" TO "id"')
    cursor.execute('ALTER TABLE "exam_questions" ALTER COLUMN "legacy_int_id" DROP IDENTITY IF EXISTS')
    cursor.execute('ALTER TABLE "exam_questions" ALTER COLUMN "legacy_int_id" DROP NOT NULL')
    cursor.execute('ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")')
    cursor.execute('ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_legacy_int_id_key" UNIQUE ("legacy_int_id")')

    # 5) Recreate FK / unique constraints.
    cursor.execute(
        """
        ALTER TABLE "contest_problems"
        ADD CONSTRAINT "contest_problems_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "contest_clarifications"
        ADD CONSTRAINT "contest_clarifications_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "exam_answers"
        ADD CONSTRAINT "exam_answers_question_id_fk_exam_questions_id"
        FOREIGN KEY ("question_id") REFERENCES "exam_questions"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )

    cursor.execute(
        'ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_problem_id_uniq" UNIQUE ("contest_id", "problem_id")'
    )
    cursor.execute(
        'ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_participant_id_question_id_uniq" UNIQUE ("participant_id", "question_id")'
    )

    cursor.execute('CREATE INDEX IF NOT EXISTS "contest_problems_problem_id_idx" ON "contest_problems" ("problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "contest_problems_source_question_id_idx" ON "contest_problems" ("source_question_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "exam_questions_source_question_id_idx" ON "exam_questions" ("source_question_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "contest_clarifications_problem_id_idx" ON "contest_clarifications" ("problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "exam_answers_question_id_idx" ON "exam_answers" ("question_id")')


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0057_contest_question_edit_lock_fields"),
        ("problems", "0015_problem_pk_uuid_cutover"),
        ("question_bank", "0007_question_pk_uuid_cutover"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(forwards, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="examquestion",
                    name="id",
                ),
                migrations.AddField(
                    model_name="examquestion",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                migrations.AddField(
                    model_name="examquestion",
                    name="legacy_int_id",
                    field=models.PositiveIntegerField(
                        blank=True,
                        db_index=True,
                        null=True,
                        unique=True,
                        verbose_name="舊版整數 ID",
                    ),
                ),
                migrations.AlterField(
                    model_name="contestproblem",
                    name="source_question_id",
                    field=models.UUIDField(
                        blank=True,
                        null=True,
                        verbose_name="來源題庫題目 UUID",
                    ),
                ),
                migrations.AlterField(
                    model_name="examquestion",
                    name="source_question_id",
                    field=models.UUIDField(
                        blank=True,
                        null=True,
                        verbose_name="來源題庫題目 UUID",
                    ),
                ),
                migrations.AlterField(
                    model_name="examanswer",
                    name="question",
                    field=models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="answers",
                        to="contests.examquestion",
                        verbose_name="題目",
                    ),
                ),
                migrations.AlterModelOptions(
                    name="examquestion",
                    options={
                        "db_table": "exam_questions",
                        "ordering": ["order", "created_at"],
                        "verbose_name": "考卷題目",
                        "verbose_name_plural": "考卷題目",
                    },
                ),
            ],
        )
    ]
