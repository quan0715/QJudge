"""Add unique (contest, order) constraint to ExamQuestion."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0075_renumber_exam_question_orders"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="examquestion",
            constraint=models.UniqueConstraint(
                fields=["contest", "order"],
                name="uq_exam_question_contest_order",
                deferrable=models.Deferrable.DEFERRED,
            ),
        ),
    ]
