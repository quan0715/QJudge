# Generated manually during question-bank legacy adapter removal.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("question_bank", "0016_remove_contest_problem_model"),
    ]

    operations = [
        migrations.DeleteModel(
            name="QuestionCodingExt",
        ),
        migrations.RemoveField(
            model_name="questionbankmembership",
            name="legacy_question",
        ),
        migrations.DeleteModel(
            name="Question",
        ),
        migrations.RenameField(
            model_name="contestquestionbinding",
            old_name="legacy_exam_question",
            new_name="exam_question",
        ),
    ]
