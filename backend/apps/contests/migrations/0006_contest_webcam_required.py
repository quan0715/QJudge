from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0005_remove_participant_score_rank"),
    ]

    operations = [
        migrations.AddField(
            model_name="contest",
            name="webcam_required",
            field=models.BooleanField(
                default=False,
                help_text="嚴格考試模式下，考生除了分享螢幕，也須開啟 Webcam",
                verbose_name="要求 Webcam",
            ),
        ),
        migrations.RemoveField(
            model_name="contest",
            name="anticheat_device_policy",
        ),
    ]
