"""
Production settings
"""
import os
from config.env import env
from .base import *
from .database import build_database_config
from config.deployment import parse_public_origin

DEBUG = env('DEBUG', 'False') == 'True'

# =============================================================================
# GlitchTip / Sentry Error Tracking
# =============================================================================
GLITCHTIP_DSN = env("GLITCHTIP_DSN", "")

if GLITCHTIP_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.redis import RedisIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration

    sentry_sdk.init(
        dsn=GLITCHTIP_DSN,
        integrations=[
            DjangoIntegration(transaction_style="url"),
            CeleryIntegration(),
            RedisIntegration(),
            LoggingIntegration(
                level="WARNING",       # WARNING+ 記為 breadcrumb
                event_level="ERROR",   # ERROR+ 送為獨立 event
            ),
        ],
        traces_sample_rate=float(env("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        send_default_pii=False,
        environment=env("SENTRY_ENVIRONMENT", "production"),
    )

_PUBLIC_ORIGIN_VALUE = env("QJUDGE_PUBLIC_ORIGIN", "")
if _PUBLIC_ORIGIN_VALUE:
    _PUBLIC_ORIGIN = parse_public_origin(_PUBLIC_ORIGIN_VALUE)
    ALLOWED_HOSTS = [
        _PUBLIC_ORIGIN.hostname,
        "localhost",
        "127.0.0.1",
        "backend",
    ]
else:
    _PUBLIC_ORIGIN = None
    ALLOWED_HOSTS = [
        host for host in env("ALLOWED_HOSTS", "").split(",") if host
    ]

# =============================================================================
# Production Database Configuration
# =============================================================================
DATABASES['default'] = build_database_config(
    {
        'NAME': env('DB_NAME', 'postgres'),
        'USER': env('DB_USER', 'postgres'),
        'PASSWORD': env('DB_PASSWORD', ''),
        'HOST': env('DB_HOST', ''),
        'PORT': env('DB_PORT', '5432'),
    },
    {
        'connect_timeout': 10,
        # TCP keepalive keeps the pgBouncer→Django socket alive through NAT.
        'keepalives': 1,
        'keepalives_idle': 30,
        'keepalives_interval': 10,
        'keepalives_count': 5,
        'sslmode': env('DB_SSLMODE', 'require'),
    },
)

if SECRET_KEY == "django-insecure-default-key-change-in-production":
    raise RuntimeError("SECRET_KEY must be set in production")

# Security settings. Explicit HTTP origins support private-network and initial
# deployment verification; HTTPS and the legacy no-origin fallback stay strict.
_PUBLIC_ORIGIN_USES_HTTPS = (
    _PUBLIC_ORIGIN is None or _PUBLIC_ORIGIN.url.startswith("https://")
)
SECURE_SSL_REDIRECT = _PUBLIC_ORIGIN_USES_HTTPS
SESSION_COOKIE_SECURE = _PUBLIC_ORIGIN_USES_HTTPS
CSRF_COOKIE_SECURE = _PUBLIC_ORIGIN_USES_HTTPS
JWT_AUTH_COOKIE_SECURE = _PUBLIC_ORIGIN_USES_HTTPS
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# HSTS settings
SECURE_HSTS_SECONDS = 31536000 if _PUBLIC_ORIGIN_USES_HTTPS else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = _PUBLIC_ORIGIN_USES_HTTPS
SECURE_HSTS_PRELOAD = _PUBLIC_ORIGIN_USES_HTTPS

# Email backend for production
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = env('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(env('EMAIL_PORT', '587'))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', '')

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
        'qjudge.requests': {
            'handlers': ['file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# CORS and CSRF trust only the public origin.
CORS_ALLOWED_ORIGINS = [FRONTEND_URL]
CSRF_TRUSTED_ORIGINS = [FRONTEND_URL]
