"""
Django settings for OJ Platform backend.
Base settings shared across all environments.
"""

import os
from pathlib import Path
from datetime import timedelta

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("SECRET_KEY", "django-insecure-default-key-change-in-production")

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
    "apps.announcements",
    "apps.labs",  # migration stub only; runtime lab product now uses contests
    "apps.classrooms",
    "apps.ai",  # AI Chat
    "apps.question_bank",
    "apps.subscriptions",
    "apps.notifications",
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
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "online_judge"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", "postgres"),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        # With pgBouncer (session mode) as the connection proxy, Django should
        # release connections immediately after each request (CONN_MAX_AGE=0).
        # pgBouncer returns the server connection to its pool and reuses it for
        # the next request, so there is no penalty for closing from Django's side.
        # Override via DB_CONN_MAX_AGE env var if running without pgBouncer.
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "0")),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "connect_timeout": 10,
        },
    }
}

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
        "oauth2_provider.contrib.rest_framework.OAuth2Authentication",  # MCP OAuth (first: returns None for non-OAuth tokens)
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
JWT_AUTH_COOKIE_SECURE = os.getenv("DJANGO_ENV", "production") == "production"
JWT_AUTH_COOKIE_HTTP_ONLY = True  # Prevent XSS attacks
JWT_AUTH_COOKIE_SAMESITE = "Lax"  # CSRF protection
JWT_AUTH_COOKIE_PATH = "/"
JWT_AUTH_COOKIE_DOMAIN = None  # Use default domain

# OAuth 2.1 Provider settings (for MCP Server)
OAUTH2_PROVIDER = {
    "SCOPES": {"mcp": "Access QJudge via MCP"},
    "DEFAULT_SCOPES": ["mcp"],
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,       # 1 hour
    "REFRESH_TOKEN_EXPIRE_SECONDS": 2592000,    # 30 days
    "ROTATE_REFRESH_TOKENS": True,
    "PKCE_REQUIRED": True,
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https", "cursor", "vscode"],
}

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
# OAuth issuer defaults to FRONTEND_URL (same domain in production)
OAUTH_ISSUER_URL = os.environ.get("OAUTH_ISSUER_URL", FRONTEND_URL)
# MCP server public URL (served at /mcp via streamable-http transport)
MCP_PUBLIC_URL = os.environ.get("MCP_PUBLIC_URL", "http://localhost:9000")

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
            "scopes": {"mcp": "MCP server access"},
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
SESSION_COOKIE_SECURE = os.getenv("DJANGO_ENV", "production") == "production"

# CSRF cookie settings
# CSRF_COOKIE_HTTPONLY = False allows frontend to read the token via JavaScript
# and include it in the X-CSRFToken header for cookie-authenticated requests
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = os.getenv("DJANGO_ENV", "production") == "production"
CSRF_COOKIE_HTTPONLY = False  # Frontend needs to read this for X-CSRFToken header
CSRF_COOKIE_NAME = "csrftoken"
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"

# Feature flags
# Contest ACL role source:
# - False: legacy contest-scoped owner/co_owner/participant resolution
# - True: classroom-bound contest resolves role from classroom scope first
# Default is enabled because classroom-bound contests are now authoritative.
CONTEST_ACL_CLASSROOM_SOURCE_ENABLED = (
    os.getenv("CONTEST_ACL_CLASSROOM_SOURCE_ENABLED", "true").lower() == "true"
)

# Redis Cache settings
# Using Django's built-in Redis backend (Django 4.0+)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.getenv("REDIS_URL", "redis://localhost:6379/1"),
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
            "hosts": [os.getenv("REDIS_URL", "redis://localhost:6379/0")],
        },
    },
}

# Email defaults (provider-agnostic; EMAIL_BACKEND set per environment)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@example.com")
EMAIL_SUBJECT_PREFIX = "[QJudge] "

# Celery settings
CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_DEFAULT_QUEUE = "default"

