"""
Test settings for CI/CD environments
"""
from .base import *
import os

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

SECRET_KEY = 'test-secret-key-not-for-production'

# Test database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DATABASE_NAME', 'test_oj'),
        'USER': os.getenv('POSTGRES_USER', os.getenv('DATABASE_USER', 'test_user')),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD', os.getenv('DATABASE_PASSWORD', 'test_password')),
        'HOST': os.getenv('POSTGRES_HOST', os.getenv('DB_HOST', 'localhost')),
        'PORT': os.getenv('DATABASE_PORT', '5432'),
    }
}

# Use in-memory cache for tests
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

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
