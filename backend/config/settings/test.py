"""
Test settings for CI/CD environments
"""
from .base import *
import os
from urllib.parse import urlparse

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

SECRET_KEY = 'test-secret-key-not-for-production'

# Test database
# 優先使用 DATABASE_URL（CI 標準格式）
DATABASE_URL = os.getenv('DATABASE_URL')

if DATABASE_URL:
    # Parse DATABASE_URL (e.g., postgresql://user:pass@host:port/dbname)
    url = urlparse(DATABASE_URL)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': url.path[1:],  # Remove leading '/'
            'USER': url.username,
            'PASSWORD': url.password,
            'HOST': url.hostname,
            'PORT': url.port or '5432',
        }
    }
else:
    # 回退到個別環境變數
    # 注意：postgres_test 是 Docker 內部服務名，本地應使用 localhost
    db_host = os.getenv('POSTGRES_HOST', os.getenv('DB_HOST', 'localhost'))
    # 如果是 Docker 服務名但不在 Docker 網路內，回退到 localhost
    if db_host in ('postgres_test', 'postgres') and not os.path.exists('/.dockerenv'):
        db_host = 'localhost'
    
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('POSTGRES_DB', os.getenv('DATABASE_NAME', 'test_oj')),
            'USER': os.getenv('POSTGRES_USER', os.getenv('DATABASE_USER', 'test_user')),
            'PASSWORD': os.getenv('POSTGRES_PASSWORD', os.getenv('DATABASE_PASSWORD', 'test_password')),
            'HOST': db_host,
            'PORT': os.getenv('POSTGRES_PORT', os.getenv('DATABASE_PORT', '5432')),
        }
    }

# Use Redis cache for tests (required by django_ratelimit)
# CI environment provides Redis service
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        'KEY_PREFIX': 'qjudge_test',
        'TIMEOUT': 300,
    }
}

# Disable ratelimit system checks in test (still functional, just no E003 error)
SILENCED_SYSTEM_CHECKS = ['django_ratelimit.E003', 'django_ratelimit.W001']

# Faster password hashing for tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Redis
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# Celery
CELERY_TASK_ALWAYS_EAGER = True  # 同步執行 Celery 任務（測試用）
CELERY_TASK_EAGER_PROPAGATES = True

# Judge Engine - 在測試環境中啟用
JUDGE_ENGINE_ENABLED = True
JUDGE_MAX_CPU_TIME = 10
JUDGE_MAX_MEMORY = 256

# Docker Judge Settings for Testing
# 使用環境變數或預設值
DOCKER_IMAGE_JUDGE = os.getenv('DOCKER_IMAGE_JUDGE', 'oj-judge:latest')
DOCKER_JUDGE_PIDS_LIMIT = int(os.getenv('DOCKER_JUDGE_PIDS_LIMIT', '64'))
DOCKER_JUDGE_TMPFS_SIZE = os.getenv('DOCKER_JUDGE_TMPFS_SIZE', '100M')
DOCKER_JUDGE_TIMEOUT = int(os.getenv('DOCKER_JUDGE_TIMEOUT', '60'))

# Seccomp (Optional in tests)
DOCKER_SECCOMP_PROFILE = os.getenv('DOCKER_SECCOMP_PROFILE', None)

# 允許任何 host（測試用）
ALLOWED_HOSTS = ['*']

# 靜態檔案
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Email backend for testing
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# 日誌級別
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'apps.judge': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}
