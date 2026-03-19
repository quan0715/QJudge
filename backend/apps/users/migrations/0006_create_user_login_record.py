"""Create UserLoginRecord model."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0005_add_display_name_to_profile"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserLoginRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("device_id", models.CharField(blank=True, default="", max_length=128)),
                ("ip_address", models.GenericIPAddressField()),
                ("user_agent", models.CharField(blank=True, default="", max_length=512)),
                ("login_method", models.CharField(max_length=32)),
                ("jti", models.CharField(blank=True, default="", max_length=256)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("is_current", models.BooleanField(default=False)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="login_records",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "user_login_records",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["user", "-created_at"], name="user_login_r_user_id_created_idx"),
                ],
            },
        ),
    ]
