from django.db import migrations, models


def forwards(apps, schema_editor):
    Contest = apps.get_model('contests', 'Contest')
    Contest.objects.filter(status='active').update(status='published')
    Contest.objects.filter(status='inactive').update(status='draft')


def backwards(apps, schema_editor):
    Contest = apps.get_model('contests', 'Contest')
    Contest.objects.filter(status='published').update(status='active')
    Contest.objects.filter(status='draft').update(status='inactive')


class Migration(migrations.Migration):
    dependencies = [
        ('contests', '0026_alter_contestactivity_action_type'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
        migrations.AlterField(
            model_name='contest',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('published', 'Published'),
                    ('archived', 'Archived'),
                ],
                default='draft',
                db_index=True,
                help_text='draft: 草稿未發布；published: 已發布可進行；archived: 已封存唯讀',
                max_length=20,
                verbose_name='狀態',
            ),
        ),
    ]
