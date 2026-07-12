from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("classrooms", "0007_cleanup_reserved_memberships"),
    ]

    operations = [
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS "notifications_emailnotification" CASCADE',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
