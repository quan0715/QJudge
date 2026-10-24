from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('contests', '0011_batch_grade_write_receipts'),
    ]
    operations = [
        migrations.CreateModel(
            name='ExamGradingUnit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_id', models.UUIDField(db_index=True)),
                ('run_id', models.UUIDField()),
                ('unit_id', models.CharField(max_length=255)),
                ('snapshot', models.JSONField(default=dict)),
                ('rubric', models.JSONField(blank=True, null=True)),
                ('drafts', models.JSONField(default=dict)),
                ('results', models.JSONField(default=dict)),
                ('progress', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('contest', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='contests.contest')),
                ('grader', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'exam_grading_units'},
        ),
        migrations.AddConstraint(
            model_name='examgradingunit',
            constraint=models.UniqueConstraint(fields=('contest', 'grader', 'session_id', 'run_id', 'unit_id'), name='uq_exam_grading_unit_attempt'),
        ),
    ]
