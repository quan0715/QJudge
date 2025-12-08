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
    'corsheaders',
    
    # Local apps
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

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'online_judge'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

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
        'rest_framework_simplejwt.authentication.JWTAuthentication',
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
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# Spectacular settings
SPECTACULAR_SETTINGS = {
    'TITLE': 'Online Judge API',
    'DESCRIPTION': 'API documentation for Online Judge Platform',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

# CORS settings
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',  # Vite default port
]

# CSRF Trusted Origins (for POST/PATCH/DELETE requests)
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
]

# Frontend URL
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

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
