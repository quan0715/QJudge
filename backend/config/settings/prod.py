"""
Production settings
"""
import os
from .base import *

DEBUG = os.getenv('DEBUG', 'False') == 'True'

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

# =============================================================================
# Production Database Configuration
# =============================================================================
# In production, we use Cloud (Supabase) as the primary database.
# Local database can be used as backup target.

# Override default database to use cloud
DATABASES['default'] = {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': os.getenv('CLOUD_DB_NAME', 'postgres'),
    'USER': os.getenv('CLOUD_DB_USER', ''),
    'PASSWORD': os.getenv('CLOUD_DB_PASSWORD', ''),
    'HOST': os.getenv('CLOUD_DB_HOST', ''),
    'PORT': os.getenv('CLOUD_DB_PORT', '5432'),
    'CONN_MAX_AGE': 60,  # Connection pooling
    'OPTIONS': {
        'connect_timeout': 10,
    },
}

# Keep local database as backup target (optional)
if os.getenv('BACKUP_DB_HOST'):
    DATABASES['backup'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('BACKUP_DB_NAME', 'online_judge'),
        'USER': os.getenv('BACKUP_DB_USER', 'postgres'),
        'PASSWORD': os.getenv('BACKUP_DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('BACKUP_DB_HOST', 'postgres'),
        'PORT': os.getenv('BACKUP_DB_PORT', '5432'),
    }

# Disable database router in production (always use default)
DATABASE_ROUTERS = []

# Security settings
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# HSTS settings
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Email backend for production
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(BASE_DIR, 'logs', 'django.log'),
            'maxBytes': 1024 * 1024 * 15,  # 15MB
            'backupCount': 10,
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['file'],
        'level': 'WARNING',
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# CORS settings
# CORS settings
CORS_ALLOWED_ORIGINS = [origin.strip('/') for origin in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if origin]
if os.getenv('FRONTEND_URL'):
    CORS_ALLOWED_ORIGINS.append(os.getenv('FRONTEND_URL').strip('/'))

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = [origin.strip('/') for origin in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if origin]
if os.getenv('FRONTEND_URL'):
    CSRF_TRUSTED_ORIGINS.append(os.getenv('FRONTEND_URL').strip('/'))


