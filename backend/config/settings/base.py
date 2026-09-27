"""
Django settings for OJ Platform backend.
Base settings shared across all environments.
"""

import os
from config.env import env
from pathlib import Path
from datetime import timedelta

from .database import build_database_config

from config.deployment import parse_public_origin


def _env_truthy(name: str, default: str = "false") -> bool:
    return env(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _livekit_server_url(public_url: str) -> str:
    """LiveKit serves its API on the signaling host; map ws(s) to http(s)."""
    if public_url.startswith("wss://"):
        return "https://" + public_url[len("wss://"):]
    if public_url.startswith("ws://"):
        return "http://" + public_url[len("ws://"):]
    return public_url

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env("SECRET_KEY", "django-insecure-default-key-change-in-production")

# Application definition
INSTALLED_APPS = [
    "daphne",  # ASGI server, must be first for runserver to use ASGI
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party apps
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",  # Token 黑名單支援
    "oauth2_provider",  # OAuth 2.1 Authorization Server
    "corsheaders",
    "django_ratelimit",  # API 速率限制
    "channels",  # WebSocket support
    # Local apps
    "apps.core",
    "apps.users",
    "apps.problems",
    "apps.submissions",
    "apps.contests",
    "apps.classrooms",
    "apps.ai",  # AI Chat
    "apps.question_bank",
    "apps.oauth",
    "drf_spectacular",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # Serve static files in production
    "apps.core.middleware.RequestIDMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Database Configuration
# With pgBouncer (session mode), release connections after each request.
DATABASES = {"default": build_database_config({"connect_timeout": 10})}

# Custom User Model
AUTH_USER_MODEL = "users.User"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {
            "min_length": 8,
        },
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
LANGUAGE_CODE = "zh-Hant"
TIME_ZONE = "Asia/Taipei"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = "/static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

# WhiteNoise configuration for serving static files in production
# This enables compression and caching for better performance
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Media files
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# Default primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# REST Framework settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.oauth.authentication.ResourceTokenAuthentication",
        "oauth2_provider.contrib.rest_framework.OAuth2Authentication",  # Existing opaque MCP OAuth tokens
        "apps.users.authentication.CookieJWTAuthentication",  # Cookie-based JWT (more secure)
        "rest_framework_simplejwt.authentication.JWTAuthentication",  # Header-based JWT (fallback for API clients)
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": "120/min",
        "exam_events": "30/min",
        "exam_anticheat_urls": "30/min",
    },
}

# Simple JWT settings
# Extended token lifetime for exam scenarios (students shouldn't be logged out during exams)
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),  # Extended for exam sessions
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),  # Extended for long-term sessions
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# JWT Cookie settings (HttpOnly for security)
JWT_AUTH_COOKIE = "access_token"
JWT_AUTH_REFRESH_COOKIE = "refresh_token"
# Secure flag is set based on environment (overridden in dev.py/prod.py if needed)
JWT_AUTH_COOKIE_SECURE = env("DJANGO_ENV", "production") == "production"
JWT_AUTH_COOKIE_HTTP_ONLY = True  # Prevent XSS attacks
JWT_AUTH_COOKIE_SAMESITE = "Lax"  # CSRF protection
JWT_AUTH_COOKIE_PATH = "/"
JWT_AUTH_COOKIE_DOMAIN = None  # Use default domain

# OAuth 2.1 Provider settings (for MCP Server and QJudge first-party CLI)
OAUTH2_PROVIDER = {
    "SCOPES": {
        "mcp": "Access QJudge via MCP",
        "ai:chat": "Access the QJudge AI chat service",
        "qjudge.paper": "Access QJudge paper exam workflows from QJudge Paper CLI",
    },
    "DEFAULT_SCOPES": ["mcp"],
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,       # 1 hour
    "REFRESH_TOKEN_EXPIRE_SECONDS": 2592000,    # 30 days
    "ROTATE_REFRESH_TOKENS": True,
    "PKCE_REQUIRED": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https", "cursor", "vscode"],
}

