from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0064_question_asset_links"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="contestproblem",
            name="source_mode",
            field=models.CharField(
                choices=[
                    ("manual", "Manual"),
                    ("json", "JSON"),
                    ("copy", "Copy"),
                    ("reference", "Reference"),
                ],
                default="manual",
                max_length=20,
                verbose_name="來源模式",
            ),
        ),
        migrations.AlterField(
            model_name="examquestion",
            name="source_mode",
            field=models.CharField(
                choices=[
                    ("manual", "Manual"),
                    ("json", "JSON"),
                    ("copy", "Copy"),
                    ("reference", "Reference"),
                ],
                default="manual",
                max_length=20,
                verbose_name="來源模式",
            ),
        ),
        migrations.CreateModel(
            name="ExamQuestionImportSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("import_mode", models.CharField(choices=[("append", "Append"), ("replace_all", "Replace All"), ("replace_manual_only", "Replace Manual Only")], max_length=32)),
                ("before_snapshot", models.JSONField(blank=True, default=list)),
                ("after_snapshot", models.JSONField(blank=True, default=list)),
                ("summary", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="exam_question_import_sessions", to=settings.AUTH_USER_MODEL)),
                ("contest", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exam_question_import_sessions", to="contests.contest")),
            ],
            options={
                "db_table": "exam_question_import_sessions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="examquestionimportsession",
            index=models.Index(fields=["contest", "created_at"], name="exam_qis_contest_created_idx"),
        ),
    ]
