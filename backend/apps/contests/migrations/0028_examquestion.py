from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('contests', '0027_contest_status_draft_published'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExamQuestion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('question_type', models.CharField(choices=[('true_false', '是非題'), ('single_choice', '單選題'), ('multiple_choice', '多選題'), ('essay', '問答題')], default='single_choice', max_length=30, verbose_name='題型')),
                ('prompt', models.TextField(verbose_name='題目內容')),
                ('options', models.JSONField(blank=True, default=list, help_text='選擇題選項，陣列格式', verbose_name='選項')),
                ('correct_answer', models.JSONField(blank=True, help_text='是非/選擇題可存標準答案，問答題可留空', null=True, verbose_name='標準答案')),
                ('score', models.PositiveIntegerField(default=1, verbose_name='配分')),
                ('order', models.IntegerField(default=0, verbose_name='排序')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='建立時間')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新時間')),
                ('contest', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='exam_questions', to='contests.contest', verbose_name='考試')),
            ],
            options={
                'verbose_name': '考卷題目',
                'verbose_name_plural': '考卷題目',
                'db_table': 'exam_questions',
                'ordering': ['order', 'id'],
                'indexes': [models.Index(fields=['contest', 'order'], name='exam_questio_contest_5204a7_idx')],
            },
        ),
    ]