# Celery Beat Schedule (for periodic tasks)
# Only effective when celery-beat service is running
CELERY_BEAT_SCHEDULE = {
    "check-contest-end-every-minute": {
        "task": "apps.contests.tasks.check_contest_end",
        "schedule": 60.0,  # Every 60 seconds
    },
    "check-auto-unlock-every-30-seconds": {
        "task": "apps.contests.tasks.check_auto_unlock",
        "schedule": 30.0,  # Every 30 seconds
    },
    "check-force-submit-locked-every-30-seconds": {
        "task": "apps.contests.tasks.check_force_submit_locked",
        "schedule": 30.0,  # Every 30 seconds
    },
    "check-heartbeat-timeout-every-30-seconds": {
        "task": "apps.contests.tasks.check_heartbeat_timeout",
        "schedule": 30.0,
    },
    "sweep-stale-ai-runs-every-60-seconds": {
        "task": "apps.ai.tasks.sweep_stale_ai_runs",
        "schedule": 60.0,
    },
}

# NYCU OAuth settings
NYCU_OAUTH_CLIENT_ID = os.getenv("NYCU_OAUTH_CLIENT_ID", "")
NYCU_OAUTH_CLIENT_SECRET = os.getenv("NYCU_OAUTH_CLIENT_SECRET", "")
NYCU_OAUTH_AUTHORIZE_URL = "https://id.nycu.edu.tw/o/authorize/"
NYCU_OAUTH_TOKEN_URL = "https://id.nycu.edu.tw/o/token/"
NYCU_OAUTH_USERINFO_URL = "https://id.nycu.edu.tw/api/profile/"

# GitHub OAuth settings
GITHUB_OAUTH_CLIENT_ID = os.getenv("GITHUB_OAUTH_CLIENT_ID", "")
GITHUB_OAUTH_CLIENT_SECRET = os.getenv("GITHUB_OAUTH_CLIENT_SECRET", "")
GITHUB_OAUTH_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_OAUTH_USERINFO_URL = "https://api.github.com/user"
GITHUB_OAUTH_USER_EMAILS_URL = "https://api.github.com/user/emails"

# Google OAuth settings
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_OAUTH_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# Judge Engine settings
JUDGE_ENGINE_ENABLED = os.getenv("JUDGE_ENGINE_ENABLED", "True") == "True"
JUDGE_MAX_CPU_TIME = int(os.getenv("JUDGE_MAX_CPU_TIME", "10"))  # seconds
JUDGE_MAX_MEMORY = int(os.getenv("JUDGE_MAX_MEMORY", "256"))  # MB

# Docker settings for judge system
DOCKER_HOST = os.getenv("DOCKER_HOST", None)  # None = use default socket
DOCKER_IMAGE_JUDGE = os.getenv("DOCKER_IMAGE_JUDGE", "oj-judge:latest")
DOCKER_JUDGE_PIDS_LIMIT = int(os.getenv("DOCKER_JUDGE_PIDS_LIMIT", "64"))
DOCKER_JUDGE_TMPFS_SIZE = os.getenv("DOCKER_JUDGE_TMPFS_SIZE", "100M")
DOCKER_JUDGE_TIMEOUT = int(os.getenv("DOCKER_JUDGE_TIMEOUT", "60"))  # seconds

# Seccomp profile path (set to None to disable)
# 優先使用 HOST_PROJECT_ROOT (解決 Docker Socket Binding 路徑問題)
HOST_PROJECT_ROOT = os.getenv("HOST_PROJECT_ROOT")
if HOST_PROJECT_ROOT:
    DOCKER_SECCOMP_PROFILE = os.path.join(
        HOST_PROJECT_ROOT, "backend/judge/seccomp_profiles/cpp.json"
    )
else:
    DOCKER_SECCOMP_PROFILE = os.path.join(BASE_DIR, "judge/seccomp_profiles/cpp.json")

