from django.db import migrations, models


def backfill_contest_problem_max_score(apps, schema_editor):
    cursor = schema_editor.connection.cursor()
    cursor.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'problems'
              AND column_name = 'legacy_int_id'
        )
        """
    )
    has_legacy_int_id = bool(cursor.fetchone()[0])

    if has_legacy_int_id:
        cursor.execute(
            """
            UPDATE contest_problems cp
            SET max_score = GREATEST(1, COALESCE(src.total_score, 100)::int)
            FROM (
                SELECT cp_inner.id AS contest_problem_id, COALESCE(SUM(tc.score), 0) AS total_score
                FROM contest_problems cp_inner
                LEFT JOIN problems p
                    ON p.legacy_int_id = cp_inner.problem_id
                LEFT JOIN test_cases tc
                    ON tc.problem_id = p.id
                GROUP BY cp_inner.id
            ) src
            WHERE cp.id = src.contest_problem_id
            """
        )
        return

    cursor.execute(
        """
        UPDATE contest_problems cp
        SET max_score = GREATEST(1, COALESCE(src.total_score, 100)::int)
        FROM (
            SELECT cp_inner.id AS contest_problem_id, COALESCE(SUM(tc.score), 0) AS total_score
            FROM contest_problems cp_inner
            LEFT JOIN test_cases tc
                ON tc.problem_id = cp_inner.problem_id
            GROUP BY cp_inner.id
        ) src
        WHERE cp.id = src.contest_problem_id
        """
    )


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0045_add_screen_share_interrupted_event_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="contestproblem",
            name="max_score",
            field=models.PositiveIntegerField(default=100, verbose_name="題目配分"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_bank_id",
            field=models.UUIDField(blank=True, null=True, verbose_name="來源題庫 UUID"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_bank_name",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="來源題庫名稱"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_mode",
            field=models.CharField(
                choices=[("manual", "Manual"), ("copy", "Copy"), ("reference", "Reference")],
                default="manual",
                max_length=20,
                verbose_name="來源模式",
            ),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_question_id",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="來源題庫題目 ID"),
        ),
        migrations.RunPython(backfill_contest_problem_max_score, migrations.RunPython.noop),
    ]
