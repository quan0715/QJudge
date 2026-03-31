"""
Phase 3: Extend ContestQuestionBinding with coding_problem FK and source fields.

This prepares the model to fully replace ContestProblem.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0011_question_asset_domain"),
        ("problems", "0020_rename_problem_to_codingproblem"),
    ]

    operations = [
        migrations.AddField(
            model_name="contestquestionbinding",
            name="coding_problem",
            field=models.ForeignKey(
                blank=True,
                help_text="For coding-type bindings: the execution adapter that owns test cases, etc.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="contest_bindings",
                to="problems.codingproblem",
            ),
        ),
        migrations.AddField(
            model_name="contestquestionbinding",
            name="source_bank_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contestquestionbinding",
            name="source_bank_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="contestquestionbinding",
            name="source_question_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contestquestionbinding",
            name="source_mode",
            field=models.CharField(blank=True, default="manual", max_length=20),
        ),
        migrations.AddIndex(
            model_name="contestquestionbinding",
            index=models.Index(
                fields=["coding_problem"],
                name="contest_que_coding__a1b2c3_idx",
            ),
        ),
    ]
