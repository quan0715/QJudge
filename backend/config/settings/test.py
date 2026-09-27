"""
Test settings for CI/CD environments
"""
from .base import *
import os
from config.env import env

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

SECRET_KEY = 'test-secret-key-not-for-production'


# The test database comes from DATABASE_URL, parsed in base.

# Unit tests mock storage and need a bucket name; the E2E stack sets a real one.
OBJECT_STORAGE_BUCKET = OBJECT_STORAGE_BUCKET or "qjudge-test"

# Use Redis cache for tests (required by django_ratelimit)
# CI environment provides Redis service
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': env('REDIS_URL', 'redis://localhost:6379/0'),
        'KEY_PREFIX': 'qjudge_test',
        'TIMEOUT': 300,
    }
}

# Disable ratelimit system checks in test (still functional, just no E003 error)
SILENCED_SYSTEM_CHECKS = ['django_ratelimit.E003', 'django_ratelimit.W001']

# Disable ratelimit in tests to prevent 403 errors
RATELIMIT_ENABLE = False

# DRF UserRateThrottle（base 預設 120/min）易與 pytest / Playwright E2E 撞 429，測試 settings 關閉。
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}

# Faster password hashing for tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Redis
REDIS_URL = env('REDIS_URL', 'redis://localhost:6379/0')

# Celery
# Unit tests default to eager; browser E2E can exercise the real worker queues.
CELERY_TASK_ALWAYS_EAGER = env("CELERY_TASK_ALWAYS_EAGER", "true").lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = True

# Judge Engine - 在測試環境中啟用
JUDGE_ENGINE_ENABLED = True
JUDGE_MAX_CPU_TIME = 10
JUDGE_MAX_MEMORY = 256

# Docker Judge Settings for Testing
# 使用環境變數或預設值
DOCKER_IMAGE_JUDGE = env('DOCKER_IMAGE_JUDGE', 'oj-judge:latest')
DOCKER_JUDGE_PLATFORM = env('DOCKER_JUDGE_PLATFORM') or None
DOCKER_JUDGE_PIDS_LIMIT = int(env('DOCKER_JUDGE_PIDS_LIMIT', '64'))
DOCKER_JUDGE_TMPFS_SIZE = env('DOCKER_JUDGE_TMPFS_SIZE', '100M')
DOCKER_JUDGE_TIMEOUT = int(env('DOCKER_JUDGE_TIMEOUT', '60'))

# Seccomp (Optional in tests)
DOCKER_SECCOMP_PROFILE = env('DOCKER_SECCOMP_PROFILE', None)

# 允許任何 host（測試用）
ALLOWED_HOSTS = ['*']

# The public origin (the E2E stack's frontend) plus local dev servers.
CSRF_TRUSTED_ORIGINS = [
    FRONTEND_URL,
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

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

# Tests state their own provider connections; the shipped catalog would otherwise
# leak whichever OAuth credentials the surrounding environment happens to define.
QAUTH_PROVIDER_CONNECTIONS_JSON = "[]"
