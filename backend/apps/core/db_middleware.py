"""
Middleware for database switching based on session.

This middleware reads the user's database preference from their session
and sets it in thread-local storage for the database router.
"""
from django.conf import settings
from apps.core.db_router import set_database, clear_database


class DatabaseSwitchMiddleware:
    """
    Middleware to switch database based on session preference.
    
    Allows admin users to dynamically switch between configured databases.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        db_alias = request.session.get('db_alias', 'default')
        # Validate the alias exists
        if db_alias in settings.DATABASES:
            set_database(db_alias)
        else:
            set_database('default')
        
        response = self.get_response(request)
        
        # Clean up thread-local storage
        clear_database()
        
        return response
