from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('contests', '0014_contest_expand_question_numbers')]

    operations = [
        migrations.AlterField(
            model_name='examquestion',
            name='prompt',
            field=models.TextField(blank=True, default='', verbose_name='題目內容'),
        ),
    ]
