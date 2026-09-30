from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0006_contest_webcam_required"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="contest",
            name="admins",
        ),
    ]
