from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("problems", "0004_backfill_test_case_weight_percent")]

    operations = [
        migrations.AlterField(
            model_name="testcase",
            name="weight_percent",
            field=models.PositiveSmallIntegerField(
                help_text="0~100 的整數百分比；同題測資加總為 100",
                verbose_name="權重百分比",
            ),
        ),
    ]
