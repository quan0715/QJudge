from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0055_merge_20260325_0000"),
    ]

    operations = [
        migrations.AddField(
            model_name="examquestion",
            name="source_bank_id",
            field=models.UUIDField(blank=True, null=True, verbose_name="來源題庫 UUID"),
        ),
        migrations.AddField(
            model_name="examquestion",
            name="source_bank_name",
            field=models.CharField(blank=True, default="", max_length=255, verbose_name="來源題庫名稱"),
        ),
        migrations.AddField(
            model_name="examquestion",
            name="source_mode",
            field=models.CharField(
                choices=[("manual", "Manual"), ("copy", "Copy"), ("reference", "Reference")],
                default="manual",
                max_length=20,
                verbose_name="來源模式",
            ),
        ),
        migrations.AddField(
            model_name="examquestion",
            name="source_question_id",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="來源題庫題目 ID"),
        ),
    ]