# 如果環境變數明確停用，則設為 None
if os.getenv("DOCKER_SECCOMP_PROFILE") == "":
    DOCKER_SECCOMP_PROFILE = None

# AI Service settings
# URL for the AI Service container (LangChain DeepAgent)
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai-service:8001")
AI_SERVICE_INTERNAL_TOKEN = os.getenv(
    "AI_SERVICE_INTERNAL_TOKEN",
    os.getenv("AI_INTERNAL_TOKEN", ""),  # backward-compatible fallback
)
# AI Credit 換算：1 credit = SCALE_PER_CREDIT 份「美分 × 10⁻⁶」的模型成本
# 預設 400_000 ≙ 0.4 美分/credit（Pro $20/月、~2000 credits 對應 ~$8 AI 成本、毛利 ~60%）
AI_CREDIT_SCALE_PER_CREDIT = int(os.getenv("AI_CREDIT_SCALE_PER_CREDIT", "400000"))

# ---------------------------------------------------------------------------
# S3-compatible object storage connection settings.
#
# Prefer OBJECT_STORAGE_* for new deployments. MINIO_* and ANTICHEAT_S3_* are
# retained as fallback aliases so existing .env files continue to work during
# the R2 migration.
# ---------------------------------------------------------------------------
OBJECT_STORAGE_ENDPOINT_URL = os.getenv(
    "OBJECT_STORAGE_ENDPOINT_URL",
    os.getenv(
        "MINIO_ENDPOINT_URL",
        os.getenv("ANTICHEAT_S3_ENDPOINT_URL", ""),
    ),
)
# Browser-facing endpoint used for presigned URLs. For R2 this is usually the
# same S3 API endpoint as OBJECT_STORAGE_ENDPOINT_URL.
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL = os.getenv(
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    os.getenv(
        "MINIO_PUBLIC_ENDPOINT_URL",
        os.getenv("ANTICHEAT_S3_PUBLIC_ENDPOINT_URL", ""),
    ),
)
OBJECT_STORAGE_REGION = os.getenv(
    "OBJECT_STORAGE_REGION",
    os.getenv(
        "MINIO_REGION",
        os.getenv("ANTICHEAT_S3_REGION", "us-east-1"),
    ),
)
OBJECT_STORAGE_ACCESS_KEY = os.getenv(
    "OBJECT_STORAGE_ACCESS_KEY",
    os.getenv(
        "MINIO_ACCESS_KEY",
        os.getenv(
            "ANTICHEAT_S3_ACCESS_KEY",
            os.getenv("MINIO_ROOT_USER", ""),
        ),
    ),
)
OBJECT_STORAGE_SECRET_KEY = os.getenv(
    "OBJECT_STORAGE_SECRET_KEY",
    os.getenv(
        "MINIO_SECRET_KEY",
        os.getenv(
            "ANTICHEAT_S3_SECRET_KEY",
            os.getenv("MINIO_ROOT_PASSWORD", ""),
        ),
    ),
)
OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS = int(
    os.getenv(
        "OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS",
        os.getenv("MINIO_PRESIGNED_URL_TTL_SECONDS", "300"),
    )
)
OBJECT_STORAGE_OBJECT_TAGGING_ENABLED = os.getenv(
    "OBJECT_STORAGE_OBJECT_TAGGING_ENABLED",
    "false" if ".r2.cloudflarestorage.com" in OBJECT_STORAGE_ENDPOINT_URL else "true",
).lower() == "true"
# Cloudflare R2 does not allow bucket creation via the S3 API (buckets must be
# pre-created in the dashboard or via the Cloudflare API). Disable auto-create
# automatically when the configured endpoint points at R2.
OBJECT_STORAGE_AUTO_CREATE_BUCKETS = os.getenv(
    "OBJECT_STORAGE_AUTO_CREATE_BUCKETS",
    "false" if ".r2.cloudflarestorage.com" in OBJECT_STORAGE_ENDPOINT_URL else "true",
).lower() == "true"

