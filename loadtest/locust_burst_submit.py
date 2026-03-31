"""Locust entrypoint for burst submit only."""
from users.burst import BurstSubmitUser  # noqa: F401
from safety import enforce_safety_limits  # noqa: F401
