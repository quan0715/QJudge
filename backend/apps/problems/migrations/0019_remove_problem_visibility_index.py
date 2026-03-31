from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0018_archive_and_drop_problem_visibility"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="problem",
            name="problems_visibil_5c35f4_idx",
        ),
    ]
