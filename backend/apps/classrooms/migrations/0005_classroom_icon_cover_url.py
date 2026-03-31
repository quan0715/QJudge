from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('classrooms', '0004_classroom_uuid'),
    ]

    operations = [
        migrations.AddField(
            model_name='classroom',
            name='icon',
            field=models.CharField(blank=True, default='', max_length=8, verbose_name='圖示 (emoji)'),
        ),
        migrations.AddField(
            model_name='classroom',
            name='cover_url',
            field=models.URLField(blank=True, default='', verbose_name='封面圖片 URL'),
        ),
    ]
