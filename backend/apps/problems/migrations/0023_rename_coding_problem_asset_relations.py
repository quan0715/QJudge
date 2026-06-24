# Generated manually during question-bank legacy adapter removal.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0017_eliminate_question_bank_legacy_adapters"),
        ("problems", "0022_remove_content_fields_and_translations"),
    ]

    operations = [
        migrations.AlterField(
            model_name="codingproblem",
            name="question_asset",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="coding_problem_adapters",
                to="question_bank.questionasset",
                verbose_name="對應題目資產",
            ),
        ),
        migrations.AlterField(
            model_name="codingproblem",
            name="question_version",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="coding_problem_adapters",
                to="question_bank.questionversion",
                verbose_name="對應題目版本",
            ),
        ),
    ]
