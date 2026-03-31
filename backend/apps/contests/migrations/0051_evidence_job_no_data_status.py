from django.db import migrations, models


def backfill_no_data_status(apps, schema_editor):
    ExamEvidenceJob = apps.get_model("contests", "ExamEvidenceJob")
    (
        ExamEvidenceJob.objects.filter(
            status="failed",
            error_message="No raw screenshots found",
            raw_count=0,
        )
        .update(status="no_data")
    )


def rollback_no_data_status(apps, schema_editor):
    ExamEvidenceJob = apps.get_model("contests", "ExamEvidenceJob")
    (
        ExamEvidenceJob.objects.filter(
            status="no_data",
            error_message="No raw screenshots found",
            raw_count=0,
        )
        .update(status="failed")
    )


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0050_contest_pk_to_uuid"),
    ]

    operations = [
        migrations.AlterField(
            model_name="examevidencejob",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("running", "Running"),
                    ("success", "Success"),
                    ("failed", "Failed"),
                    ("no_data", "No Data"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.RunPython(backfill_no_data_status, rollback_no_data_status),
    ]
