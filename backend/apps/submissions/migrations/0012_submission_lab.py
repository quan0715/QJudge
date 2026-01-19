from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("labs", "0001_initial"),
        ("submissions", "0011_alter_submission_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="submission",
            name="lab",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="submissions", to="labs.lab", verbose_name="題目單"),
        ),
        migrations.AddIndex(
            model_name="submission",
            index=models.Index(fields=["lab", "-created_at"], name="sub_lab_created_idx"),
        ),
    ]
