# Generated manually for API usage tracking feature
# Date: 2025-01-26

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai', '0002_aiexecutionlog'),
    ]

    operations = [
        migrations.AddField(
            model_name='aiexecutionlog',
            name='input_tokens',
            field=models.IntegerField(default=0, help_text='本次請求使用的輸入 Token 數', verbose_name='輸入 Token 數'),
        ),
        migrations.AddField(
            model_name='aiexecutionlog',
            name='output_tokens',
            field=models.IntegerField(default=0, help_text='本次請求使用的輸出 Token 數', verbose_name='輸出 Token 數'),
        ),
        migrations.AddField(
            model_name='aiexecutionlog',
            name='cost_cents',
            field=models.IntegerField(default=0, help_text='本次請求的費用（以美分表示）', verbose_name='費用（美分）'),
        ),
        migrations.AddField(
            model_name='aiexecutionlog',
            name='model_used',
            field=models.CharField(default='haiku', help_text='使用的 Claude 模型版本', max_length=50, verbose_name='使用的模型'),
        ),
    ]
