from django.db import migrations


def delete_test_run_submissions(apps, schema_editor):
    # Test runs go through ProblemTestRunService; these rows are leftovers from
    # when test runs were stored as submissions.
    Submission = apps.get_model("submissions", "Submission")
    Submission.objects.filter(is_test=True).delete()


class Migration(migrations.Migration):
    dependencies = [("submissions", "0005_result_visibility_database_default")]

    operations = [
        migrations.RunPython(delete_test_run_submissions, migrations.RunPython.noop),
    ]
