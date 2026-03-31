from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contests', '0061_remove_legacy_int_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='contest',
            name='screen_share_recovery_grace_ms',
            field=models.PositiveIntegerField(
                default=30000,
                help_text='螢幕共享中斷後，允許學生重新分享的寬限時間',
                verbose_name='螢幕共享恢復寬限時間 (毫秒)',
            ),
        ),
    ]
