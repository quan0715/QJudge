from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0083_open_answer_document"),
    ]

    operations = [
        migrations.AddField(
            model_name="examquestion",
            name="score_policy",
            field=models.CharField(
                choices=[
                    ("normal", "正常計分"),
                    ("excluded", "不計分"),
                    ("full_marks", "送分"),
                ],
                default="normal",
                help_text="normal=正常計分, excluded=不計分, full_marks=送分",
                max_length=16,
                verbose_name="計分策略",
            ),
        ),
    ]
