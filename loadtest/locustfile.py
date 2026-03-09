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

# Main exam lifecycle user
from users.exam_student import ExamStudentUser  # noqa: F401

# Burst test users (use --tags to select)
from users.burst import BurstStartUser, BurstSubmitUser, BurstEndUser  # noqa: F401

# Stepped load shape (auto ramp-up) — uncomment to enable
# from shapes import SteppedLoadShape  # noqa: F401
