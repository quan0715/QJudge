from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0051_evidence_job_no_data_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="examevidencejob",
            name="recording_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="examevidencejob",
            name="recording_finished_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="examevidencevideo",
            name="recording_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="examevidencevideo",
            name="recording_finished_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

