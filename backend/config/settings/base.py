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
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-default-key-change-in-production')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',  # Token 黑名單支援
    'corsheaders',
    'django_ratelimit',  # API 速率限制
    
    # Local apps
    'apps.core',
    'apps.users',
    'apps.problems',
    'apps.submissions',
    'apps.contests',
    'apps.notifications',
    'apps.announcements',
    'drf_spectacular',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
# Database Configuration
# default: Local Docker PostgreSQL (development)
# cloud: Supabase Cloud PostgreSQL (production/testing)

# 雲端資料庫連接存活時間設置
# 預設為 0（Transaction Mode），避免 Session Mode 的 MaxClientsInSessionMode 錯誤
_cloud_conn_max_age_str = os.getenv('CLOUD_DB_CONN_MAX_AGE', '0')
if _cloud_conn_max_age_str.lower() == 'none':
    _cloud_conn_max_age = None  # 持久連接（僅適用於直連或低併發場景）
else:
    _cloud_conn_max_age = int(_cloud_conn_max_age_str)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'online_judge'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    },
    'cloud': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('CLOUD_DB_NAME', 'postgres'),
        'USER': os.getenv('CLOUD_DB_USER', 'postgres'),
        'PASSWORD': os.getenv('CLOUD_DB_PASSWORD', ''),
        'HOST': os.getenv('CLOUD_DB_HOST', ''),
        'PORT': os.getenv('CLOUD_DB_PORT', '5432'),
        'CONN_MAX_AGE': _cloud_conn_max_age,
        'OPTIONS': {
            'connect_timeout': 5,
            # TCP Keepalive - 保持連接活躍
            'keepalives': 1,
            'keepalives_idle': 30,
            'keepalives_interval': 10,
            'keepalives_count': 5,
            # SSL 設置
            'sslmode': os.getenv('CLOUD_DB_SSLMODE', 'require'),
        },
    }
}

# Database Router for dynamic switching (dev only)
DATABASE_ROUTERS = ['apps.core.db_router.DynamicDatabaseRouter']

# Custom User Model
AUTH_USER_MODEL = 'users.User'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'zh-hant'
TIME_ZONE = 'Asia/Taipei'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.CookieJWTAuthentication',  # Cookie-based JWT (more secure)
        'rest_framework_simplejwt.authentication.JWTAuthentication',  # Header-based JWT (fallback for API clients)
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# Simple JWT settings
# Extended token lifetime for exam scenarios (students shouldn't be logged out during exams)
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),  # Extended for exam sessions
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),  # Extended for long-term sessions
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# JWT Cookie settings (HttpOnly for security)
JWT_AUTH_COOKIE = 'access_token'
JWT_AUTH_REFRESH_COOKIE = 'refresh_token'
# Secure flag is set based on environment (overridden in dev.py/prod.py if needed)
JWT_AUTH_COOKIE_SECURE = os.getenv('DJANGO_ENV', 'production') == 'production'
JWT_AUTH_COOKIE_HTTP_ONLY = True  # Prevent XSS attacks
JWT_AUTH_COOKIE_SAMESITE = 'Lax'  # CSRF protection
JWT_AUTH_COOKIE_PATH = '/'
JWT_AUTH_COOKIE_DOMAIN = None  # Use default domain

# Spectacular settings
SPECTACULAR_SETTINGS = {
    'TITLE': 'Online Judge API',
    'DESCRIPTION': 'API documentation for Online Judge Platform',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

# CORS settings (important for HttpOnly cookie authentication)
CORS_ALLOW_CREDENTIALS = True  # Required for cookies to be sent/received
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',  # Vite default port
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# CSRF Trusted Origins (for POST/PATCH/DELETE requests)
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
]

# Session cookie settings
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = os.getenv('DJANGO_ENV', 'production') == 'production'

# CSRF cookie settings
# CSRF_COOKIE_HTTPONLY = False allows frontend to read the token via JavaScript
# and include it in the X-CSRFToken header for cookie-authenticated requests
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = os.getenv('DJANGO_ENV', 'production') == 'production'
CSRF_COOKIE_HTTPONLY = False  # Frontend needs to read this for X-CSRFToken header
CSRF_COOKIE_NAME = 'csrftoken'
CSRF_HEADER_NAME = 'HTTP_X_CSRFTOKEN'

