from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_add_avatar_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="onboarding_completed_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="完成 onboarding 時間",
            ),
        ),
    ]
