from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0093_remove_examanswer_question_snapshot"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="question_edit_lock_trigger",
        ),
        migrations.RemoveField(
            model_name="contest",
            name="question_edit_locked_at",
        ),
        migrations.RemoveField(
            model_name="contest",
            name="question_edit_locked",
        ),
    ]
