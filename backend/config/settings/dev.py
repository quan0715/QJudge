"""
Development settings
"""
from .base import *

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Development-specific apps
INSTALLED_APPS += [
    'django_extensions',
]

# Enable browsable API in development
REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = [
    'rest_framework.renderers.JSONRenderer',
    'rest_framework.renderers.BrowsableAPIRenderer',
]

# Keep cookie-based JWT auth in development.
# The frontend uses HttpOnly cookies and does not attach Authorization header.
# Removing CookieJWTAuthentication causes every authenticated API call to return 401.
REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'] = [
    'apps.oauth.authentication.ResourceTokenAuthentication',
    'oauth2_provider.contrib.rest_framework.OAuth2Authentication',  # MCP OAuth
    'apps.users.authentication.CookieJWTAuthentication',
    'rest_framework_simplejwt.authentication.JWTAuthentication',
]

# Development runs on http://localhost in many cases; secure cookies would be dropped by browser.
JWT_AUTH_COOKIE_SECURE = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Email backend for development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}
CORS_ALLOWED_ORIGINS = [FRONTEND_URL]
CSRF_TRUSTED_ORIGINS = [FRONTEND_URL]
# Dev may expose the same backend through a public tunnel while the frontend is
# still exercised directly through Vite. Keep both local Vite origins trusted
# even when FRONTEND_URL points at the tunnel hostname.
for _origin in ('http://localhost:5173', 'http://127.0.0.1:5173'):
    if _origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_origin)

# Allow all origins in dev if needed (optional, but good for local dev)
CORS_ALLOW_ALL_ORIGINS = True
