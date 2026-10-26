from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('contests', '0013_exam_grading_unit')]

    operations = [
        migrations.AddField(
            model_name='contest',
            name='expand_question_numbers',
            field=models.BooleanField(default=False, verbose_name='展開題號'),
        ),
    ]
