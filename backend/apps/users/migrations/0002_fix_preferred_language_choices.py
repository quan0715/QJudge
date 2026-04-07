"""
Add choices constraint to preferred_language and fix legacy 'zh-hant' values.

Incident: 2026-04-07 — users with preferred_language='zh-hant' (from legacy
migration default) hit VALIDATION_ERROR when updating preferences, because the
serializer only accepts ['zh-TW', 'en', 'ja', 'ko'].
"""
from django.db import migrations, models


def fix_legacy_language_values(apps, schema_editor):
    UserProfile = apps.get_model("users", "UserProfile")
    updated = UserProfile.objects.filter(preferred_language="zh-hant").update(
        preferred_language="zh-TW"
    )
    if updated:
        print(f"\n  Migrated {updated} user profiles: zh-hant -> zh-TW")


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_squashed_0010_create_teacher_activation_invites"),
    ]

    operations = [
        migrations.RunPython(fix_legacy_language_values, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="userprofile",
            name="preferred_language",
            field=models.CharField(
                choices=[
                    ("zh-TW", "繁體中文"),
                    ("en", "English"),
                    ("ja", "日本語"),
                    ("ko", "한국어"),
                ],
                default="zh-TW",
                max_length=20,
                verbose_name="偏好語言",
            ),
        ),
    ]
