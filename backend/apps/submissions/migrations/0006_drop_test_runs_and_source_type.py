from django.db import migrations, models


def delete_test_run_submissions(apps, schema_editor):
    # Test runs go through ProblemTestRunService; these rows are leftovers from
    # when test runs were stored as submissions.
    Submission = apps.get_model("submissions", "Submission")
    Submission.objects.filter(is_test=True).delete()


class Migration(migrations.Migration):
    dependencies = [("submissions", "0005_result_visibility_database_default")]

    operations = [
        migrations.RunPython(delete_test_run_submissions, migrations.RunPython.noop),
        # Run the deferred constraint checks queued by the data change, or
        # PostgreSQL refuses the ALTER TABLEs below in the same transaction.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.RemoveIndex(model_name="submission", name="sub_src_test_created_idx"),
        migrations.RemoveIndex(model_name="submission", name="sub_contest_src_created_idx"),
        migrations.RemoveField(model_name="submission", name="is_test"),
        migrations.RemoveField(model_name="submission", name="custom_test_cases"),
        migrations.RemoveField(model_name="submission", name="source_type"),
        migrations.AddIndex(
            model_name="submission",
            index=models.Index(fields=["contest", "-created_at"], name="sub_contest_created_idx"),
        ),
    ]
