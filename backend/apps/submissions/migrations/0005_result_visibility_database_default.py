from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("submissions", "0004_preserve_result_visibility")]

    operations = [
        # Django 4.2's field default only applies to new-code ORM inserts.
        # Keep old workers/code-only rollbacks able to omit this column;
        # unknown historical visibility must default to hidden, never public.
        migrations.RunSQL(
            "ALTER TABLE submission_results ALTER COLUMN is_hidden SET DEFAULT TRUE",
            reverse_sql="ALTER TABLE submission_results ALTER COLUMN is_hidden DROP DEFAULT",
        ),
    ]
