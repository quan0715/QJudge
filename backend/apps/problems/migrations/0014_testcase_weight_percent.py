from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("problems", "0013_remove_problem_problems_is_visi_40a652_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="testcase",
            name="weight_percent",
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text="建議使用 0~100 的整數百分比；同題測資加總應為 100",
                null=True,
                verbose_name="權重百分比",
            ),
        ),
    ]
