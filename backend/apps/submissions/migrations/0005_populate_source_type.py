from django.db import migrations

def populate_source_type(apps, schema_editor):
    Submission = apps.get_model('submissions', 'Submission')
    # Update submissions with a contest to have source_type='contest'
    Submission.objects.filter(contest__isnull=False).update(source_type='contest')
    # Submissions without a contest already default to 'practice'

def reverse_populate_source_type(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('submissions', '0004_submission_source_type'),
    ]

    operations = [
        migrations.RunPython(populate_source_type, reverse_populate_source_type),
    ]
