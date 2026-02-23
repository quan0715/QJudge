# Generated migration for supporting anonymous sessions

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ai', '0003_add_usage_tracking'),
    ]

    operations = [
        # Allow AISession.user to be NULL
        migrations.AlterField(
            model_name='aisession',
            name='user',
            field=models.ForeignKey(
                blank=True,
                help_text='NULL 表示匿名對話，有值表示該用戶的持久化對話',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ai_sessions',
                to=settings.AUTH_USER_MODEL,
                verbose_name='用戶'
            ),
        ),
        # Allow AIExecutionLog.user to be NULL
        migrations.AlterField(
            model_name='aiexecutionlog',
            name='user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ai_logs',
                to=settings.AUTH_USER_MODEL,
                verbose_name='用戶'
            ),
        ),
    ]
