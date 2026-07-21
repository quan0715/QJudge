"""
Development settings
"""
import os
from .base import *

DEBUG = os.getenv('DEBUG', 'True') == 'True'

# GlitchTip / Sentry Error Tracking (optional in dev — sentry-sdk is a prod dependency)
GLITCHTIP_DSN = os.getenv("GLITCHTIP_DSN", "")
if GLITCHTIP_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration

        sentry_sdk.init(
            dsn=GLITCHTIP_DSN,
            integrations=[DjangoIntegration(transaction_style="url")],
            traces_sample_rate=0,
            send_default_pii=False,
            environment="development",
        )
    except ImportError:
        pass

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,*').split(',')

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
# CORS settings
CORS_ALLOWED_ORIGINS = [origin.strip('/') for origin in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if origin]
if os.getenv('FRONTEND_URL'):
    CORS_ALLOWED_ORIGINS.append(os.getenv('FRONTEND_URL').strip('/'))

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = [origin.strip('/') for origin in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if origin]
if os.getenv('FRONTEND_URL'):
    CSRF_TRUSTED_ORIGINS.append(os.getenv('FRONTEND_URL').strip('/'))
# Dev may expose the same backend through a public tunnel while the frontend is
# still exercised directly through Vite. Keep both local Vite origins trusted
# even when FRONTEND_URL points at the tunnel hostname.
for _origin in ('http://localhost:5173', 'http://127.0.0.1:5173'):
    if _origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_origin)
# Cloudflare Tunnel dev domains
for _host in os.getenv('ALLOWED_HOSTS', '').split(','):
    _host = _host.strip()
    if _host and _host not in ('localhost', '127.0.0.1', '0.0.0.0', '*'):
        CSRF_TRUSTED_ORIGINS.append(f'https://{_host}')

# Allow all origins in dev if needed (optional, but good for local dev)
CORS_ALLOW_ALL_ORIGINS = True
