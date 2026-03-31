"""Locust entrypoint for burst end only."""
from users.burst import BurstEndUser  # noqa: F401
from safety import enforce_safety_limits  # noqa: F401
