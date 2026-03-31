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


def _add_shadow_uuid_fk(cursor, table: str, column: str, nullable: bool = False) -> None:
    shadow = f"{column}_uuid"
    cursor.execute(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{shadow}" uuid')
    cursor.execute(
        f"""
        UPDATE "{table}" child
        SET "{shadow}" = p."uuid"
        FROM "problems" p
        WHERE child."{column}" = p."id"
        """
    )
    if not nullable:
        cursor.execute(f'ALTER TABLE "{table}" ALTER COLUMN "{shadow}" SET NOT NULL')


def _resolve_problem_tags_table(cursor) -> str | None:
    candidates = ["problems_tags", "problems_problem_tags"]
    for table in candidates:
        cursor.execute("SELECT to_regclass(%s)", [table])
        if cursor.fetchone()[0]:
            return table
    return None



def forwards(apps, schema_editor):
    cursor = schema_editor.connection.cursor()
    cursor.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # 1) Add UUID source column on problems.
    cursor.execute('ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "uuid" uuid NOT NULL DEFAULT gen_random_uuid()')
    cursor.execute('ALTER TABLE "problems" ADD CONSTRAINT "problems_uuid_key" UNIQUE ("uuid")')

    # 2) Convert internal FK columns to shadow UUID columns.
    _add_shadow_uuid_fk(cursor, "problem_language_configs", "problem_id", nullable=False)
    _add_shadow_uuid_fk(cursor, "problem_translations", "problem_id", nullable=False)
    _add_shadow_uuid_fk(cursor, "test_cases", "problem_id", nullable=False)
    _add_shadow_uuid_fk(cursor, "problem_discussions", "problem_id", nullable=False)
    _add_shadow_uuid_fk(cursor, "problems", "origin_problem_id", nullable=True)

    problem_tags_table = _resolve_problem_tags_table(cursor)
    if problem_tags_table:
        cursor.execute(f'ALTER TABLE "{problem_tags_table}" ADD COLUMN IF NOT EXISTS "problem_id_uuid" uuid')
        cursor.execute(
            f"""
            UPDATE "{problem_tags_table}" rel
            SET "problem_id_uuid" = p."uuid"
            FROM "problems" p
            WHERE rel."problem_id" = p."id"
            """
        )
        cursor.execute(f'ALTER TABLE "{problem_tags_table}" ALTER COLUMN "problem_id_uuid" SET NOT NULL')

    # 3) Drop old constraints/indexes and swap columns.
    internal_tables = [
        ("problem_language_configs", "problem_id"),
        ("problem_translations", "problem_id"),
        ("test_cases", "problem_id"),
        ("problem_discussions", "problem_id"),
        ("problems", "origin_problem_id"),
    ]
    if problem_tags_table:
        internal_tables.append((problem_tags_table, "problem_id"))

    for table, column in internal_tables:
        _drop_constraints_for_column(cursor, table, column)
        _drop_indexes_for_column(cursor, table, column)
        cursor.execute(f'ALTER TABLE "{table}" DROP COLUMN IF EXISTS "{column}"')
        cursor.execute(f'ALTER TABLE "{table}" RENAME COLUMN "{column}_uuid" TO "{column}"')

    # 4) Swap PK.
    cursor.execute('ALTER TABLE "problems" DROP CONSTRAINT IF EXISTS "problems_pkey" CASCADE')
    cursor.execute('ALTER TABLE "problems" RENAME COLUMN "id" TO "legacy_int_id"')
    cursor.execute('ALTER TABLE "problems" RENAME COLUMN "uuid" TO "id"')
    cursor.execute('ALTER TABLE "problems" ALTER COLUMN "legacy_int_id" DROP IDENTITY IF EXISTS')
    cursor.execute('ALTER TABLE "problems" ALTER COLUMN "legacy_int_id" DROP NOT NULL')
    cursor.execute('ALTER TABLE "problems" ADD CONSTRAINT "problems_pkey" PRIMARY KEY ("id")')
    cursor.execute('ALTER TABLE "problems" ADD CONSTRAINT "problems_legacy_int_id_key" UNIQUE ("legacy_int_id")')

    # 5) Recreate FK / uniqueness.
    cursor.execute(
        """
        ALTER TABLE "problem_language_configs"
        ADD CONSTRAINT "problem_language_configs_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "problem_translations"
        ADD CONSTRAINT "problem_translations_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "test_cases"
        ADD CONSTRAINT "test_cases_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "problem_discussions"
        ADD CONSTRAINT "problem_discussions_problem_id_fk_problems_id"
        FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
        """
    )
    cursor.execute(
        """
        ALTER TABLE "problems"
        ADD CONSTRAINT "problems_origin_problem_id_fk_problems_id"
        FOREIGN KEY ("origin_problem_id") REFERENCES "problems"("id")
        ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
        """
    )
    if problem_tags_table:
        cursor.execute(
            f"""
            ALTER TABLE "{problem_tags_table}"
            ADD CONSTRAINT "{problem_tags_table}_problem_id_fk_problems_id"
            FOREIGN KEY ("problem_id") REFERENCES "problems"("id")
            ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
            """
        )

    cursor.execute(
        'ALTER TABLE "problem_language_configs" ADD CONSTRAINT "problem_language_configs_problem_id_language_uniq" UNIQUE ("problem_id", "language")'
    )
    cursor.execute(
        'ALTER TABLE "problem_translations" ADD CONSTRAINT "problem_translations_problem_id_language_uniq" UNIQUE ("problem_id", "language")'
    )
    if problem_tags_table:
        cursor.execute(
            f'ALTER TABLE "{problem_tags_table}" ADD CONSTRAINT "{problem_tags_table}_problem_id_tag_id_uniq" UNIQUE ("problem_id", "tag_id")'
        )

    cursor.execute('CREATE INDEX IF NOT EXISTS "problem_language_configs_problem_id_idx" ON "problem_language_configs" ("problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "problem_translations_problem_id_idx" ON "problem_translations" ("problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "test_cases_problem_id_idx" ON "test_cases" ("problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "problem_discussions_problem_id_idx" ON "problem_discussions" ("problem_id")')
    cursor.execute('CREATE INDEX IF NOT EXISTS "problems_origin_problem_id_idx" ON "problems" ("origin_problem_id")')


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0014_testcase_weight_percent"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(forwards, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="problem",
                    name="id",
                ),
                migrations.AddField(
                    model_name="problem",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                migrations.AddField(
                    model_name="problem",
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
                    model_name="problem",
                    name="origin_problem",
                    field=models.ForeignKey(
                        blank=True,
                        help_text="若此題由競賽題複製而來，記錄原始題目",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="practice_copies",
                        to="problems.problem",
                        verbose_name="來源題目",
                    ),
                ),
                migrations.AlterModelOptions(
                    name="problem",
                    options={
                        "db_table": "problems",
                        "ordering": ["order", "created_at"],
                        "verbose_name": "題目",
                        "verbose_name_plural": "題目",
                    },
                ),
            ],
        )
    ]
