# Generated manually for performance optimization

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('submissions', '0009_alter_submissionresult_test_case'),
    ]

    operations = [
        # Add composite indexes for common query patterns
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['source_type', 'is_test', '-created_at'],
                name='sub_src_test_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['contest', 'source_type', '-created_at'],
                name='sub_contest_src_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['problem', '-created_at'],
                name='sub_problem_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['status', '-created_at'],
                name='sub_status_created_idx'
            ),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(
                fields=['user', '-created_at'],
                name='sub_user_created_idx'
            ),
        ),
    ]