_QJUDGE_PUBLIC_ORIGIN_RAW = env("QJUDGE_PUBLIC_ORIGIN", "")
_QJUDGE_PUBLIC_ORIGIN = (
    parse_public_origin(_QJUDGE_PUBLIC_ORIGIN_RAW)
    if _QJUDGE_PUBLIC_ORIGIN_RAW
    else None
)
FRONTEND_URL = (
    _QJUDGE_PUBLIC_ORIGIN.url if _QJUDGE_PUBLIC_ORIGIN else "http://localhost:5173"
)
# Backend, AI service and MCP server all use the public origin as OAuth issuer.
OAUTH_ISSUER_URL = FRONTEND_URL
AI_OAUTH_SIGNING_PRIVATE_KEY_FILE = Path(
    env(
        "AI_OAUTH_SIGNING_PRIVATE_KEY_FILE",
        BASE_DIR.parent / "secrets" / "ai-oauth-ed25519-private.pem",
    )
)
# Base URL of the MCP server; clients connect to <base>/mcp through the frontend.
MCP_PUBLIC_URL = FRONTEND_URL

# Spectacular settings
SPECTACULAR_SETTINGS = {
    "TITLE": "Online Judge API",
    "DESCRIPTION": "API documentation for Online Judge Platform",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "OAUTH2_FLOWS": {
        "authorizationCode": {
            "authorizationUrl": "/api/oauth/authorize/",
            "tokenUrl": "/api/oauth/token/",
            "scopes": {
                "mcp": "MCP server access",
                "ai:chat": "QJudge AI chat access",
                "qjudge.paper": "QJudge Paper CLI access",
            },
        }
    },
}

# CORS settings (important for HttpOnly cookie authentication)
CORS_ALLOW_CREDENTIALS = True  # Required for cookies to be sent/received
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",  # Vite default port
]
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-device-id",
]

# CSRF Trusted Origins (for POST/PATCH/DELETE requests)
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://q-judge-dev.quan.wtf",
    "https://q-judge.quan.wtf",
]

# Session cookie settings
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env("DJANGO_ENV", "production") == "production"

# CSRF cookie settings
# CSRF_COOKIE_HTTPONLY = False allows frontend to read the token via JavaScript
# and include it in the X-CSRFToken header for cookie-authenticated requests
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env("DJANGO_ENV", "production") == "production"
CSRF_COOKIE_HTTPONLY = False  # Frontend needs to read this for X-CSRFToken header
CSRF_COOKIE_NAME = "csrftoken"
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"

# Redis Cache settings
# Using Django's built-in Redis backend (Django 4.0+)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", "redis://localhost:6379/1"),
        "KEY_PREFIX": "qjudge",
        "TIMEOUT": 300,  # 5 minutes default
    }
}

# Cache keys constants
CACHE_KEYS = {
    "POPULAR_PROBLEMS": "popular_problems",
    "CONTEST_STANDINGS": "contest_standings_{contest_id}",
    "USER_STATS": "user_stats_{user_id}",
}

# Django Channels settings (WebSocket)
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [env("REDIS_URL", "redis://localhost:6379/0")],
        },
    },
}

# Email defaults (provider-agnostic; EMAIL_BACKEND set per environment)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "noreply@example.com")
EMAIL_SUBJECT_PREFIX = "[QJudge] "

