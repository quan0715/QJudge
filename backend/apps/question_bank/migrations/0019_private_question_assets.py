from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def delete_ownerless_banks(apps, schema_editor):
    QuestionBank = apps.get_model("question_bank", "QuestionBank")
    QuestionBank.objects.filter(owner__isnull=True).delete()
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0018_retire_marketplace"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(delete_ownerless_banks, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="questionbank",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="question_banks",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RemoveIndex(
            model_name="questionasset",
            name="question_as_status_7ef55c_idx",
        ),
        migrations.RemoveField(
            model_name="questionasset",
            name="status",
        ),
        migrations.RemoveField(
            model_name="questionasset",
            name="visibility",
        ),
        migrations.RemoveField(
            model_name="questionasset",
            name="version_state",
        ),
    ]
