# Data migration to set is_practice_visible for existing problems
from django.db import migrations


def migrate_practice_visibility(apps, schema_editor):
    """
    Set is_practice_visible=True for existing practice problems.
    Set is_practice_visible=False for contest problems.
    """
    Problem = apps.get_model('problems', 'Problem')
    
    # Practice problems: visible and not contest-only
    practice_problems = Problem.objects.filter(
        is_visible=True,
        is_contest_only=False
    )
    practice_count = practice_problems.update(is_practice_visible=True)
    
    # Contest problems: contest-only
    contest_problems = Problem.objects.filter(is_contest_only=True)
    contest_count = contest_problems.update(is_practice_visible=False)
    
    print(f"Migrated {practice_count} practice problems to is_practice_visible=True")
    print(f"Migrated {contest_count} contest problems to is_practice_visible=False")


def reverse_migrate(apps, schema_editor):
    """Reverse migration - set all to False."""
    Problem = apps.get_model('problems', 'Problem')
    Problem.objects.all().update(is_practice_visible=False)


class Migration(migrations.Migration):

    dependencies = [
        ('problems', '0002_problem_created_in_contest_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_practice_visibility, reverse_migrate),
    ]
