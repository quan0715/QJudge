from django.db import migrations


class Migration(migrations.Migration):
    # The notifications app was retired without dropping its table; its foreign key
    # to users blocks deleting any user who still has notification rows.
    operations = [
        migrations.RunSQL(
            sql="DROP TABLE IF EXISTS notifications",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
