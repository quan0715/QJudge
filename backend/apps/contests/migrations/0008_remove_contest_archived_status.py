from django.db import migrations, models
from django.utils import timezone


def migrate_archived_contests(apps, schema_editor):
    Contest = apps.get_model("contests", "Contest")
    archived = Contest.objects.using(schema_editor.connection.alias).filter(status="archived")
    # Keep valid, completed contests available for historical review. Anything
    # else stays unpublished so this migration cannot reopen an archived exam.
    archived.filter(
        start_time__isnull=False,
        start_time__lt=models.F("end_time"),
        end_time__lte=timezone.now(),
    ).update(status="published")
    archived.update(status="draft", results_published=False)


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0007_remove_contest_admins"),
    ]

    operations = [
        migrations.RunPython(migrate_archived_contests, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="contest",
            name="status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("published", "Published")],
                db_index=True,
                default="draft",
                help_text="draft: 草稿未發布；published: 已發布，依開始與結束時間決定是否可作答",
                max_length=20,
                verbose_name="狀態",
            ),
        ),
    ]
