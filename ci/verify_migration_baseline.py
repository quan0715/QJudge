"""Verify an already-migrated CI database upgrades without application writes.

Run after migrating the previous release into the disposable CI database.
The normal pytest database is subsequently built from the new baseline.
"""
import json
import os
from pathlib import Path

import django

django.setup()

from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


def schema_snapshot():
    with connection.cursor() as cursor:
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
    assert executor.migration_plan(executor.loader.graph.leaf_nodes()) == []

    def guard(execute, sql, params, many, context):
        operation = sql.lstrip().split(None, 1)[0].upper()
        if operation not in {'SELECT', 'SHOW', 'BEGIN', 'COMMIT', 'SAVEPOINT', 'RELEASE'}:
            assert operation == 'INSERT' and '"django_migrations"' in sql, sql
        return execute(sql, params, many, context)

    with connection.execute_wrapper(guard):
        call_command('migrate', interactive=False, verbosity=1)
    assert schema_snapshot() == before_schema
    assert User.objects.filter(pk=user.pk).values().get() == before_user
    Path(os.environ['MIGRATION_BASELINE_SCHEMA']).write_text(json.dumps(before_schema))
    print('Existing database: empty plan, no application writes, schema and user unchanged.')


if __name__ == '__main__':
    verify_upgrade()
