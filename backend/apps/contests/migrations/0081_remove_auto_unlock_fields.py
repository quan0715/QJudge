from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0080_alter_contestactivity_action_type"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="allow_auto_unlock",
        ),
        migrations.RemoveField(
            model_name="contest",
            name="auto_unlock_minutes",
        ),
    ]
