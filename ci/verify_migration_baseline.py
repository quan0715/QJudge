"""Verify an already-migrated CI database upgrades without application writes.

Run after migrating the previous release into the disposable CI database.
The normal pytest database is subsequently built from the new baseline.
"""
import json
from uuid import uuid4

import django

django.setup()

from django.core.management import call_command
from django.apps import apps
from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor


def schema_snapshot(database=connection):
    with database.cursor() as cursor:
        cursor.execute("""
            SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                   a.attnotnull, a.attidentity, pg_get_expr(d.adbin, d.adrelid)
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
            LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY c.relname, a.attname
        """)
        columns = cursor.fetchall()
        cursor.execute("""
            SELECT c.relname, con.conname, con.contype,
                   pg_get_constraintdef(con.oid), con.convalidated
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            ORDER BY c.relname, con.conname
        """)
        constraints = cursor.fetchall()
        cursor.execute("""
            SELECT tablename, indexname, indexdef FROM pg_indexes
            WHERE schemaname = 'public' ORDER BY tablename, indexname
        """)
        indexes = cursor.fetchall()
    return json.loads(json.dumps(dict(columns=columns, constraints=constraints, indexes=indexes)))


def verify_upgrade():
    from apps.users.models import User

    user = User.objects.create_user(username='baseline-upgrade-probe', password='ci-only')
    before_user = User.objects.filter(pk=user.pk).values().get()
    before_schema = schema_snapshot()
    executor = MigrationExecutor(connection)
    executor.loader.check_consistent_history(connection)
    targets = [key for key in executor.loader.disk_migrations if key[1].endswith('_current_baseline')]
    targets += [key for key in executor.loader.graph.leaf_nodes()
                if not apps.get_app_config(key[0]).name.startswith('apps.')]
    assert executor.migration_plan(targets) == []

    def guard(execute, sql, params, many, context):
        operation = sql.lstrip().split(None, 1)[0].upper()
        if operation not in {'SELECT', 'SHOW', 'BEGIN', 'COMMIT', 'SAVEPOINT', 'RELEASE'}:
            assert operation == 'INSERT' and '"django_migrations"' in sql, sql
        return execute(sql, params, many, context)

    with connection.execute_wrapper(guard):
        executor.migrate(targets)
    assert schema_snapshot() == before_schema
    assert User.objects.filter(pk=user.pk).values().get() == before_user
    print('Existing database: empty plan, no application writes, schema and user unchanged.')

    # Compare only the frozen baseline, not future migrations added after it.
    # Both databases are disposable CI databases; never run this on a deployment.
    fresh_name = 'baseline_' + uuid4().hex
    quoted_name = connection.ops.quote_name(fresh_name)
    with connection.cursor() as cursor:
        cursor.execute(f'CREATE DATABASE {quoted_name}')
    connections.databases['baseline_fresh'] = {**connection.settings_dict, 'NAME': fresh_name}
    fresh = connections['baseline_fresh']
    try:
        MigrationExecutor(fresh).migrate(targets)
        assert schema_snapshot(fresh) == before_schema
        print('Fresh baseline: columns, defaults, constraints and indexes match the previous release.')
    finally:
        fresh.close()
        with connection.cursor() as cursor:
            cursor.execute(f'DROP DATABASE {quoted_name}')
    # Ordinary subsequent migrations remain supported and run outside the guard.
    call_command('migrate', interactive=False, verbosity=1)


if __name__ == '__main__':
    verify_upgrade()
