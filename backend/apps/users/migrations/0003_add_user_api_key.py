# Generated manually for API Key management feature
# Date: 2025-01-26

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_add_user_preferences'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserAPIKey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('encrypted_key', models.BinaryField(verbose_name='加密的 API Key')),
                ('key_name', models.CharField(default='My API Key', max_length=100, verbose_name='API Key 名稱')),
                ('is_active', models.BooleanField(default=True, verbose_name='是否啟用')),
                ('is_validated', models.BooleanField(default=False, verbose_name='是否已驗證')),
                ('last_validated_at', models.DateTimeField(blank=True, null=True, verbose_name='最後驗證時間')),
                ('total_input_tokens', models.BigIntegerField(default=0, verbose_name='總輸入 Token 數')),
                ('total_output_tokens', models.BigIntegerField(default=0, verbose_name='總輸出 Token 數')),
                ('total_requests', models.IntegerField(default=0, verbose_name='總請求次數')),
                ('total_cost_cents', models.BigIntegerField(default=0, help_text='以美分表示，避免浮點精度問題', verbose_name='總費用（美分）')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='建立時間')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新時間')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='api_key', to=settings.AUTH_USER_MODEL, verbose_name='使用者')),
            ],
            options={
                'verbose_name': '使用者 API Key',
                'verbose_name_plural': '使用者 API Keys',
                'db_table': 'user_api_keys',
            },
        ),
        migrations.AddIndex(
            model_name='userapikey',
            index=models.Index(fields=['user'], name='user_api_keys_user_idx'),
        ),
        migrations.AddIndex(
            model_name='userapikey',
            index=models.Index(fields=['is_active'], name='user_api_keys_is_active_idx'),
        ),
    ]
