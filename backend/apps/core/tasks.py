"""
Celery tasks for core app.

Includes database backup tasks for production.
"""
import logging
from celery import shared_task
from celery.exceptions import Retry
from django.conf import settings
from django.core.management import call_command
from django.db import connections
from io import StringIO
import tempfile
import os
from datetime import datetime

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def backup_cloud_to_local(self):
    """
    Backup data from cloud database to local backup database.
    
    This task is designed for production use where:
    - Primary database is cloud (Supabase)
    - Backup database is local PostgreSQL
    
    Only runs if BACKUP_DB_HOST is configured.
    """
    # Check if backup database is configured
    if 'backup' not in settings.DATABASES:
        logger.info('Backup database not configured, skipping backup')
        return {'status': 'skipped', 'reason': 'Backup database not configured'}
    
    source = 'default'  # Cloud database in production
    target = 'backup'   # Local backup database
    
    # Apps to backup
    app_list = ['users', 'problems', 'submissions', 'contests', 'announcements', 'notifications']
    exclude_list = ['admin', 'contenttypes', 'sessions', 'auth.permission']
    
    logger.info(f'Starting backup from {source} to {target}')
    
    try:
        # Test connections
        for db in [source, target]:
            try:
                conn = connections[db]
                conn.ensure_connection()
                logger.info(f'Connected to {db}')
            except Exception as e:
                logger.error(f'Cannot connect to {db}: {e}')
                raise self.retry(exc=e, countdown=60)  # Retry in 1 minute
        
        # Dump data from source
        logger.info('Dumping data from cloud...')
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
        logger.info(f'Dumped {len(json_data)} bytes')
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write(json_data)
            temp_file = f.name
        
        try:
            # Load data to backup
            logger.info('Loading data to backup...')
            call_command(
                'loaddata',
                temp_file,
                database=target,
                verbosity=0,
            )
            logger.info(f'Successfully loaded to {target}')
        finally:
            os.unlink(temp_file)
        
        result = {
            'status': 'success',
            'source': source,
            'target': target,
            'apps': app_list,
            'bytes': len(json_data),
            'timestamp': datetime.now().isoformat(),
        }
        logger.info(f'Backup completed: {result}')
        return result
        
    except Retry:
        # Re-raise Retry exceptions (from connection failures) without modification
        raise
    except Exception as e:
        logger.error(f'Backup failed: {e}')
        raise self.retry(exc=e, countdown=300)  # Retry in 5 minutes


@shared_task
def sync_databases(source='default', target='cloud', apps=None):
    """
    Sync data between any two configured databases.
    
    This is a general-purpose sync task that can be called manually
    or scheduled as needed.
    
    Args:
        source: Source database alias
        target: Target database alias  
        apps: List of apps to sync (default: main apps)
    """
    if apps is None:
        apps = ['users', 'problems', 'submissions', 'contests', 'announcements', 'notifications']
    
    exclude_list = ['admin', 'contenttypes', 'sessions', 'auth.permission']
    
    logger.info(f'Syncing from {source} to {target}')
    
    # Validate databases
    for db in [source, target]:
        if db not in settings.DATABASES:
            raise ValueError(f'Unknown database: {db}')
    
    if source == target:
        raise ValueError('Source and target cannot be the same')
    
    try:
        # Test connections
        for db in [source, target]:
            conn = connections[db]
            conn.ensure_connection()
        
        # Dump data from source
        output = StringIO()
        dump_args = list(apps)
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
        
        # Write to temp file and load
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write(json_data)
            temp_file = f.name
        
        try:
            call_command(
                'loaddata',
                temp_file,
                database=target,
                verbosity=0,
            )
        finally:
            os.unlink(temp_file)
        
        return {
            'status': 'success',
            'source': source,
            'target': target,
            'apps': apps,
            'bytes': len(json_data),
            'timestamp': datetime.now().isoformat(),
        }
        
    except Exception as e:
        logger.error(f'Sync failed: {e}')
        raise
