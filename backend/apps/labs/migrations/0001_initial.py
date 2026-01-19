from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("problems", "0007_add_status_counts"),
    ]

    operations = [
        migrations.CreateModel(
            name="Lab",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255, verbose_name="標題")),
                ("description", models.TextField(blank=True, verbose_name="描述")),
                ("due_at", models.DateTimeField(blank=True, help_text="未設定則不限制作答期限", null=True, verbose_name="截止時間")),
                ("is_published", models.BooleanField(db_index=True, default=False, verbose_name="是否發布")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="建立時間")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="更新時間")),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="owned_labs", to=settings.AUTH_USER_MODEL, verbose_name="建立者")),
            ],
            options={
                "verbose_name": "Lab",
                "verbose_name_plural": "Labs",
                "db_table": "labs",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="LabProblem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("order", models.IntegerField(default=0, verbose_name="排序")),
                ("lab", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lab_problems", to="labs.lab")),
                ("problem", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="lab_problems", to="problems.problem")),
            ],
            options={
                "verbose_name": "Lab 題目",
                "verbose_name_plural": "Lab 題目",
                "db_table": "lab_problems",
                "ordering": ["order", "id"],
                "unique_together": {("lab", "problem")},
            },
        ),
        migrations.AddField(
            model_name="lab",
            name="problems",
            field=models.ManyToManyField(related_name="labs", through="labs.LabProblem", to="problems.problem", verbose_name="題目"),
        ),
    ]
