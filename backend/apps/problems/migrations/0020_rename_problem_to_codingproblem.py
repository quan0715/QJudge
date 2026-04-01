"""
Rename Problem model class to CodingProblem.

The database table name stays 'problems' — this is a code-level rename only.
Django needs this migration to track the model name change in its internal state.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("problems", "0019_remove_problem_visibility_index"),
    ]

    operations = [
        migrations.RenameModel(
            old_name="Problem",
            new_name="CodingProblem",
        ),
    ]
