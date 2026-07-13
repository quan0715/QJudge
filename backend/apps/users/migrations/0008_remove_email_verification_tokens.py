from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0007_remove_password_recovery"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="email_verified",
        ),
        migrations.RemoveField(
            model_name="user",
            name="email_verification_expires_at",
        ),
        migrations.RemoveField(
            model_name="user",
            name="email_verification_token",
        ),
    ]
