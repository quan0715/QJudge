from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0095_remove_contest_question_edit_lock_fields"),
        ("classrooms", "0002_enforce_single_contest_binding"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="visibility",
        ),
    ]
