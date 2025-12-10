"""
Management command to run migrations on all configured databases.

Usage:
    python manage.py migrate_all
    python manage.py migrate_all --apps users,problems
"""
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.conf import settings
from django.db import connections


class Command(BaseCommand):
    help = 'Run migrations on all configured databases'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'app_label',
            nargs='?',
            help='App label to migrate (optional)',
        )
        parser.add_argument(
            'migration_name',
            nargs='?',
            help='Migration name to target (optional)',
        )
        parser.add_argument(
            '--databases',
            dest='databases',
            default=None,
            help='Comma-separated list of databases to migrate (default: all)',
        )
        parser.add_argument(
            '--fake',
            action='store_true',
            dest='fake',
            help='Mark migrations as run without actually running them',
        )
        parser.add_argument(
            '--fake-initial',
            action='store_true',
            dest='fake_initial',
            help='Detect if tables already exist and fake-apply initial migrations',
        )
        parser.add_argument(
            '--plan',
            action='store_true',
            dest='plan',
            help='Shows a list of the migration actions that will be performed',
        )
    
    def handle(self, *args, **options):
        app_label = options.get('app_label')
        migration_name = options.get('migration_name')
        databases_str = options.get('databases')
        fake = options.get('fake', False)
        fake_initial = options.get('fake_initial', False)
        plan = options.get('plan', False)
        
        # Get list of databases to migrate
        if databases_str:
            databases = [db.strip() for db in databases_str.split(',')]
            # Validate
            for db in databases:
                if db not in settings.DATABASES:
                    self.stderr.write(self.style.ERROR(f'Unknown database: {db}'))
                    return
        else:
            databases = list(settings.DATABASES.keys())
        
        self.stdout.write(f'Will migrate {len(databases)} database(s): {", ".join(databases)}\n')
        
        success_count = 0
        error_count = 0
        
        for db_alias in databases:
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'\n{"="*60}\nMigrating database: {db_alias}\n{"="*60}'
            ))
            
            # Test connection
            try:
                conn = connections[db_alias]
                conn.ensure_connection()
            except Exception as e:
                self.stderr.write(self.style.ERROR(
                    f'Cannot connect to {db_alias}: {e}'
                ))
                error_count += 1
                continue
            
            # Build migrate arguments
            migrate_args = []
            if app_label:
                migrate_args.append(app_label)
            if migration_name:
                migrate_args.append(migration_name)
            
            migrate_kwargs = {
                'database': db_alias,
                'verbosity': options.get('verbosity', 1),
            }
            if fake:
                migrate_kwargs['fake'] = True
            if fake_initial:
                migrate_kwargs['fake_initial'] = True
            if plan:
                migrate_kwargs['plan'] = True
            
            try:
                call_command('migrate', *migrate_args, **migrate_kwargs)
                self.stdout.write(self.style.SUCCESS(
                    f'\n✓ Successfully migrated {db_alias}'
                ))
                success_count += 1
            except Exception as e:
                self.stderr.write(self.style.ERROR(
                    f'\n✗ Migration failed for {db_alias}: {e}'
                ))
                error_count += 1
        
        # Summary
        self.stdout.write(self.style.MIGRATE_HEADING(f'\n{"="*60}\nSummary\n{"="*60}'))
        self.stdout.write(f'Total databases: {len(databases)}')
        self.stdout.write(self.style.SUCCESS(f'Successful: {success_count}'))
        if error_count:
            self.stdout.write(self.style.ERROR(f'Failed: {error_count}'))
