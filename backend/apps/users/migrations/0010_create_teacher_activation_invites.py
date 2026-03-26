from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_add_onboarding_completed_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="TeacherActivationInvite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "email",
                    models.EmailField(
                        db_index=True,
                        max_length=254,
                        validators=[django.core.validators.EmailValidator()],
                        verbose_name="邀請 Email",
                    ),
                ),
                (
                    "token_digest",
                    models.CharField(db_index=True, max_length=64, unique=True, verbose_name="Token 雜湊"),
                ),
                ("expires_at", models.DateTimeField(verbose_name="過期時間")),
                ("consumed_at", models.DateTimeField(blank=True, null=True, verbose_name="使用時間")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="建立時間")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="更新時間")),
                (
                    "consumed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="consumed_teacher_activation_invites",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="使用者",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="issued_teacher_activation_invites",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="建立者",
                    ),
                ),
                (
                    "target_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="teacher_activation_invites",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="目標使用者",
                    ),
                ),
            ],
            options={
                "verbose_name": "教師開通邀請",
                "verbose_name_plural": "教師開通邀請",
                "db_table": "teacher_activation_invites",
            },
        ),
        migrations.AddIndex(
            model_name="teacheractivationinvite",
            index=models.Index(fields=["email"], name="teacher_act_email_9fee36_idx"),
        ),
        migrations.AddIndex(
            model_name="teacheractivationinvite",
            index=models.Index(fields=["expires_at"], name="teacher_act_expires_7cad22_idx"),
        ),
    ]
