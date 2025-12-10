"""
Management command to sync data between databases.

Usage:
    python manage.py sync_db --from default --to cloud
    python manage.py sync_db --from cloud --to default
    python manage.py sync_db --from default --to cloud --apps users,problems
"""
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command
from django.conf import settings
from django.db import connections
from io import StringIO
import tempfile
import os


class Command(BaseCommand):
    help = 'Sync data between databases using dumpdata/loaddata'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--from',
            dest='source',
            default='default',
            help='Source database alias (default: default)',
        )
        parser.add_argument(
            '--to',
            dest='target',
            default='cloud',
            help='Target database alias (default: cloud)',
        )
        parser.add_argument(
            '--apps',
            dest='apps',
            default=None,
            help='Comma-separated list of apps to sync (default: all main apps)',
        )
        parser.add_argument(
            '--exclude-apps',
            dest='exclude_apps',
            default='admin,contenttypes,sessions,auth.permission',
            help='Comma-separated list of apps to exclude (default: admin,contenttypes,sessions,auth.permission)',
        )
    
    def handle(self, *args, **options):
        source = options['source']
        target = options['target']
        apps_str = options['apps']
        exclude_apps_str = options['exclude_apps']
        
        # Validate databases
        for db in [source, target]:
            if db not in settings.DATABASES:
                raise CommandError(f'Unknown database: {db}')
        
        if source == target:
            raise CommandError('Source and target cannot be the same')
        
        # Test connections
        self.stdout.write(f'Testing connection to {source}...')
        try:
            conn = connections[source]
            conn.ensure_connection()
            self.stdout.write(self.style.SUCCESS(f'  ✓ Connected to {source}'))
        except Exception as e:
            raise CommandError(f'Cannot connect to {source}: {e}')
        
        self.stdout.write(f'Testing connection to {target}...')
        try:
            conn = connections[target]
            conn.ensure_connection()
            self.stdout.write(self.style.SUCCESS(f'  ✓ Connected to {target}'))
        except Exception as e:
            raise CommandError(f'Cannot connect to {target}: {e}')
        
        # Prepare app list
        if apps_str:
            app_list = [a.strip() for a in apps_str.split(',')]
        else:
            # Default apps to sync
            app_list = ['users', 'problems', 'submissions', 'contests', 'announcements', 'notifications']
        
        # Prepare exclude list
        exclude_list = [e.strip() for e in exclude_apps_str.split(',') if e.strip()]
        
        self.stdout.write(f'\nSyncing from {source} to {target}...')
        self.stdout.write(f'Apps: {", ".join(app_list)}')
        if exclude_list:
            self.stdout.write(f'Excluding: {", ".join(exclude_list)}')
        
        try:
            # Dump data from source
            self.stdout.write('\nDumping data from source...')
            output = StringIO()
            
            dump_args = app_list.copy()
            for exclude in exclude_list:
                dump_args.extend(['--exclude', exclude])
            
            call_command(
                'dumpdata',
                *dump_args,
                database=source,
                format='json',
                indent=2,
                stdout=output,
            )
            json_data = output.getvalue()
            
            self.stdout.write(self.style.SUCCESS(f'  ✓ Dumped {len(json_data)} bytes'))
            
            # Write to temp file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                f.write(json_data)
                temp_file = f.name
            
            try:
                # Load data to target
                self.stdout.write('Loading data to target...')
                call_command(
                    'loaddata',
                    temp_file,
                    database=target,
                    verbosity=1,
                )
                self.stdout.write(self.style.SUCCESS(f'  ✓ Loaded to {target}'))
            finally:
                os.unlink(temp_file)
            
            self.stdout.write(self.style.SUCCESS(
                f'\n✓ Successfully synced {len(app_list)} apps from {source} to {target}'
            ))
            
        except Exception as e:
            raise CommandError(f'Sync failed: {e}')
