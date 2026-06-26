from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0086_rename_exam_question_asset_relations"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contestparticipant",
            name="score",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                max_digits=10,
                verbose_name="總分",
            ),
        ),
    ]
