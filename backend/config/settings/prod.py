"""
Production settings
"""
import os
from .base import *

DEBUG = os.getenv('DEBUG', 'False') == 'True'

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

# =============================================================================
# Production Database Configuration
# =============================================================================
# In production, we use Cloud (Supabase) as the primary database by default.
# Set USE_LOCAL_DB=True to use local database instead.

USE_LOCAL_DB = os.getenv('USE_LOCAL_DB', 'False') == 'True'

if USE_LOCAL_DB:
    # Use local Docker PostgreSQL
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'online_judge'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('DB_HOST', 'postgres'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'CONN_MAX_AGE': 60,
        'OPTIONS': {
            'connect_timeout': 10,
        },
    }
else:
    # Use Cloud (Supabase) PostgreSQL
    # Supabase Pooler 連接優化設置
    # 
    # 重要: Supabase 有兩種 Pooler 模式:
    #
    # 1. Transaction Mode (port 6543) - 推薦！
    #    - 每個 transaction 後連接回到池，支援更多併發連接
    #    - CONN_MAX_AGE 必須設為 0（每次請求後釋放連接）
    #    - 不支援 prepared statements，但對大多數應用沒影響
    #
    # 2. Session Mode (port 5432) - 不推薦用於多 worker 場景
    #    - 連接數受限於 pool_size（通常 15-20）
    #    - 使用 CONN_MAX_AGE=None 會讓每個 worker 佔用一個連接
    #    - 容易出現 "MaxClientsInSessionMode: max clients reached" 錯誤
    #
    # 預設使用 Transaction Mode (CONN_MAX_AGE=0)
    
    conn_max_age_str = os.getenv('CLOUD_DB_CONN_MAX_AGE', '0')
    if conn_max_age_str.lower() == 'none':
        conn_max_age = None  # 持久連接 (僅適用於直連或 Session Mode 少量連接)
    else:
        conn_max_age = int(conn_max_age_str)
    
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('CLOUD_DB_NAME', 'postgres'),
        'USER': os.getenv('CLOUD_DB_USER', ''),
        'PASSWORD': os.getenv('CLOUD_DB_PASSWORD', ''),
        'HOST': os.getenv('CLOUD_DB_HOST', ''),
        'PORT': os.getenv('CLOUD_DB_PORT', '5432'),
        'CONN_MAX_AGE': conn_max_age,
        'OPTIONS': {
            'connect_timeout': 5,
            # TCP Keepalive 設置 - 保持連接活躍，防止被防火牆/NAT 中斷
            'keepalives': 1,
            'keepalives_idle': 30,      # 30 秒無活動後開始發送 keepalive
            'keepalives_interval': 10,  # 每 10 秒發送一次 keepalive
            'keepalives_count': 5,      # 5 次無回應後視為斷線
            # SSL 設置 (Supabase 需要 SSL)
            'sslmode': os.getenv('CLOUD_DB_SSLMODE', 'require'),
        },
    }

# Keep local database as backup target (optional)
if os.getenv('BACKUP_DB_HOST'):
    DATABASES['backup'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('BACKUP_DB_NAME', 'online_judge'),
        'USER': os.getenv('BACKUP_DB_USER', 'postgres'),
        'PASSWORD': os.getenv('BACKUP_DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('BACKUP_DB_HOST', 'postgres'),
        'PORT': os.getenv('BACKUP_DB_PORT', '5432'),
    }

# Disable database router in production (always use default)
DATABASE_ROUTERS = []

# Security settings
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# HSTS settings
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Email backend for production
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')

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
    },
}

# CORS settings
# CORS settings
CORS_ALLOWED_ORIGINS = [origin.strip('/') for origin in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if origin]
if os.getenv('FRONTEND_URL'):
    CORS_ALLOWED_ORIGINS.append(os.getenv('FRONTEND_URL').strip('/'))

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = [origin.strip('/') for origin in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if origin]
if os.getenv('FRONTEND_URL'):
    CSRF_TRUSTED_ORIGINS.append(os.getenv('FRONTEND_URL').strip('/'))


