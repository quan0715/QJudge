"""
API views for database management.

These endpoints are only available in development mode (DEBUG=True)
and require admin user permissions.
"""
import time
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from django.conf import settings
from django.db import connections
from django.core.management import call_command
from io import StringIO


class DatabaseStatusView(APIView):
    """
    Get current database status and switch between databases.
    
    GET: Returns current database and available databases
    POST: Switch to a different database (stores in session)
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        """Get current database status."""
        if not settings.DEBUG:
            return Response(
                {'error': 'Database switching is not available in production'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        current = request.session.get('db_alias', 'default')
        available = list(settings.DATABASES.keys())
        
        # Check connection status and measure latency for each database
        db_status = {}
        for db_name in available:
            try:
                conn = connections[db_name]
                
                # Measure connection + query latency
                start_time = time.time()
                conn.ensure_connection()
                
                # Execute a simple query to measure actual latency
                with conn.cursor() as cursor:
                    cursor.execute('SELECT 1')
                    cursor.fetchone()
                
                latency_ms = round((time.time() - start_time) * 1000, 2)
                
                db_status[db_name] = {
                    'connected': True,
                    'host': settings.DATABASES[db_name].get('HOST', 'unknown'),
                    'database': settings.DATABASES[db_name].get('NAME', 'unknown'),
                    'latency_ms': latency_ms,
                }
            except Exception as e:
                db_status[db_name] = {
                    'connected': False,
                    'host': settings.DATABASES[db_name].get('HOST', 'unknown'),
                    'error': str(e),
                }
        
        return Response({
            'current': current,
            'available': available,
            'status': db_status,
        })
    
    def post(self, request):
        """Switch to a different database."""
        if not settings.DEBUG:
            return Response(
                {'error': 'Database switching is not available in production'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        db_alias = request.data.get('database', 'default')
        
        if db_alias not in settings.DATABASES:
            return Response(
                {'error': f'Unknown database: {db_alias}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Test connection before switching
        try:
            conn = connections[db_alias]
            conn.ensure_connection()
        except Exception as e:
            return Response(
                {'error': f'Connection to {db_alias} failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Store preference in session
        request.session['db_alias'] = db_alias
        
        return Response({
            'current': db_alias,
            'message': f'Switched to {db_alias} database',
        })


class DatabaseSyncView(APIView):
    """
    Sync data between databases using Django's dumpdata/loaddata.
    
    Only available in development mode (DEBUG=True).
    """
    permission_classes = [IsAdminUser]
    
    def post(self, request):
        """Sync data from source to target database."""
        if not settings.DEBUG:
            return Response(
                {'error': 'Database sync is not available in production'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        source = request.data.get('source', 'default')
        target = request.data.get('target', 'cloud')
        apps = request.data.get('apps', None)  # None = all apps
        
        # Validate databases
        for db in [source, target]:
            if db not in settings.DATABASES:
                return Response(
                    {'error': f'Unknown database: {db}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        if source == target:
            return Response(
                {'error': 'Source and target cannot be the same'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Test connections
        for db in [source, target]:
            try:
                conn = connections[db]
                conn.ensure_connection()
            except Exception as e:
                return Response(
                    {'error': f'Connection to {db} failed: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        try:
            # Prepare app list
            if apps:
                if isinstance(apps, str):
                    app_list = [a.strip() for a in apps.split(',')]
                else:
                    app_list = apps
            else:
                # Default apps to sync (exclude admin sessions, contenttypes)
                app_list = ['users', 'problems', 'submissions', 'contests', 'announcements']
            
            # Dump data from source
            output = StringIO()
            call_command(
                'dumpdata',
                *app_list,
                database=source,
                format='json',
                indent=2,
                stdout=output,
            )
            json_data = output.getvalue()
            
            # Load data to target
            # First, we need to write to a temp file since loaddata reads from file
            import tempfile
            import os
            
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
            
            return Response({
                'message': f'Successfully synced {len(app_list)} apps from {source} to {target}',
                'apps': app_list,
                'source': source,
                'target': target,
            })
            
        except Exception as e:
            return Response(
                {'error': f'Sync failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
