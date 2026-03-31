import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("submissions", "0015_remove_submission_sub_lab_created_idx"),
        ("question_bank", "0012_contestquestionbinding_coding_problem_and_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="submission",
            name="contest_question_binding",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="submissions",
                to="question_bank.contestquestionbinding",
                verbose_name="競賽題目綁定",
            ),
        ),
    ]
