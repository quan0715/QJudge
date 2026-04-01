from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0011_question_asset_domain"),
        ("contests", "0063_source_question_id_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="contestproblem",
            name="question_asset",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="legacy_contest_problem_links", to="question_bank.questionasset", verbose_name="對應題目資產"),
        ),
        migrations.AddField(
            model_name="contestproblem",
            name="question_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="legacy_contest_problem_links", to="question_bank.questionversion", verbose_name="對應題目版本"),
        ),
        migrations.AddField(
            model_name="examquestion",
            name="question_asset",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="legacy_exam_question_adapters", to="question_bank.questionasset", verbose_name="對應題目資產"),
        ),
        migrations.AddField(
            model_name="examquestion",
            name="question_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="legacy_exam_question_adapters", to="question_bank.questionversion", verbose_name="對應題目版本"),
        ),
    ]
