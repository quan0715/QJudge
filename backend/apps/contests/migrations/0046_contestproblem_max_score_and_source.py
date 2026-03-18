from django.db import migrations, models
from django.db.models import Sum


def backfill_contest_problem_max_score(apps, schema_editor):
    ContestProblem = apps.get_model("contests", "ContestProblem")
    for cp in ContestProblem.objects.select_related("problem").all():
        score_sum = (
            cp.problem.test_cases.aggregate(total=Sum("score")).get("total")
            or 0
        )
        cp.max_score = max(1, int(score_sum or 100))
        cp.save(update_fields=["max_score"])


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0045_add_screen_share_interrupted_event_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="contestproblem",
            name="max_score",
            field=models.PositiveIntegerField(default=100, verbose_name="題目配分"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_bank_id",
            field=models.UUIDField(blank=True, null=True, verbose_name="來源題庫 UUID"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_bank_name",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="來源題庫名稱"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_mode",
            field=models.CharField(
                choices=[("manual", "Manual"), ("copy", "Copy"), ("reference", "Reference")],
                default="manual",
                max_length=20,
                verbose_name="來源模式",
            ),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="source_question_id",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="來源題庫題目 ID"),
        ),
        migrations.RunPython(backfill_contest_problem_max_score, migrations.RunPython.noop),
    ]