# Frontend URL
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

# Redis Cache settings
# Using Django's built-in Redis backend (Django 4.0+)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/1'),
        'KEY_PREFIX': 'qjudge',
        'TIMEOUT': 300,  # 5 minutes default
    }
}

# Cache keys constants
CACHE_KEYS = {
    'POPULAR_PROBLEMS': 'popular_problems',
    'CONTEST_STANDINGS': 'contest_standings_{contest_id}',
    'USER_STATS': 'user_stats_{user_id}',
}

# Celery settings
CELERY_BROKER_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Celery Beat Schedule (for periodic tasks)
# Only effective when celery-beat service is running
CELERY_BEAT_SCHEDULE = {
    'check-contest-end-every-minute': {
        'task': 'apps.contests.tasks.check_contest_end',
        'schedule': 60.0,  # Every 60 seconds
    },
    'check-auto-unlock-every-30-seconds': {
        'task': 'apps.contests.tasks.check_auto_unlock',
        'schedule': 30.0,  # Every 30 seconds
    },
    'check-heartbeat-timeout-every-30-seconds': {
        'task': 'apps.contests.tasks.check_heartbeat_timeout',
        'schedule': 30.0,  # Every 30 seconds
    },
    # Database backup task (production only)
    # Runs every 6 hours to backup cloud data to local
    'backup-cloud-to-local': {
        'task': 'apps.core.tasks.backup_cloud_to_local',
        'schedule': 60 * 60 * 6,  # Every 6 hours
    },
}

# NYCU OAuth settings
NYCU_OAUTH_CLIENT_ID = os.getenv('NYCU_OAUTH_CLIENT_ID', '')
NYCU_OAUTH_CLIENT_SECRET = os.getenv('NYCU_OAUTH_CLIENT_SECRET', '')
NYCU_OAUTH_AUTHORIZE_URL = 'https://id.nycu.edu.tw/o/authorize/'
NYCU_OAUTH_TOKEN_URL = 'https://id.nycu.edu.tw/o/token/'
NYCU_OAUTH_USERINFO_URL = 'https://id.nycu.edu.tw/api/profile/'

# Judge Engine settings
JUDGE_ENGINE_ENABLED = os.getenv('JUDGE_ENGINE_ENABLED', 'True') == 'True'
JUDGE_MAX_CPU_TIME = int(os.getenv('JUDGE_MAX_CPU_TIME', '10'))  # seconds
JUDGE_MAX_MEMORY = int(os.getenv('JUDGE_MAX_MEMORY', '256'))  # MB

# Docker settings for judge system
DOCKER_HOST = os.getenv('DOCKER_HOST', None)  # None = use default socket
DOCKER_IMAGE_JUDGE = os.getenv('DOCKER_IMAGE_JUDGE', 'oj-judge:latest')
DOCKER_JUDGE_PIDS_LIMIT = int(os.getenv('DOCKER_JUDGE_PIDS_LIMIT', '64'))
DOCKER_JUDGE_TMPFS_SIZE = os.getenv('DOCKER_JUDGE_TMPFS_SIZE', '100M')
DOCKER_JUDGE_TIMEOUT = int(os.getenv('DOCKER_JUDGE_TIMEOUT', '60'))  # seconds

# Seccomp profile path (set to None to disable)
# 優先使用 HOST_PROJECT_ROOT (解決 Docker Socket Binding 路徑問題)
HOST_PROJECT_ROOT = os.getenv('HOST_PROJECT_ROOT')
if HOST_PROJECT_ROOT:
    DOCKER_SECCOMP_PROFILE = os.path.join(HOST_PROJECT_ROOT, 'backend/judge/seccomp_profiles/cpp.json')
else:
    DOCKER_SECCOMP_PROFILE = os.path.join(BASE_DIR, 'judge/seccomp_profiles/cpp.json')

# 如果環境變數明確停用，則設為 None
if os.getenv('DOCKER_SECCOMP_PROFILE') == '':
    DOCKER_SECCOMP_PROFILE = None
