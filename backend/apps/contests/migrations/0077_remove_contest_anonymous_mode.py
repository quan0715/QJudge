from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0076_unique_exam_question_order"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="anonymous_mode_enabled",
        ),
        migrations.RemoveField(
            model_name="contestparticipant",
            name="nickname",
        ),
    ]
