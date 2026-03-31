from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0011_question_asset_domain"),
        ("problems", "0015_problem_pk_uuid_cutover"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="question_asset",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="legacy_problem_adapters", to="question_bank.questionasset", verbose_name="對應題目資產"),
        ),
        migrations.AddField(
            model_name="problem",
            name="question_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="legacy_problem_adapters", to="question_bank.questionversion", verbose_name="對應題目版本"),
        ),
    ]
