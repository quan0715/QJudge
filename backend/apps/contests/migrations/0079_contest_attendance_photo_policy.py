from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0078_attendance_qr"),
    ]

    operations = [
        migrations.AddField(
            model_name="contest",
            name="attendance_photo_policy",
            field=models.CharField(
                choices=[
                    ("room", "Room photo"),
                    ("room_and_selfie", "Room and selfie photos"),
                ],
                default="room",
                help_text="room: 後鏡頭拍攝現場; room_and_selfie: 後鏡頭現場與前鏡頭本人各一張",
                max_length=24,
                verbose_name="簽到佐證照片策略",
            ),
        ),
    ]
