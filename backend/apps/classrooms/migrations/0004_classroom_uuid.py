import uuid

from django.db import migrations, models


def _backfill_classroom_uuid(apps, schema_editor):
    Classroom = apps.get_model("classrooms", "Classroom")
    for classroom in Classroom.objects.filter(uuid__isnull=True).iterator(chunk_size=200):
        classroom.uuid = uuid.uuid4()
        classroom.save(update_fields=["uuid"])


class Migration(migrations.Migration):

    dependencies = [
        ('classrooms', '0003_classroomannouncement'),
    ]

    operations = [
        migrations.AddField(
            model_name='classroom',
            name='uuid',
            field=models.UUIDField(
                db_index=True,
                editable=False,
                null=True,
                verbose_name='UUID',
            ),
        ),
        migrations.RunPython(_backfill_classroom_uuid, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='classroom',
            name='uuid',
            field=models.UUIDField(
                db_index=True,
                default=uuid.uuid4,
                editable=False,
                unique=True,
                verbose_name='UUID',
            ),
        ),
    ]
