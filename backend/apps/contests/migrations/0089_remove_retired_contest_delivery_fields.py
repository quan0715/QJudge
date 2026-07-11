from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0088_align_event_activity_choices"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="counts_toward_grade",
        ),
        migrations.RemoveField(
            model_name="contest",
            name="delivery_mode",
        ),
        migrations.RemoveField(
            model_name="contest",
            name="max_cheat_warnings",
        ),
        migrations.RemoveField(
            model_name="contestparticipant",
            name="accepted_at",
        ),
        migrations.RemoveField(
            model_name="contestparticipant",
            name="assignment_state",
        ),
        migrations.RemoveField(
            model_name="contestparticipant",
            name="submitted_at",
        ),
    ]
