# Generated migration for visibility field refactoring
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('problems', '0010_add_discussion_and_comment_likes'),
    ]

    operations = [
        migrations.AddField(
            model_name='problem',
            name='visibility',
            field=models.CharField(
                max_length=10,
                choices=[
                    ('public', '公開'),
                    ('private', '私有'),
                    ('hidden', '隱藏'),
                ],
                default='private',
                db_index=True,
                verbose_name='可見性',
                help_text='控制題目的可見範圍'
            ),
        ),
    ]
