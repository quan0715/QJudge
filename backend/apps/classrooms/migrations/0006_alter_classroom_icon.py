from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('classrooms', '0005_classroom_icon_cover_url'),
    ]

    operations = [
        migrations.AlterField(
            model_name='classroom',
            name='icon',
            field=models.CharField(blank=True, default='', max_length=32, verbose_name='圖示'),
        ),
    ]