# Backwards-compatible aliases — existing modules read these.
MINIO_ENDPOINT_URL = OBJECT_STORAGE_ENDPOINT_URL
MINIO_PUBLIC_ENDPOINT_URL = OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
MINIO_REGION = OBJECT_STORAGE_REGION
MINIO_ACCESS_KEY = OBJECT_STORAGE_ACCESS_KEY
MINIO_SECRET_KEY = OBJECT_STORAGE_SECRET_KEY
MINIO_PRESIGNED_URL_TTL_SECONDS = OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
MINIO_OBJECT_TAGGING_ENABLED = OBJECT_STORAGE_OBJECT_TAGGING_ENABLED

ANTICHEAT_S3_ENDPOINT_URL = OBJECT_STORAGE_ENDPOINT_URL
ANTICHEAT_S3_PUBLIC_ENDPOINT_URL = OBJECT_STORAGE_PUBLIC_ENDPOINT_URL
ANTICHEAT_S3_REGION = OBJECT_STORAGE_REGION
ANTICHEAT_S3_ACCESS_KEY = OBJECT_STORAGE_ACCESS_KEY
ANTICHEAT_S3_SECRET_KEY = OBJECT_STORAGE_SECRET_KEY
ANTICHEAT_PRESIGNED_URL_TTL_SECONDS = OBJECT_STORAGE_PRESIGNED_URL_TTL_SECONDS
ANTICHEAT_S3_OBJECT_TAGGING_ENABLED = OBJECT_STORAGE_OBJECT_TAGGING_ENABLED

MARKDOWN_IMAGE_S3_ENDPOINT_URL = OBJECT_STORAGE_ENDPOINT_URL
MARKDOWN_IMAGE_S3_REGION = OBJECT_STORAGE_REGION
MARKDOWN_IMAGE_S3_ACCESS_KEY = OBJECT_STORAGE_ACCESS_KEY
MARKDOWN_IMAGE_S3_SECRET_KEY = OBJECT_STORAGE_SECRET_KEY

# Per-feature bucket / size settings
ANTICHEAT_RAW_BUCKET = os.getenv("ANTICHEAT_RAW_BUCKET", "anticheat-raw")
ANTICHEAT_VIDEO_BUCKET = os.getenv("ANTICHEAT_VIDEO_BUCKET", "anticheat-videos")
ANTICHEAT_CAPTURE_INTERVAL_SECONDS = int(
    os.getenv("ANTICHEAT_CAPTURE_INTERVAL_SECONDS", "3")
)

MARKDOWN_IMAGE_S3_BUCKET = os.getenv("MARKDOWN_IMAGE_S3_BUCKET", "markdown-images")
MARKDOWN_IMAGE_MAX_BYTES = int(os.getenv("MARKDOWN_IMAGE_MAX_BYTES", "5242880"))
MARKDOWN_IMAGE_PUBLIC_BASE_URL = os.getenv(
    "MARKDOWN_IMAGE_PUBLIC_BASE_URL",
    os.getenv("FRONTEND_URL", ""),
).strip()

AI_ARTIFACT_S3_BUCKET = os.getenv("AI_ARTIFACT_S3_BUCKET", "ai-artifacts")
AI_ARTIFACT_MAX_BYTES = int(os.getenv("AI_ARTIFACT_MAX_BYTES", "10485760"))  # 10 MB

# Recur Payment settings
RECUR_PUBLISHABLE_KEY = os.getenv("RECUR_PUBLISHABLE_KEY", "")
RECUR_SECRET_KEY = os.getenv("RECUR_SECRET_KEY", "")
RECUR_WEBHOOK_SECRET = os.getenv("RECUR_WEBHOOK_SECRET", "")
RECUR_PRODUCT_PRO_ID = os.getenv("RECUR_PRODUCT_PRO_ID", "")
RECUR_PRODUCT_TEAM_ID = os.getenv("RECUR_PRODUCT_TEAM_ID", "")
