from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("submissions", "0006_delete_test_run_submissions")]

    operations = [
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
