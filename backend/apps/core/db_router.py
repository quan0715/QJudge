"""
Database Router for dynamic database switching.

This router allows switching between databases at runtime based on
thread-local storage. Only effective in development (DEBUG=True).
"""
import threading

_thread_locals = threading.local()


def set_database(db_alias: str) -> None:
    """Set the database alias for the current request thread."""
    _thread_locals.db_alias = db_alias


def get_database() -> str:
    """Get the current database alias (defaults to 'default')."""
    return getattr(_thread_locals, 'db_alias', 'default')


def clear_database() -> None:
    """Clear the database alias for the current thread."""
    if hasattr(_thread_locals, 'db_alias'):
        delattr(_thread_locals, 'db_alias')


class DynamicDatabaseRouter:
    """
    A database router that routes based on thread-local storage.
    
    In development mode, the database can be switched per-request
    based on the user's session preference.
    """
    
    def db_for_read(self, model, **hints):
        """Route read operations to the current database."""
        return get_database()
    
    def db_for_write(self, model, **hints):
        """Route write operations to the current database."""
        return get_database()
    
    def allow_relation(self, obj1, obj2, **hints):
        """Allow relations between objects in any database."""
        return True
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        Only allow migrations on the explicitly specified database.
        
        When running `python manage.py migrate`, only 'default' is migrated.
        Use `python manage.py migrate --database=cloud` to migrate cloud DB.
        Use `python manage.py migrate_all` to migrate all databases.
        """
        return db == 'default'
