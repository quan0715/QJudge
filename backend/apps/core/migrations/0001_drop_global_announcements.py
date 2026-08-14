from django.db import migrations


class Migration(migrations.Migration):
    dependencies = []

    operations = [
        migrations.RunSQL(
            sql="DROP TABLE IF EXISTS announcements_announcement",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
