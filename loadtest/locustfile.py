"""
Locust entrypoint — imports all User classes.

Usage:
  # Smoke test (headless, 5 users)
  locust -f locustfile.py --users 5 --spawn-rate 5 --run-time 2m --headless --host http://localhost:8002

  # Full ramp-up with Web UI
  locust -f locustfile.py --host http://localhost:8002

  # Burst tests
  locust -f locustfile.py --tags burst-start --users 200 --spawn-rate 200 --headless --host http://localhost:8002
"""
import os

from locust import events

# Main exam lifecycle user
from users.exam_student import ExamStudentUser  # noqa: F401

# Burst test users (use --tags to select)
from users.burst import BurstStartUser, BurstSubmitUser, BurstEndUser  # noqa: F401

# Stepped load shape (auto ramp-up) — uncomment to enable
# from shapes import SteppedLoadShape  # noqa: F401


@events.test_start.add_listener
def enforce_safety_limits(environment, **kwargs):
    """
    Prevent accidental high-risk runs unless explicitly acknowledged.
    """
    options = environment.parsed_options
    tags = set(options.tags or [])
    is_burst = any(tag.startswith("burst") for tag in tags)

    # 200 users in burst mode must be explicit to avoid accidental production-like blast.
    if is_burst and (options.spawn_rate or 0) >= 120:
        allow = os.getenv("LT_ALLOW_HIGH_RISK_BURST", "0")
        if allow != "1":
            raise RuntimeError(
                "Blocked high-risk burst run (spawn-rate >= 120). "
                "Set LT_ALLOW_HIGH_RISK_BURST=1 to confirm intentionally."
            )
