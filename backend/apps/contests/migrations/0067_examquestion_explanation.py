from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0066_contest_counts_toward_grade"),
    ]

    operations = [
        migrations.AddField(
            model_name="examquestion",
            name="explanation",
            field=models.TextField(
                blank=True,
                default="",
                help_text="題目詳解，於成績公布後提供學生查看",
                verbose_name="詳解",
            ),
        ),
    ]
