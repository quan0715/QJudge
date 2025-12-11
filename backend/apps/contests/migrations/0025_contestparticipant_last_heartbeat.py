# Generated migration for heartbeat field

from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Add last_heartbeat field to ContestParticipant for exam mode security monitoring.
    This field tracks the last time a participant sent a heartbeat signal during an exam.
    """

    dependencies = [
        ('contests', '0024_contest_admins'),
    ]

    operations = [
        migrations.AddField(
            model_name='contestparticipant',
            name='last_heartbeat',
            field=models.DateTimeField(
                blank=True,
                help_text='用於追蹤考試期間學生的連線狀態',
                null=True,
                verbose_name='最後心跳時間'
            ),
        ),
    ]
