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

# --- Object storage / Anticheat ---
OBJECT_STORAGE_ENDPOINT_URL = os.getenv("OBJECT_STORAGE_ENDPOINT_URL", "")
# For Locust / browser direct PUT.
OBJECT_STORAGE_PUBLIC_ENDPOINT_URL = os.getenv(
    "OBJECT_STORAGE_PUBLIC_ENDPOINT_URL",
    OBJECT_STORAGE_ENDPOINT_URL,
)
OBJECT_STORAGE_ACCESS_KEY = os.getenv("OBJECT_STORAGE_ACCESS_KEY", "")
OBJECT_STORAGE_SECRET_KEY = os.getenv("OBJECT_STORAGE_SECRET_KEY", "")
OBJECT_STORAGE_REGION = os.getenv("OBJECT_STORAGE_REGION", "auto")

ANTICHEAT_RAW_BUCKET = os.getenv("ANTICHEAT_RAW_BUCKET", "anticheat-raw")
