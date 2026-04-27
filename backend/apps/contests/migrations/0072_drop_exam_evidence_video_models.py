from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0071_alter_contestactivity_action_type"),
    ]

    operations = [
        migrations.DeleteModel(name="ExamEvidenceJob"),
        migrations.DeleteModel(name="ExamEvidenceVideo"),
    ]
