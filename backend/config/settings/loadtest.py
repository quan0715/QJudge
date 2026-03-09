"""
Load test settings — inherits from test.py with key differences:
- Real async Celery (not ALWAYS_EAGER)
- Rate limiting enabled
- MinIO/S3 anticheat storage configured
"""
from .test import *  # noqa: F401, F403
import os

# --- Celery: real async workers (test.py defaults to ALWAYS_EAGER) ---
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False

# --- Rate limiting enabled (test real throttle behaviour) ---
RATELIMIT_ENABLE = True

# --- MinIO / Anticheat (pointing to minio-test container) ---
ANTICHEAT_S3_ENDPOINT_URL = os.getenv(
    'ANTICHEAT_S3_ENDPOINT_URL', 'http://minio-test:9000'
)
# For Locust / browser direct PUT — local: http://localhost:9002
ANTICHEAT_S3_PUBLIC_ENDPOINT_URL = os.getenv(
    'ANTICHEAT_S3_PUBLIC_ENDPOINT_URL', 'http://localhost:9002'
)
ANTICHEAT_S3_ACCESS_KEY = os.getenv('ANTICHEAT_S3_ACCESS_KEY', 'minioadmin')
ANTICHEAT_S3_SECRET_KEY = os.getenv('ANTICHEAT_S3_SECRET_KEY', 'minioadmin')
ANTICHEAT_S3_REGION = os.getenv('ANTICHEAT_S3_REGION', 'us-east-1')
ANTICHEAT_S3_BUCKET = os.getenv('ANTICHEAT_S3_BUCKET', 'anticheat')
