"""Locust entrypoint for burst start only."""
from users.burst import BurstStartUser  # noqa: F401
from safety import enforce_safety_limits  # noqa: F401
