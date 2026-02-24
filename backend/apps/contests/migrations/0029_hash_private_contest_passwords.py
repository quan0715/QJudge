from django.contrib.auth.hashers import identify_hasher, make_password
from django.db import migrations


def hash_private_passwords(apps, schema_editor):
    Contest = apps.get_model("contests", "Contest")
    queryset = Contest.objects.exclude(password__isnull=True).exclude(password="")
    for contest in queryset.iterator():
        try:
            identify_hasher(contest.password)
            continue
        except Exception:
            contest.password = make_password(contest.password)
            contest.save(update_fields=["password"])


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0028_examquestion"),
    ]

    operations = [
        migrations.RunPython(hash_private_passwords, migrations.RunPython.noop),
    ]
