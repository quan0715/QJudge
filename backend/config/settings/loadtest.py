"""
Load test settings - inherits from test.py with key differences:
- Real async Celery (not ALWAYS_EAGER)
- Rate limiting enabled
- S3-compatible anticheat storage configured
"""
from .test import *  # noqa: F401, F403
import os

# --- Celery: real async workers (test.py defaults to ALWAYS_EAGER) ---
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = False

# --- Rate limiting enabled (test real throttle behaviour) ---
RATELIMIT_ENABLE = True

# test.py 關閉 DRF throttle；負載測試需還原 base 行為。
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
    ],
}

# Disable only login IP ratelimit in loadtest by default to avoid test data pollution.
LOADTEST_DISABLE_LOGIN_RATELIMIT = os.getenv(
    "LOADTEST_DISABLE_LOGIN_RATELIMIT", "1"
) == "1"

# --- Object storage / Anticheat (pointing to minio-test container by default) ---
OBJECT_STORAGE_ENDPOINT_URL = os.getenv(
    "OBJECT_STORAGE_ENDPOINT_URL",
    "http://minio-test:9000",
)
# For Locust / browser direct PUT — local: http://localhost:9002
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL = os.getenv(
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    "http://localhost:9002",
)
OBJECT_STORAGE_ACCESS_KEY = os.getenv("OBJECT_STORAGE_ACCESS_KEY", "minioadmin")
OBJECT_STORAGE_SECRET_KEY = os.getenv("OBJECT_STORAGE_SECRET_KEY", "minioadmin")
OBJECT_STORAGE_REGION = os.getenv("OBJECT_STORAGE_REGION", "us-east-1")

ANTICHEAT_RAW_BUCKET = os.getenv("ANTICHEAT_RAW_BUCKET", "anticheat-raw")
