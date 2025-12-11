"""
Migration to add detailed status count fields and populate from existing submissions.
"""
from django.db import migrations, models


def populate_status_counts(apps, schema_editor):
    """Populate status counts from existing submissions."""
    Problem = apps.get_model('problems', 'Problem')
    Submission = apps.get_model('submissions', 'Submission')
    
    for problem in Problem.objects.all():
        submissions = Submission.objects.filter(
            problem=problem,
            is_test=False
        )
        
        # Reset and recalculate all counts
        problem.submission_count = submissions.count()
        problem.accepted_count = submissions.filter(status='AC').count()
        problem.wa_count = submissions.filter(status='WA').count()
        problem.tle_count = submissions.filter(status='TLE').count()
        problem.mle_count = submissions.filter(status='MLE').count()
        problem.re_count = submissions.filter(status='RE').count()
        problem.ce_count = submissions.filter(status='CE').count()
        problem.save()


def reverse_populate(apps, schema_editor):
    """Reverse migration - just reset the new counts to 0."""
    Problem = apps.get_model('problems', 'Problem')
    Problem.objects.all().update(
        wa_count=0,
        tle_count=0,
        mle_count=0,
        re_count=0,
        ce_count=0,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('problems', '0006_problem_forbidden_keywords_problem_required_keywords'),
        ('submissions', '0001_initial'),
    ]

    operations = [
        # Add new fields
        migrations.AddField(
            model_name='problem',
            name='wa_count',
            field=models.IntegerField(default=0, verbose_name='答案錯誤次數'),
        ),
        migrations.AddField(
            model_name='problem',
            name='tle_count',
            field=models.IntegerField(default=0, verbose_name='超時次數'),
        ),
        migrations.AddField(
            model_name='problem',
            name='mle_count',
            field=models.IntegerField(default=0, verbose_name='記憶體超限次數'),
        ),
        migrations.AddField(
            model_name='problem',
            name='re_count',
            field=models.IntegerField(default=0, verbose_name='執行錯誤次數'),
        ),
        migrations.AddField(
            model_name='problem',
            name='ce_count',
            field=models.IntegerField(default=0, verbose_name='編譯錯誤次數'),
        ),
        # Populate data from existing submissions
        migrations.RunPython(populate_status_counts, reverse_populate),
    ]
