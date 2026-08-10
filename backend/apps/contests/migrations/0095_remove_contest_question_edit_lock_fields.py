from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0094_add_exam_started_question_lock_trigger"),
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
