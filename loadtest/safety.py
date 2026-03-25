"""Shared safety checks for Locust load tests."""
import os

from locust import events


@events.test_start.add_listener
def enforce_safety_limits(environment, **kwargs):
    """
    Prevent accidental high-risk runs unless explicitly acknowledged.
    """
    options = environment.parsed_options
    tags = set(options.tags or [])
    user_class_names = {uc.__name__ for uc in (environment.user_classes or [])}
    is_burst = any(tag.startswith("burst") for tag in tags) or any(
        name.startswith("Burst") for name in user_class_names
    )

    # 200 users in burst mode must be explicit to avoid accidental production-like blast.
    if is_burst and (options.spawn_rate or 0) >= 120:
        allow = os.getenv("LT_ALLOW_HIGH_RISK_BURST", "0")
        if allow != "1":
            raise RuntimeError(
                "Blocked high-risk burst run (spawn-rate >= 120). "
                "Set LT_ALLOW_HIGH_RISK_BURST=1 to confirm intentionally."
            )