# Celery settings
CELERY_BROKER_URL = env("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("REDIS_URL", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_DEFAULT_QUEUE = "default"

# Public login method settings. OAuth connections are configured through QAuth.
# The connection catalog holds endpoints and credential variable names, never the
# credentials, so it ships as a file; the JSON variable overrides it, and an
# explicit empty array there disables every OAuth provider.
AUTH_EMAIL_PASSWORD_ENABLED = env("AUTH_EMAIL_PASSWORD_ENABLED", "True").lower() in {"1", "true", "yes", "on"}
QAUTH_PROVIDER_CONNECTIONS_FILE = str(BASE_DIR / "config" / "qauth-providers.json")
QAUTH_PROVIDER_CONNECTIONS_JSON = env("QAUTH_PROVIDER_CONNECTIONS_JSON", "")

# Judge Engine settings
JUDGE_ENGINE_ENABLED = True
JUDGE_MAX_CPU_TIME = 10  # seconds
JUDGE_MAX_MEMORY = 256  # MB

# Docker settings for judge system
DOCKER_IMAGE_JUDGE = env("DOCKER_IMAGE_JUDGE", "oj-judge:latest")
DOCKER_JUDGE_PLATFORM = env("DOCKER_JUDGE_PLATFORM") or None
DOCKER_JUDGE_PIDS_LIMIT = 64
DOCKER_JUDGE_TMPFS_SIZE = "100M"
DOCKER_JUDGE_TIMEOUT = 60  # seconds

# Ad-hoc test runs are executed by the judge workers (the only processes with
# Docker access) while the HTTP request waits for the result.
JUDGE_TEST_RUN_QUEUE = "default"
JUDGE_TEST_RUN_TIMEOUT = 120  # seconds

# Seccomp profile path (set to None to disable)
# 優先使用 HOST_PROJECT_ROOT (解決 Docker Socket Binding 路徑問題)
HOST_PROJECT_ROOT = env("HOST_PROJECT_ROOT")
if HOST_PROJECT_ROOT:
    DOCKER_SECCOMP_PROFILE = os.path.join(
        HOST_PROJECT_ROOT, "backend/judge/seccomp_profiles/cpp.json"
    )
else:
    DOCKER_SECCOMP_PROFILE = os.path.join(BASE_DIR, "judge/seccomp_profiles/cpp.json")

# DOCKER_SECCOMP_DISABLED=true disables the seccomp profile.
if _env_truthy("DOCKER_SECCOMP_DISABLED"):
    DOCKER_SECCOMP_PROFILE = None

# AI Service settings
# URL for the AI Service container (LangChain DeepAgent)
AI_SERVICE_URL = "http://ai-service:8001"
AI_ACCESS_TOKEN_SECONDS = 300
AI_SERVICE_CONNECT_TIMEOUT_SECONDS = 3.0
AI_SERVICE_READ_TIMEOUT_SECONDS = 30.0
AI_SERVICE_WRITE_TIMEOUT_SECONDS = 10.0
AI_SERVICE_POOL_TIMEOUT_SECONDS = 3.0
# Exam integrity. The backend owns schedule and deadline authority; the
# resident service owns every Run's journal in one process, with no Docker
# socket and no per-exam container.
INTEGRITY_RESIDENT_URL = "http://integrity-resident:8011"
INTEGRITY_ACCEPT_GRACE_SECONDS = 300

INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE = env(
    "INTEGRITY_WORKER_SIGNING_PRIVATE_KEY_FILE",
    "/run-secrets/integrity-worker-signing-key",
)
INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE = env(
    "INTEGRITY_RESIDENT_SERVICE_TOKEN_FILE", "/run-secrets/resident-service-token"
)
INTEGRITY_WORKER_CONNECT_TIMEOUT_SECONDS = 1.0
INTEGRITY_WORKER_READ_TIMEOUT_SECONDS = 5.0

# ---------------------------------------------------------------------------
# S3-compatible object storage. Every object lives in one bucket; object keys
# already carry their own prefixes (markdown/, integrity/, ai-artifacts/,
# contest_*/, runs/).
# ---------------------------------------------------------------------------
OBJECT_STORAGE_ENDPOINT_URL = env("OBJECT_STORAGE_ENDPOINT_URL", "")
# Browser-facing endpoint used for presigned URLs.
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL = env("OBJECT_STORAGE_PUBLIC_ENDPOINT_URL", "")
OBJECT_STORAGE_REGION = "us-east-1"
OBJECT_STORAGE_ACCESS_KEY = env("OBJECT_STORAGE_ACCESS_KEY", "")
OBJECT_STORAGE_SECRET_KEY = env("OBJECT_STORAGE_SECRET_KEY", "")
OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS = 300
OBJECT_STORAGE_BUCKET = env("OBJECT_STORAGE_BUCKET", "")
INTEGRITY_ARCHIVE_CAPACITY_WARNING_BYTES = 1073741824
INTEGRITY_ARCHIVE_CAPACITY_RESERVE_BYTES = 268435456
ANTICHEAT_CAPTURE_INTERVAL_SECONDS = 3

# MEDIA_MODE selects live monitoring.
MEDIA_MODE = env("MEDIA_MODE", "disabled").lower()
LIVE_MONITORING_ENABLED = MEDIA_MODE in {"bundled", "external"}
LIVE_MONITORING_PROVIDER = "livekit" if LIVE_MONITORING_ENABLED else "disabled"
LIVEKIT_PUBLIC_URL = env("LIVEKIT_PUBLIC_URL", "").rstrip("/")
LIVEKIT_INTERNAL_URL = env(
    "LIVEKIT_INTERNAL_URL", _livekit_server_url(LIVEKIT_PUBLIC_URL)
).rstrip("/")
LIVEKIT_API_KEY = env("LIVEKIT_API_KEY", "").strip()
LIVEKIT_API_SECRET = env("LIVEKIT_API_SECRET", "").strip()
LIVEKIT_ROOM_PREFIX = env("LIVEKIT_ROOM_PREFIX", "qjudge-exam").strip()
LIVEKIT_TOKEN_TTL_SECONDS = 120

MARKDOWN_IMAGE_MAX_BYTES = 5242880
MARKDOWN_IMAGE_PUBLIC_BASE_URL = FRONTEND_URL
