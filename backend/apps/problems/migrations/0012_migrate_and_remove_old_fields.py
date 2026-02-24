# Generated migration for visibility field refactoring
from django.db import migrations, models


def forward_migrate_visibility(apps, schema_editor):
    """遷移資料並設定新的 visibility 欄位"""
    Problem = apps.get_model('problems', 'Problem')

    # 1. is_practice_visible=True → public
    Problem.objects.filter(
        is_practice_visible=True
    ).update(visibility='public')

    # 2. is_visible=False → hidden
    Problem.objects.filter(
        is_visible=False
    ).update(visibility='hidden')

    # 3. 其餘保持預設 private（已由預設值處理）


def reverse_migrate_visibility(apps, schema_editor):
    """反向遷移：從 visibility 恢復舊欄位"""
    Problem = apps.get_model('problems', 'Problem')

    # public → is_practice_visible=True, is_visible=True
    Problem.objects.filter(visibility='public').update(
        is_practice_visible=True, is_visible=True
    )

    # hidden → is_visible=False, is_practice_visible=False
    Problem.objects.filter(visibility='hidden').update(
        is_visible=False, is_practice_visible=False
    )

    # private → is_visible=True, is_practice_visible=False
    Problem.objects.filter(visibility='private').update(
        is_visible=True, is_practice_visible=False
    )


class Migration(migrations.Migration):
    dependencies = [
        ('problems', '0011_add_visibility_field'),
    ]

    operations = [
        # 先遷移資料
        migrations.RunPython(forward_migrate_visibility, reverse_migrate_visibility),

        # 再移除舊欄位
        migrations.RemoveField(
            model_name='problem',
            name='is_visible',
        ),
        migrations.RemoveField(
            model_name='problem',
            name='is_practice_visible',
        ),
    ]
