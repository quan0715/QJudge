from django.db import migrations


class Migration(migrations.Migration):
    """Drop the classrooms_classroom_admins table that 0004 left unmanaged."""

    dependencies = [
        ("classrooms", "0004_remove_classroom_admins"),
    ]

    operations = [
        migrations.RunSQL(
            sql="DROP TABLE IF EXISTS classrooms_classroom_admins",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
