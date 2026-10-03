from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("submissions", "0003_align_legacy_schema")]

    operations = [
        migrations.AddField(
            model_name="submissionresult",
            name="is_hidden",
            field=models.BooleanField(default=True, verbose_name="是否隱藏"),
        ),
        migrations.RunSQL(
            """
            UPDATE submission_results AS result
            SET is_hidden = test_case.is_hidden
            FROM test_cases AS test_case
            WHERE result.test_case_id = test_case.id
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
