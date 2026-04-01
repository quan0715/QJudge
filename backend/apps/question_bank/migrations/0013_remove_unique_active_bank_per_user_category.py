from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("question_bank", "0012_contestquestionbinding_coding_problem_and_source"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="questionbank",
            name="unique_active_bank_per_user_category",
        ),
    ]
