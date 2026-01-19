from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('problems', '0008_problem_origin_problem'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProblemDiscussion',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255, verbose_name='標題')),
                ('content', models.TextField(verbose_name='內容')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='是否已刪除')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='建立時間')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新時間')),
                ('problem', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='discussions', to='problems.problem', verbose_name='題目')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='problem_discussions', to=settings.AUTH_USER_MODEL, verbose_name='使用者')),
            ],
            options={
                'verbose_name': '題目討論',
                'verbose_name_plural': '題目討論',
                'db_table': 'problem_discussions',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ProblemDiscussionComment',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField(verbose_name='內容')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='是否已刪除')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='建立時間')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新時間')),
                ('discussion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='problems.problemdiscussion', verbose_name='討論')),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='replies', to='problems.problemdiscussioncomment', verbose_name='上層留言')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='problem_discussion_comments', to=settings.AUTH_USER_MODEL, verbose_name='使用者')),
            ],
            options={
                'verbose_name': '題目討論留言',
                'verbose_name_plural': '題目討論留言',
                'db_table': 'problem_discussion_comments',
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='problemdiscussion',
            index=models.Index(fields=['problem', '-created_at'], name='problem_discussions_problem_created_idx'),
        ),
        migrations.AddIndex(
            model_name='problemdiscussion',
            index=models.Index(fields=['user', '-created_at'], name='problem_discussions_user_created_idx'),
        ),
        migrations.AddIndex(
            model_name='problemdiscussioncomment',
            index=models.Index(fields=['discussion', '-created_at'], name='problem_discussion_comments_discussion_created_idx'),
        ),
    ]
